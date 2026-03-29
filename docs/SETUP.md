# Local Setup

## Prereqs
- Python 3.11+ and pip
- Node 18+ and npm
- Docker Desktop (for Postgres, Redis, Qdrant)
- Ollama installed locally
- API keys: Groq, Apify (Google OAuth optional)

## 1. Start infra with Docker
```
cd D:\git projects\Sarvagna
docker compose up -d
```

Default ports from docker-compose.yml:
- Postgres: localhost:5433 (container 5432)
- Redis: localhost:6380 (container 6379)
- Qdrant: localhost:6333

## 2. Backend setup
```
cd sarvagna\backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

Copy and edit env:
```
copy .env.example .env
```

Create tables:
```
python create_tables.py
```

Run API:
```
python main.py
# or
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

## 3. Frontend setup
```
cd ..\frontend
npm install
copy .env.example .env
npm run dev
```

## 4. Optional services
Install Playwright browsers:
```
python -m playwright install
```

Ollama:
```
ollama serve
ollama pull nomic-embed-text
```

Celery worker:
This project references a task named tasks.scrape_and_chunk. See docs/PROGRESS.md for current status.
