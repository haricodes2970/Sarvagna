# Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        BROWSER (Student)                        │
│              React 19 + TypeScript + Vite (port 5173)           │
└───────────────────────────────┬─────────────────────────────────┘
                                │ HTTP (Axios + JWT)
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                    FASTAPI BACKEND (port 8000)                   │
│                                                                  │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────────────────┐ │
│  │  /auth   │ │/subjects │ │  /chat   │ │      /query        │ │
│  └──────────┘ └──────────┘ └──────────┘ └────────────────────┘ │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────────────────┐ │
│  │/progress │ │  /map    │ │/modulemap│ │/important-questions│ │
│  └──────────┘ └──────────┘ └──────────┘ └────────────────────┘ │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                       AI AGENTS                          │    │
│  │  scraper_agent → chunker_agent → teacher_agent           │    │
│  │  roadmap_agent (XP/badges)  orchestrator (caching)       │    │
│  └─────────────────────────────────────────────────────────┘    │
└──────┬──────────────┬──────────────┬──────────────┬─────────────┘
       │              │              │              │
       ▼              ▼              ▼              ▼
  ┌─────────┐   ┌─────────┐   ┌─────────┐   ┌──────────────┐
  │Postgres │   │  Redis  │   │ Qdrant  │   │ External APIs│
  │(port    │   │(port    │   │(port    │   │              │
  │ 5432)   │   │ 6379)   │   │ 6333)   │   │ Groq LLM     │
  │         │   │         │   │         │   │ Ollama embed  │
  │Users    │   │Q&A cache│   │Vectors  │   │ Wikipedia     │
  │Subjects │   │Map cache│   │Text     │   │ DuckDuckGo    │
  │Chat     │   │Rate lim.│   │chunks   │   │ Google OAuth  │
  │Progress │   │         │   │         │   │              │
  └─────────┘   └─────────┘   └─────────┘   └──────────────┘
```

---

## Service Responsibilities

| Service | Technology | Purpose |
|---------|-----------|---------|
| **Frontend** | React 19, Vite, Zustand, Tailwind | Student-facing UI |
| **Backend** | FastAPI, Python 3.11+, SQLAlchemy async | REST API + AI orchestration |
| **PostgreSQL** | postgres:16 (Docker) | Persistent data (users, subjects, chat, progress) |
| **Redis** | redis:7 (Docker) | Q&A response cache, map cache, rate limiting |
| **Qdrant** | qdrant:latest (Docker) | Vector storage for RAG (text chunks + question embeddings) |
| **Ollama** | Local process | Embedding generation (nomic-embed-text, 768-dim) |
| **Groq** | Cloud API | LLM inference (llama-3.3-70b-versatile) |
| **Wikipedia API** | External | Primary content source for scraping |
| **DuckDuckGo** | External | Fallback search for VTU-specific notes |

---

## Folder Structure

```
sarvagna/
├── backend/
│   ├── agents/
│   │   ├── scraper_agent.py        # Wikipedia + DDG scraping
│   │   ├── chunker_agent.py        # Tokenize + embed + Qdrant store
│   │   ├── teacher_agent.py        # RAG + Groq teaching
│   │   ├── orchestrator.py         # Q&A pipeline + XP pipeline
│   │   └── roadmap_agent.py        # XP, badges, streaks, levels
│   ├── api/routes/
│   │   ├── auth.py                 # Register, login, Google OAuth
│   │   ├── subjects.py             # Subject CRUD + auto-scrape
│   │   ├── chat.py                 # Teaching chat session
│   │   ├── query.py                # Q&A with gamification
│   │   ├── progress.py             # Module completion + XP
│   │   ├── map.py                  # Module map (nodes + edges)
│   │   ├── modulemap.py            # Topic hierarchy per module
│   │   ├── mapgraph.py             # Groq-generated fantasy map layout
│   │   ├── mapselection.py         # Static map image selection
│   │   └── important_questions.py  # Professor's important questions
│   ├── core/
│   │   ├── config.py               # Pydantic settings (env vars)
│   │   ├── database.py             # Async SQLAlchemy engine + session
│   │   └── gamification.py         # XP/level/badge config constants
│   ├── models/
│   │   └── db_models.py            # SQLAlchemy ORM models
│   ├── services/
│   │   ├── syllabus_loader.py      # Load VTU syllabus JSON
│   │   └── groq_map_placer.py      # Generate fantasy map with Groq
│   ├── data/syllabus/
│   │   ├── aiml_syllabus.json      # AIML 2022 scheme syllabus
│   │   └── index.json              # Branch/semester index
│   ├── main.py                     # FastAPI app + CORS + router mounts
│   ├── create_tables.py            # DB table bootstrap script
│   └── .env                        # Secrets (never commit)
├── frontend/
│   ├── src/
│   │   ├── pages/                  # One file per route
│   │   ├── components/             # Shared UI components
│   │   ├── lib/
│   │   │   ├── api.ts              # All API calls (Axios)
│   │   │   └── utils.ts            # Helpers
│   │   ├── store/
│   │   │   └── authStore.ts        # Zustand auth state
│   │   └── App.tsx                 # Routes + auth guard
│   └── package.json
├── docs/                           # You are here
└── docker-compose.yml              # Postgres + Redis + Qdrant
```

---

## Request Lifecycle (Chat Message)

```
1. Student types message → ChatPage.tsx
2. POST /api/v1/chat/{subject_id}/{module_number}
3. FastAPI validates JWT → gets current user
4. Saves user message to PostgreSQL (ChatMessage table)
5. Fetches last 20 messages from DB (context window)
6. Calls teacher_agent.teach_module()
   a. Embeds message via Ollama (768-dim vector)
   b. Searches Qdrant: {subject}_module_{n} collection
   c. Also searches: important_{subject_id} collection
   d. Builds system prompt + context + history + message
   e. Calls Groq llama-3.3-70b → returns markdown
   f. Appends image URLs in <!-- SARVAGNA_IMAGES --> block
7. Saves AI response to PostgreSQL
8. Returns both messages to frontend
9. Frontend renders markdown + ASCII diagrams + images
```

---

## Background Scrape Lifecycle

```
1. Student adds subject → POST /subjects/add
2. FastAPI creates Subject row in DB
3. FastAPI calls asyncio.gather() — scrapes all 5 modules in parallel
4. For each module (1-5):
   a. scraper_agent.scrape_subject()
      → Wikipedia API search
      → Extract plaintext (up to 12,000 chars)
      → DDG search → fetch pages → extract text + images
   b. chunker_agent.chunk_and_store()
      → Split into 512-token chunks (50-token overlap)
      → Embed each chunk via Ollama
      → Upsert to Qdrant: {subject_slug}_module_{n}
      → Store image URLs in first chunk payload
   c. Atomic DB UPDATE: modules_scraped = modules_scraped + 1
5. Frontend polls /subjects every 8s, shows progress banner
6. Banner turns green when modules_scraped >= 5
```
