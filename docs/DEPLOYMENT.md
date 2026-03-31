# Deployment

How to deploy Sarvagna to production.

---

## Architecture

```
Internet
    │
    ├── Vercel (Frontend React app)
    │       → calls → Railway Backend
    │
    └── Railway
            ├── FastAPI Backend (uvicorn)
            ├── PostgreSQL (Railway managed)
            ├── Redis (Railway managed)
            └── Qdrant (Railway container or Qdrant Cloud)
                        ↓
                    Ollama (separate VM or container)
```

**External APIs used by backend (no self-hosting needed):**
- Groq API — LLM inference
- Wikipedia API — scraping (no key required)
- DuckDuckGo HTML — scraping (no key required)
- Google OAuth — optional auth

---

## Frontend: Vercel

1. Import your GitHub repo in [vercel.com](https://vercel.com)
2. Set root directory to `sarvagna/frontend`
3. Add environment variable:
   ```
   VITE_API_URL=https://<your-backend>.railway.app/api/v1
   ```
4. Build command: `npm run build`
5. Output directory: `dist`

Vercel auto-deploys on every push to `main`.

---

## Backend: Railway

### Step 1: Create Railway project

1. Go to [railway.app](https://railway.app) and create a new project
2. Add a **PostgreSQL** service (Railway managed)
3. Add a **Redis** service (Railway managed)

### Step 2: Deploy backend

1. Add a new service → "Deploy from GitHub repo"
2. Set root directory to `sarvagna/backend`
3. Start command:
   ```
   uvicorn main:app --host 0.0.0.0 --port $PORT
   ```

### Step 3: Set environment variables

In Railway dashboard → backend service → Variables:

```env
SECRET_KEY=<generate with: python -c "import secrets; print(secrets.token_hex(32))">
ENVIRONMENT=production

# Railway auto-provides this when you add Postgres service:
DATABASE_URL=postgresql+asyncpg://<user>:<pass>@<host>:<port>/<db>

# Railway auto-provides this when you add Redis service:
REDIS_URL=redis://<host>:<port>

# Qdrant (see below)
QDRANT_HOST=<qdrant-host>
QDRANT_PORT=6333

# Groq (get at console.groq.com)
GROQ_API_KEY=gsk_...

# Ollama (see below)
OLLAMA_BASE_URL=http://<ollama-host>:11434
OLLAMA_EMBED_MODEL=nomic-embed-text

# Google OAuth (optional)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=https://<your-backend>.railway.app/api/v1/auth/google/callback

# Gemini (optional)
GEMINI_API_KEY=
```

### Step 4: Initialize database

After first deploy, run once via Railway shell or CLI:
```bash
python create_tables.py
```

---

## Qdrant

### Option A: Qdrant Cloud (recommended)

1. Sign up at [cloud.qdrant.io](https://cloud.qdrant.io)
2. Create a cluster (free tier: 1GB)
3. Set in Railway:
   ```
   QDRANT_HOST=<cluster-id>.us-east4-0.gcp.cloud.qdrant.io
   QDRANT_PORT=6333
   QDRANT_API_KEY=<your-key>   # add this to backend if using auth
   ```

### Option B: Railway container

1. In Railway, add a new service → Docker image → `qdrant/qdrant`
2. Expose port 6333
3. Set `QDRANT_HOST` to the internal Railway hostname

---

## Ollama

Ollama is the only service that doesn't have a managed cloud offering. Options:

### Option A: Dedicated VM (recommended for production)

1. Provision a VPS (e.g., DigitalOcean Droplet, $12/month, 2GB RAM)
2. Install Ollama:
   ```bash
   curl -fsSL https://ollama.com/install.sh | sh
   ollama pull nomic-embed-text
   ollama serve
   ```
3. Allow port 11434 in firewall
4. Set in Railway: `OLLAMA_BASE_URL=http://<vm-ip>:11434`

### Option B: Railway container

1. Add a service with custom Dockerfile:
   ```dockerfile
   FROM ollama/ollama
   RUN ollama pull nomic-embed-text
   ```
2. Set start command: `ollama serve`

### Option C: Replace with hosted embedding API

If Ollama is too complex to host, you can replace it with OpenAI or Cohere embeddings. This requires code changes in `scraper_agent.py` and `teacher_agent.py` where `_embed()` is called. The embedding dimension must match (currently 768 for nomic-embed-text). **If you change the model, you must re-scrape all subjects** — the stored vectors won't be compatible.

---

## CORS Configuration

In `sarvagna/backend/main.py`, update `allow_origins` to include your production frontend domain:

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",                    # local dev
        "https://sarvagna.vercel.app",              # your Vercel URL
        "https://your-custom-domain.com",           # custom domain if any
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

---

## Production Checklist

| Item | Action |
|------|--------|
| SECRET_KEY | Generate strong random key (32+ hex chars) |
| HTTPS | Vercel + Railway both provide HTTPS automatically |
| DATABASE_URL | Use Railway Postgres — never SQLite in production |
| CORS | Add your Vercel domain to allow_origins |
| Ollama | Must be reachable from Railway backend |
| Qdrant | Must be reachable from Railway backend |
| Google OAuth redirect URI | Must match exactly: `https://<backend>/api/v1/auth/google/callback` |
| DB init | Run `python create_tables.py` once after first deploy |

---

## Environment Variables Reference

### Backend (all required unless marked optional)

| Variable | Example | Notes |
|----------|---------|-------|
| `SECRET_KEY` | `a3f8...` | JWT signing key — keep secret |
| `ENVIRONMENT` | `production` | Controls debug mode |
| `DATABASE_URL` | `postgresql+asyncpg://...` | Must use `asyncpg` driver |
| `REDIS_URL` | `redis://...` | For caching + rate limits |
| `QDRANT_HOST` | `localhost` or cloud URL | |
| `QDRANT_PORT` | `6333` | |
| `GROQ_API_KEY` | `gsk_...` | LLM inference |
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Embedding service |
| `OLLAMA_EMBED_MODEL` | `nomic-embed-text` | Must match stored vectors |
| `GOOGLE_CLIENT_ID` | `...apps.googleusercontent.com` | Optional — Google OAuth |
| `GOOGLE_CLIENT_SECRET` | `GOCSPX-...` | Optional — Google OAuth |
| `GOOGLE_REDIRECT_URI` | `https://.../auth/google/callback` | Optional — Google OAuth |
| `GEMINI_API_KEY` | `AIza...` | Optional — not actively used |

### Frontend

| Variable | Example |
|----------|---------|
| `VITE_API_URL` | `https://your-backend.railway.app/api/v1` |
