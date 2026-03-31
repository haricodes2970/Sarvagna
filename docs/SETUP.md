# Local Setup

Step-by-step guide to run Sarvagna on your machine.

---

## Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| Python | 3.11+ | Backend runtime |
| Node.js | 18+ | Frontend runtime |
| Docker Desktop | Latest | Postgres, Redis, Qdrant containers |
| Ollama | Latest | Local embedding model |
| Git | Any | Clone repository |

**API Keys needed:**
- **Groq** — LLM inference (free tier available at console.groq.com)
- **Google OAuth** — optional, for "Sign in with Google" button

No Apify, Playwright, or Celery needed. Scraping uses httpx + BeautifulSoup.

---

## Step 1: Start Infrastructure (Docker)

```bash
cd "D:\git projects\Sarvagna"
docker compose up -d
```

Services started:

| Service | Host Port | Purpose |
|---------|-----------|---------|
| PostgreSQL | localhost:5433 | Main database |
| Redis | localhost:6380 | Q&A cache + rate limiting |
| Qdrant | localhost:6333 | Vector store for RAG |

Verify containers are running:
```bash
docker ps
```

---

## Step 2: Start Ollama

Ollama must be running for embeddings to work. Without it, scraping and chat will fail.

```bash
# Start Ollama service (runs in background)
ollama serve

# Pull the embedding model (first time only, ~274MB)
ollama pull nomic-embed-text
```

Verify Ollama is working:
```bash
curl http://localhost:11434/api/embeddings -d '{"model":"nomic-embed-text","prompt":"test"}'
```
Should return a JSON with a 768-element `embedding` array.

---

## Step 3: Backend Setup

```bash
cd "D:\git projects\Sarvagna\sarvagna\backend"

# Create virtual environment
python -m venv .venv

# Activate (Windows PowerShell)
.\.venv\Scripts\Activate.ps1

# Activate (Windows CMD)
.\.venv\Scripts\activate.bat

# Install dependencies
pip install -r requirements.txt
```

### Configure environment

```bash
copy .env.example .env
```

Edit `.env` with your values:

```env
SECRET_KEY=any-random-string-32-chars-minimum
ENVIRONMENT=development

# PostgreSQL (matches docker-compose.yml)
DATABASE_URL=postgresql+asyncpg://sarvagna:sarvagnapass@localhost:5433/sarvagna

# Redis (matches docker-compose.yml)
REDIS_URL=redis://localhost:6380

# Qdrant
QDRANT_HOST=localhost
QDRANT_PORT=6333

# LLM (get free key at console.groq.com)
GROQ_API_KEY=gsk_...

# Embeddings
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_EMBED_MODEL=nomic-embed-text

# Google OAuth (optional - for "Sign in with Google")
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=http://localhost:8000/api/v1/auth/google/callback

# Gemini (optional - not actively used)
GEMINI_API_KEY=
```

### Initialize database

```bash
python create_tables.py
```

This creates all PostgreSQL tables. Run once. Safe to re-run (uses CREATE IF NOT EXISTS).

### Start backend

```bash
python main.py
# or equivalently:
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Backend is now running at `http://localhost:8000`.

API docs (Swagger UI): `http://localhost:8000/docs`

---

## Step 4: Frontend Setup

```bash
cd "D:\git projects\Sarvagna\sarvagna\frontend"

# Install dependencies
npm install

# Configure environment
copy .env.example .env
```

`.env` content (default works for local):
```env
VITE_API_URL=http://localhost:8000/api/v1
```

Start dev server:
```bash
npm run dev
```

Frontend is now running at `http://localhost:5173`.

---

## Step 5: Verify Everything Works

1. Open `http://localhost:5173`
2. Register a new account (email + password)
3. On dashboard, select: Scheme=2022, Branch=AIML, Semester=6
4. Click a subject (e.g., "Natural Language Processing")
5. Click "Add Subject"
6. Watch the amber banner: "Scraping content… 0/5 modules done"
7. Wait 1–3 minutes for all 5 modules to scrape
8. Banner turns green: "Textbook content ready — 5/5 modules scraped"
9. Click the chat button and ask a question

---

## Troubleshooting

### "Connection refused" on backend start
Docker isn't running. Start Docker Desktop and run `docker compose up -d`.

### "Connection refused" to Qdrant
Qdrant container isn't up. Check `docker ps`. Try `docker compose restart qdrant`.

### Scraping stuck at 0/5
Ollama is not running. Run `ollama serve` and `ollama pull nomic-embed-text`.

### `modules_scraped` shows wrong number (e.g., 8)
This can happen if scraping is triggered twice. Fix directly in DB:
```sql
UPDATE subjects SET modules_scraped = 5 WHERE modules_scraped > 5;
```

### Mermaid diagram errors in chat
The AI prompt explicitly forbids mermaid syntax. If you see errors, the LLM ignored the instruction. The frontend validates mermaid before rendering and falls back to a code block.

### Wikipedia returns 0 results
Some VTU-specific topics don't exist on Wikipedia. The scraper automatically falls back to DuckDuckGo search.

---

## Project Structure Quick Reference

```
Sarvagna/
├── docker-compose.yml          # Postgres + Redis + Qdrant
├── sarvagna/
│   ├── backend/
│   │   ├── main.py             # FastAPI app entry point
│   │   ├── create_tables.py    # DB init script
│   │   ├── .env                # Backend secrets (git-ignored)
│   │   ├── requirements.txt
│   │   ├── agents/
│   │   │   ├── scraper_agent.py    # Wikipedia + DDG scraper
│   │   │   ├── chunker_agent.py    # Text chunking + Qdrant upsert
│   │   │   ├── teacher_agent.py    # RAG + Groq chat
│   │   │   └── orchestrator.py     # Q&A pipeline
│   │   ├── api/routes/
│   │   │   ├── auth.py
│   │   │   ├── subjects.py         # Add/list/delete + auto-scrape
│   │   │   ├── chat.py
│   │   │   ├── query.py
│   │   │   ├── progress.py
│   │   │   └── important_questions.py
│   │   ├── data/syllabus/
│   │   │   └── aiml_syllabus.json  # VTU 2022 AIML syllabus
│   │   └── core/
│   │       ├── models.py           # SQLAlchemy ORM models
│   │       ├── database.py         # Async DB session
│   │       └── gamification.py     # XP + level config
│   └── frontend/
│       ├── .env                    # VITE_API_URL
│       ├── src/
│       │   ├── pages/              # All React pages
│       │   ├── components/         # Reusable UI components
│       │   ├── store/authStore.ts  # Zustand auth state
│       │   └── lib/api.ts          # Axios API client
│       └── package.json
└── docs/                           # This documentation
```
