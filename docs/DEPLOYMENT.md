# Deployment

This project expects Postgres, Redis, Qdrant, and Ollama (for embeddings), plus Groq and Apify API keys.

## Frontend on Vercel
1. Import the repo in Vercel.
2. Set environment variable VITE_API_URL to your backend base URL, for example https://<backend>/api/v1.
3. Build command: npm run build
4. Output directory: dist

## Backend on Railway
1. Create a Railway project and add services for Postgres and Redis.
2. Add a Qdrant service (or use Qdrant Cloud) and set QDRANT_HOST and QDRANT_PORT.
3. Set backend environment variables listed below.
4. Deploy the backend with a start command like:
```
uvicorn main:app --host 0.0.0.0 --port $PORT
```
5. Run python create_tables.py once to initialize tables.

## Qdrant and Ollama
- Qdrant must be reachable by the backend. Use Qdrant Cloud or self host.
- Ollama must be reachable at OLLAMA_BASE_URL. For production this usually means a dedicated VM or container. Replacing Ollama with a hosted embedding service requires code changes.

## Backend Environment Variables
- SECRET_KEY
- ENVIRONMENT
- DATABASE_URL
- REDIS_URL
- QDRANT_HOST
- QDRANT_PORT
- GROQ_API_KEY
- GEMINI_API_KEY
- APIFY_API_KEY
- OLLAMA_BASE_URL
- OLLAMA_EMBED_MODEL
- GOOGLE_CLIENT_ID
- GOOGLE_CLIENT_SECRET
- GOOGLE_REDIRECT_URI

## Frontend Environment Variables
- VITE_API_URL

## CORS
Update allow_origins in backend/main.py to include your production frontend domain.
