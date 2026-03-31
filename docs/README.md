# Sarvagna — Documentation Index

Sarvagna is a VTU exam-prep AI tutor. Students add subjects, the system auto-scrapes 5 modules of content, and an AI teaches topics in an exam-ready structured format with XP, badges, and a game map for motivation.

---

## Documents in this folder

| File | What it covers |
|------|----------------|
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Full system diagram, how every service connects |
| [API.md](./API.md) | Every HTTP endpoint with request/response examples |
| [DATABASE.md](./DATABASE.md) | All DB tables, Qdrant collections, relationships |
| [SCRAPING.md](./SCRAPING.md) | How content is scraped, cleaned, chunked, stored |
| [AI_PIPELINE.md](./AI_PIPELINE.md) | RAG pipeline, teaching format, Groq, Ollama |
| [AUTH.md](./AUTH.md) | JWT, Google OAuth, token lifecycle |
| [GAMIFICATION.md](./GAMIFICATION.md) | XP, levels, badges, streaks, module completion |
| [FRONTEND.md](./FRONTEND.md) | All pages, components, routing, state management |
| [DATA_FLOW.md](./DATA_FLOW.md) | Step-by-step flows: add subject, chat, query, map |
| [SETUP.md](./SETUP.md) | Local dev setup guide from scratch |
| [DEPLOYMENT.md](./DEPLOYMENT.md) | Production deployment (Vercel + Railway) |

---

## One-line mental model

```
Add subject → auto-scrape 5 modules → chunk + embed → Qdrant
Chat about topic → embed message → search Qdrant → Groq LLM → structured answer
Complete module → earn XP → level up → game map unlocks
```

---

## Key numbers

| What | Value |
|------|-------|
| LLM | Groq `llama-3.3-70b-versatile` |
| Embeddings | Ollama `nomic-embed-text` (768-dim, COSINE) |
| Chunk size | 512 tokens, 50-token overlap |
| RAG context | Top-8 chunks per query (threshold 0.5) |
| Important Q context | Top-5 chunks (threshold 0.6) |
| Max subjects/user | 10 |
| Query rate limit | 10 Q&A per user per day |
| Cache TTL | 24 hours (Redis) |
| Max XP level | 10 — Sarvagna (25,000 XP) |
| Backend port | 8000 |
| Frontend port | 5173 (dev) |
