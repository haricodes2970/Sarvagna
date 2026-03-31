# API Reference

**Base URL:** `http://localhost:8000/api/v1`
**Auth:** All endpoints except `/auth/register`, `/auth/login`, `/auth/google*` require:
`Authorization: Bearer <jwt_token>`

---

## Auth Routes

### POST `/auth/register`
Create a new account.

**Request:**
```json
{
  "email": "student@example.com",
  "name": "Hari",
  "password": "mypassword"
}
```
**Response:**
```json
{
  "access_token": "<jwt>",
  "token_type": "bearer"
}
```

---

### POST `/auth/login`
Login with email + password.

**Request:**
```json
{
  "email": "student@example.com",
  "password": "mypassword"
}
```
**Response:**
```json
{
  "access_token": "<jwt>",
  "token_type": "bearer"
}
```

---

### GET `/auth/me`
Get current user profile.

**Response:**
```json
{
  "id": "uuid",
  "email": "student@example.com",
  "name": "Hari",
  "xp": 158,
  "level": 2,
  "streak": 3,
  "created_at": "2026-03-31T00:00:00Z"
}
```

---

### GET `/auth/google`
Redirect to Google OAuth consent screen. No body needed.

### GET `/auth/google/callback?code=...`
Google redirects here after login. Returns JWT same as login.

---

## Subjects Routes

### GET `/subjects`
List all subjects for the logged-in user.

**Response:**
```json
[
  {
    "id": "uuid",
    "name": "Natural Language Processing",
    "branch": "AIML",
    "semester": 6,
    "modules_scraped": 5,
    "is_completed": false,
    "added_at": "2026-03-31T00:00:00Z"
  }
]
```

---

### POST `/subjects/add`
Add a new subject. Triggers auto-scrape of all 5 modules in background.

**Request:**
```json
{
  "name": "Natural Language Processing",
  "branch": "AIML",
  "semester": 6
}
```
**Response:** Same shape as GET item, plus `scraping: "started"`.

**Errors:**
- `400` — Already have 10 subjects (max limit)
- `400` — Subject already added

---

### DELETE `/subjects/{subject_id}`
Remove a subject and all its data. Cascades to chat, progress, important questions.

**Response:** `204 No Content`

---

### POST `/subjects/{subject_id}/scrape`
Manually trigger scraping (re-scrape).

**Response:**
```json
{
  "message": "Scraping started for 'NLP'"
}
```

---

### GET `/subjects/catalog?branch=AIML&semester=6`
Get list of subjects from the VTU syllabus for a given branch and semester. Used in the Add Subject dropdown.

**Response:**
```json
{
  "branch": "AIML",
  "semester": 6,
  "subjects": [
    "Natural Language Processing",
    "Machine Learning",
    "Human-Centred AI",
    "Cloud Computing and Security",
    "Blockchain Technology",
    "Time Series Analysis"
  ]
}
```

---

## Chat Routes

### GET `/chat/{subject_id}/{module_number}?page=1`
Get chat history for a subject module. Paginated (20 messages per page).

**Response:**
```json
{
  "messages": [
    {
      "id": "uuid",
      "role": "user",
      "content": "Teach me POS tagging",
      "created_at": "2026-03-31T07:00:00Z"
    },
    {
      "id": "uuid",
      "role": "assistant",
      "content": "## 📘 Topic: POS Tagging\n\n...",
      "created_at": "2026-03-31T07:00:01Z"
    }
  ],
  "total": 2,
  "page": 1
}
```

**Module number 0** = full-subject chat (searches all modules).

---

### POST `/chat/{subject_id}/{module_number}`
Send a message. AI responds with structured teaching content.

**Request:**
```json
{
  "content": "Explain bigram model"
}
```
**Response:**
```json
{
  "user_message": {
    "id": "uuid",
    "role": "user",
    "content": "Explain bigram model",
    "created_at": "..."
  },
  "assistant_message": {
    "id": "uuid",
    "role": "assistant",
    "content": "## 📘 Topic: Bigram Model\n\n> 🎯 **Exam Weightage:** ...\n\n...",
    "created_at": "..."
  }
}
```

Images (if scraped) are embedded at the end of content in:
```
<!-- SARVAGNA_IMAGES -->
https://example.com/img1.jpg
https://example.com/img2.jpg
<!-- /SARVAGNA_IMAGES -->
```
The frontend strips this block and renders images separately.

---

## Query Routes (Q&A with Gamification)

### POST `/query`
Ask a question about a subject. Returns structured answer + XP reward.

**Request:**
```json
{
  "question": "What is tokenization in NLP?",
  "subject_id": "uuid"
}
```
**Response:**
```json
{
  "exact_answer": "Tokenization is the process of splitting text into tokens...",
  "simplified_answer": "Think of it like cutting a sentence into individual words...",
  "real_world_example": "Like how your phone autocomplete breaks typed text into words...",
  "xp_earned": 8,
  "new_xp": 166,
  "level": 2,
  "level_name": "Jigyasa",
  "leveled_up": false,
  "badges_unlocked": [],
  "cached": false
}
```

**Rate limit:** 10 queries/day per user. Returns `429` when exceeded.

---

### GET `/query/history`
All past Q&A for the logged-in user.

**Response:**
```json
[
  {
    "id": "uuid",
    "question": "What is tokenization?",
    "exact_answer": "...",
    "simplified_answer": "...",
    "real_world_example": "...",
    "subject_name": "Natural Language Processing",
    "created_at": "..."
  }
]
```

---

## Progress Routes

### GET `/progress`
Get XP, level, streak, and badges for the current user.

**Response:**
```json
{
  "user_id": "uuid",
  "xp": 166,
  "level": 2,
  "level_name": "Jigyasa",
  "xp_to_next_level": 134,
  "streak": 3,
  "badges": [
    {
      "id": "first_login",
      "name": "First Step",
      "description": "Complete first login"
    }
  ]
}
```

---

### GET `/progress/roadmap/{subject_id}`
Get module completion status for a subject.

**Response:**
```json
{
  "subject_id": "uuid",
  "subject_name": "Natural Language Processing",
  "total_modules": 5,
  "completed_modules": 2,
  "completion_percentage": 40.0,
  "modules": [
    { "module_number": 1, "is_completed": true, "completed_at": "..." },
    { "module_number": 2, "is_completed": true, "completed_at": "..." },
    { "module_number": 3, "is_completed": false, "completed_at": null }
  ]
}
```

---

### POST `/progress/module/complete`
Mark a module as completed. Awards 50 XP.

**Request:**
```json
{
  "subject_id": "uuid",
  "module_number": 1
}
```
**Response:**
```json
{
  "xp_earned": 50,
  "new_xp": 216,
  "level": 2,
  "level_name": "Jigyasa",
  "leveled_up": false,
  "module_number": 1,
  "subject_id": "uuid"
}
```

---

## Important Questions Routes

### POST `/important-questions/{subject_id}`
Upload a numbered/bulleted list of professor questions. Auto-parsed and embedded.

**Request:**
```json
{
  "text": "1. Explain POS tagging.\n2. What is tokenization?\n3. Explain bigram model.",
  "module_number": 1
}
```
**Response:**
```json
{
  "count": 3,
  "questions": [
    "Explain POS tagging.",
    "What is tokenization?",
    "Explain bigram model."
  ]
}
```

Parser handles:
- `1. Question` / `1) Question` / `Q1. Question`
- Multi-line questions are joined together
- Bullet points (`-`, `•`, `*`)

---

### GET `/important-questions/{subject_id}`
List all saved important questions for a subject.

**Response:**
```json
[
  {
    "id": "uuid",
    "question": "Explain POS tagging.",
    "module_number": 1,
    "created_at": "2026-03-31T00:00:00Z"
  }
]
```

---

### DELETE `/important-questions/{subject_id}/{question_id}`
Delete a single important question.

**Response:** `204 No Content`

---

## Map Routes

### GET `/map/{subject_id}`
Get the module map (game map nodes + edges).

**Response:**
```json
{
  "subject_id": "uuid",
  "subject_name": "NLP",
  "nodes": [
    {
      "id": "1",
      "label": "Module 1: Introduction to NLP",
      "status": "completed",
      "xp": 50
    },
    {
      "id": "2",
      "label": "Module 2: Language Models",
      "status": "current",
      "xp": 50
    },
    {
      "id": "3",
      "label": "Module 3: Syntax Analysis",
      "status": "locked",
      "xp": 50
    }
  ],
  "edges": [
    { "source": "1", "target": "2" },
    { "source": "2", "target": "3" }
  ]
}
```

Status logic:
- `completed` — has Progress record with `is_completed = true`
- `current` — first non-completed module
- `locked` — all modules after current

---

### GET `/modulemap/{subject_id}/{module_number}`
Get topic list for a module with inferred completion status.

**Response:**
```json
{
  "module_number": 1,
  "title": "Introduction to NLP",
  "topics": [
    { "title": "Introduction to NLP and its applications", "status": "completed" },
    { "title": "NLP pipeline overview", "status": "completed" },
    { "title": "Regular expressions and text normalization", "status": "current" },
    { "title": "Tokenization, stemming and lemmatization", "status": "locked" },
    { "title": "Part-of-speech tagging and named entity recognition", "status": "locked" }
  ]
}
```

Status inferred by parsing `## 📘 Topic:` headers in chat history.

---

### GET `/mapgraph/{subject_id}/{module_number}`
Get Groq-generated fantasy map layout for the module.

**Response:**
```json
{
  "layout": {
    "capital": { "name": "NLP Citadel", "x": 50, "y": 50, "topic": "Introduction to NLP" },
    "cities": [...],
    "villages": [...],
    "roads": [...]
  },
  "selected_map": "map3",
  "map_image": "/maps/map3.jpg"
}
```

Cached in Redis for 24 hours.

---

### GET `/mapselection/{subject_id}/{module_number}`
### POST `/mapselection/{subject_id}/{module_number}`
Get or set which static map image is used for a module.

**POST Request:**
```json
{ "map_id": "map2" }
```
Valid map IDs: `map1` through `map6`.
