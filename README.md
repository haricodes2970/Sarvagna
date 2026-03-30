# Sarvagna

AI-powered VTU engineering study platform.

## Stack

- **Backend**: FastAPI + PostgreSQL + Redis + Qdrant + Groq (llama-3.3-70b)
- **Frontend**: React 19 + Vite + TypeScript + Tailwind CSS v3 + React Flow
- **Infra**: Docker Compose, Celery workers

---

## Quick Start

### 1. Start infrastructure

```bash
docker compose up -d
```

Services:
- PostgreSQL on port `5433`
- Redis on port `6380`
- Qdrant on port `6333`

### 2. Backend

```bash
cd sarvagna/backend
pip install -r requirements.txt
python -m playwright install chromium

# Create .env (copy from .env.example)
cp .env.example .env  # fill in GROQ_API_KEY, APIFY_API_KEY etc.

# Create tables
python create_tables.py

# Start API server
python -m uvicorn main:app --reload --port 8000
```

API available at: `http://localhost:8000/docs`

### 3. Celery worker (background scraping)

```bash
cd sarvagna/backend
celery -A tasks worker --loglevel=info
```

The worker picks up `scrape_and_chunk` tasks triggered when a subject reaches 80% completion.

### 4. Frontend

```bash
cd sarvagna/frontend
npm install
npm run dev
```

App available at: `http://localhost:5173`

---

## Environment Variables (`.env`)

| Variable | Description |
|---|---|
| `SECRET_KEY` | JWT signing key |
| `DATABASE_URL` | `postgresql+asyncpg://postgres:password@localhost:5433/sarvagna` |
| `REDIS_URL` | `redis://localhost:6380` |
| `GROQ_API_KEY` | From console.groq.com |
| `APIFY_API_KEY` | From apify.com |
| `QDRANT_HOST` | `localhost` |
| `QDRANT_PORT` | `6333` |
| `OLLAMA_BASE_URL` | `http://localhost:11434` |
| `OLLAMA_EMBED_MODEL` | `nomic-embed-text` |

---

## Rate Limits

- **Query API**: 10 queries/user/day (Redis-backed, resets at midnight UTC)

---

## Features

- 🎓 VTU syllabus-aware AI tutor (Groq llama-3.3-70b)
- 🗺️ 2D game map with React Flow + dagre layout
- 💬 Persistent chat with module-scoped teaching sessions
- 🏆 XP / Level / Badges gamification system
- 🔍 RAG via Qdrant vector search (nomic-embed-text embeddings)
- 🕷️ Web scraping via Apify `website-content-crawler` + Playwright fallback
