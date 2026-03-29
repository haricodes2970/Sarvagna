# Project Progress

## Done
- FastAPI backend with auth, subjects, query, and progress routes.
- JWT authentication with email password and Google OAuth flow.
- Postgres models for users, subjects, queries, and progress.
- RAG query pipeline using Ollama embeddings, Qdrant retrieval, and Groq LLM.
- Redis caching for question answers.
- XP, levels, streaks, and badge evaluation logic.
- Frontend pages for login, dashboard, subject Q and A, roadmap, and progress.
- Docker Compose for Postgres, Redis, and Qdrant.
- Database bootstrap via create_tables.py.

## Pending or In Progress
- Celery worker implementation for tasks.scrape_and_chunk (referenced but task module not present).
- End to end scraping pipeline that updates subject.modules_scraped after ingestion.
- Additional syllabus JSON files for non AIML branches.
- Badge logic for question and topic based badges.
- Subject completion XP reward from SUBJECT_SLOT_CONFIG.

## Known Issues and Gaps
- RoadmapPage uses @/components and lucide-react imports without local component files or package dependency in this repo.
- .env.example contains extra markdown text at the end and should be cleaned for a plain env file.
- Local auth stores password hashes in the google_id column. A dedicated password hash column is recommended.
- Progress roadmap always returns at least 5 modules even if modules_scraped is lower.
- Scrape endpoint enqueues a Celery task name but there is no tasks.py in the backend.
