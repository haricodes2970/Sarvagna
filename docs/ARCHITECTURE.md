# Architecture

## System Overview
Sarvagna is split into a React frontend, a FastAPI backend, and a set of AI agents for scraping and question answering. Data is stored in Postgres, cached in Redis, and embeddings are stored in Qdrant.

## Agent Swarm Diagram (text)
User
-> Frontend (React SPA)
-> API (FastAPI)
-> Auth, Subjects, Query, Progress routes
-> Orchestrator Agent
   -> Redis cache check
   -> Teacher Agent
      -> Ollama embeddings
      -> Qdrant search
      -> Groq LLM
-> Roadmap Agent (XP, levels, badges)
-> Postgres

Scrape Trigger
-> Celery task queue (Redis broker)
-> Scraper Agent
   -> Apify crawler
   -> Playwright fallback
-> Chunker Agent
   -> Ollama embeddings
   -> Qdrant upsert

## Data Flow
Auth flow:
- Register or login returns JWT.
- JWT stored in localStorage and sent on every API call.

Subject flow:
- Add subject writes to Postgres.
- Dashboard lists active subjects.

Scrape flow:
- POST /subjects/{id}/scrape enqueues a Celery task named tasks.scrape_and_chunk.
- Scraper Agent fetches notes and Chunker Agent stores vectors in Qdrant.

Query flow:
- POST /query checks Redis for cached answers.
- On miss, Teacher Agent embeds the question, searches Qdrant, calls Groq, and returns JSON.
- Orchestrator awards XP and checks badges.
- Query is stored in Postgres.

Progress flow:
- POST /progress/module/complete marks module done and awards XP.
- Subject is marked complete if all modules are completed.
