# Database

Sarvagna uses two databases: **PostgreSQL** for persistent relational data and **Qdrant** for vector embeddings.

---

## PostgreSQL Tables

All models are in `backend/models/db_models.py`. All PKs are UUIDs. All timestamps are timezone-aware.

---

### `users`

Stores all registered users.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | Auto-generated |
| `email` | String | Unique, required |
| `name` | String | Display name |
| `google_id` | String | Unique, nullable. For Google users: Google sub ID. For email/password users: `local:<bcrypt_hash>` |
| `xp` | Integer | Defaults to 0 |
| `level` | Integer | Defaults to 1 (recalculated on XP change) |
| `streak` | Integer | Consecutive login days |
| `last_login` | Timestamp | Updated on login, used for streak calculation |
| `created_at` | Timestamp | Auto-set |

**Relationships:**
- One user → many subjects (CASCADE delete)
- One user → many queries (CASCADE delete)
- One user → many progress records (CASCADE delete)
- One user → many chat messages (CASCADE delete)

---

### `subjects`

A subject a student is studying (e.g. "Natural Language Processing, AIML Sem 6").

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `user_id` | UUID FK → users.id | CASCADE delete |
| `name` | String | e.g. "Natural Language Processing" |
| `branch` | String | e.g. "AIML", "CSE" |
| `semester` | Integer | e.g. 6 |
| `modules_scraped` | Integer | 0–5, incremented per module after scraping |
| `is_completed` | Boolean | True when all 5 modules completed by student |
| `added_at` | Timestamp | |

**Relationships:**
- One subject → many queries
- One subject → many progress records
- One subject → many chat messages
- One subject → many important questions
- One subject → one module image record

**Max per user:** 10 (enforced at API level)

---

### `queries`

Each Q&A question a student asked (not chat — this is the separate Q&A panel).

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `user_id` | UUID FK → users.id | |
| `subject_id` | UUID FK → subjects.id | |
| `question` | Text | Student's question |
| `exact_answer` | Text | Groq-generated precise answer |
| `simplified_answer` | Text | Groq-generated simple explanation |
| `real_world_example` | Text | Groq-generated analogy |
| `created_at` | Timestamp | |

---

### `progress`

Tracks module completion per student per subject.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `user_id` | UUID FK → users.id | |
| `subject_id` | UUID FK → subjects.id | |
| `module_number` | Integer | 1–5 |
| `is_completed` | Boolean | |
| `completed_at` | Timestamp | Nullable, set when completed |

One row per module per subject per user. Created on first `/progress/module/complete` call.

---

### `chat_messages`

All messages in teaching sessions.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `user_id` | UUID FK → users.id | |
| `subject_id` | UUID FK → subjects.id | |
| `module_number` | Integer | 0 = full-subject chat, 1–5 = specific module |
| `role` | String | `"user"` or `"assistant"` |
| `content` | Text | Full markdown content |
| `created_at` | Timestamp | |

The last 20 messages are loaded as context for each AI response.

---

### `important_questions`

Professor-marked questions uploaded by the student.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `user_id` | UUID FK → users.id | |
| `subject_id` | UUID FK → subjects.id | |
| `question` | Text | The question text |
| `module_number` | Integer | 0 = general, 1–5 = specific module |
| `created_at` | Timestamp | |

These are also stored in Qdrant (`important_{subject_id}` collection) for RAG injection during teaching.

---

### `module_images`

Stores which fantasy map image is selected per subject per module.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `subject_id` | UUID FK → subjects.id | |
| `module_number` | Integer | |
| `image_url` | String | (reserved, not used) |
| `selected_map` | String | `"map1"` through `"map6"` |
| `generated_at` | Timestamp | |

---

## Qdrant Collections

Qdrant is a vector database used for RAG (Retrieval-Augmented Generation).

### Collection naming

| Collection name | Contents |
|----------------|---------|
| `{subject_slug}_module_{n}` | Text chunks from module n of subject |
| `important_{subject_id}` | Embedded professor questions |

`subject_slug` is the subject name lowercased with non-alphanumeric characters replaced by `_`.

Examples:
- `natural_language_processing_module_1`
- `machine_learning_module_3`
- `important_f929440f-b924-4d10-81d2-9cfeafa537a5`

---

### Text chunk collection schema

Each point in `{subject}_module_{n}`:

| Field | Type | Notes |
|-------|------|-------|
| `id` | Integer | Chunk index (0, 1, 2, ...) |
| `vector` | float[768] | nomic-embed-text embedding |
| `payload.text` | String | The text chunk (512 tokens) |
| `payload.subject` | String | Subject name |
| `payload.module` | Integer | Module number |
| `payload.chunk_index` | Integer | Position in document |
| `payload.image_urls` | String[] | Only on chunk 0 — scraped images from web |

---

### Important questions collection schema

Each point in `important_{subject_id}`:

| Field | Type | Notes |
|-------|------|-------|
| `id` | UUID string | |
| `vector` | float[768] | nomic-embed-text embedding of question |
| `payload.question` | String | The question text |
| `payload.subject_id` | String | Subject UUID |
| `payload.module_number` | Integer | Module association |

---

## Database Initialization

```bash
cd sarvagna/backend
python create_tables.py
```

This runs `Base.metadata.create_all()` — creates all tables if they don't exist. Safe to run multiple times.

---

## Entity Relationship Diagram

```
users
  │
  ├──< subjects
  │       │
  │       ├──< queries
  │       ├──< progress
  │       ├──< chat_messages
  │       ├──< important_questions
  │       └──< module_images
  │
  ├──< queries
  ├──< progress
  └──< chat_messages
```

All foreign keys cascade on delete (delete user → deletes all their data).
