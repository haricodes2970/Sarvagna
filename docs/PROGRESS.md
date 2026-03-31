# Project Status

Current state of Sarvagna as of March 2026.

---

## What's Working

| Feature | Status |
|---------|--------|
| Email/Password auth | ✅ Working |
| Google OAuth | ✅ Working |
| Add subject with scheme/branch/semester dropdowns | ✅ Working |
| VTU 2022 AIML Sem 6 syllabus (10 subjects) | ✅ Working |
| Auto-scrape on subject add (5 modules in parallel) | ✅ Working |
| Wikipedia + DuckDuckGo scraping pipeline | ✅ Working |
| Scrape progress banner (amber → green) | ✅ Working |
| RAG chat with Groq llama-3.3-70b | ✅ Working |
| Exam-ready structured teaching format | ✅ Working |
| ASCII diagrams in chat (mermaid disabled) | ✅ Working |
| Image injection from scraped pages | ✅ Working |
| Important questions upload (multi-line parser) | ✅ Working |
| Important questions delete | ✅ Working |
| Important questions injected into chat context | ✅ Working |
| Full-subject chat (module 0) | ✅ Working |
| Q&A panel with Redis cache | ✅ Working |
| XP system (ask_question, complete_module) | ✅ Working |
| Level calculation (10 levels) | ✅ Working |
| Streaks with 7-day XP bonus | ✅ Working |
| Badge evaluation (9 of 15 badges) | ✅ Working |
| Fantasy map generation (Groq + spiral fallback) | ✅ Working |
| Module map with topic click → chat | ✅ Working |
| Topic status inference (completed/current/locked) | ✅ Working |
| Module completion marking | ✅ Working |
| Progress page (XP bar, streak, badges) | ✅ Working |
| Roadmap page | ✅ Working |
| Delete subject | ✅ Working |

---

## Known Issues

| Issue | Severity | Notes |
|-------|----------|-------|
| Password stored in `google_id` column | Low | Works correctly, just bad naming. Should be a dedicated `password_hash` column eventually |
| Token refresh not implemented | Low | JWT expires after 30 days, user must log in again |
| Scraping depends on Ollama running locally | Medium | If Ollama is down, scraping silently fails (no embedding) |
| Wikipedia blocked on some networks | Low | Automatically falls back to DuckDuckGo |
| Some VTU topics scrape 0 content | Low | Context fall-through tells AI to use general knowledge |

---

## Partially Implemented

| Feature | Status |
|---------|--------|
| `view_topic` XP (+5 XP) | Configured in XP table, not wired to any route |
| `daily_login` XP (+10 XP) | Configured in XP table, not wired |
| Subject completion XP (+200 XP) | Configured in SUBJECT_SLOT_CONFIG, not wired |
| Badge: `first_topic` | Configured, evaluation not implemented |
| Badge: `first_module` | Configured, evaluation not implemented |
| Badge: `first_question` | Configured, evaluation not implemented |
| Badge: `50_questions` | Configured, evaluation not implemented |
| Badge: `100_topics` | Configured, evaluation not implemented |
| Badge: `500_topics` | Configured, evaluation not implemented |

---

## Syllabus Coverage

| Branch | Scheme | Semesters Available |
|--------|--------|---------------------|
| AIML | 2022 | Semester 6 only |

Other branches/semesters will show an empty subject picker. The syllabus JSON format is documented in [SCRAPING.md](SCRAPING.md) — adding a new branch requires adding a JSON file in `backend/data/syllabus/`.

---

## Architecture Decisions (Why things are built this way)

**Why Wikipedia + DuckDuckGo instead of a paid scraper?**
The original design used Apify for web scraping. It was replaced with free alternatives (Wikipedia API + DuckDuckGo HTML) to eliminate the API cost dependency. The tradeoff is less reliable scraping for very specific VTU topics.

**Why Ollama for embeddings instead of OpenAI?**
Free, local, no API cost. The model (nomic-embed-text) produces 768-dim vectors which are stored in Qdrant. Switching to a different embedding model requires re-scraping all subjects.

**Why ASCII diagrams instead of Mermaid?**
Mermaid.js was initially used but the LLM frequently generated invalid mermaid syntax, causing error bombs in the UI. Switched to ASCII art which the LLM handles reliably.

**Why password stored in `google_id` column?**
The initial schema only had `google_id` for OAuth users. When email/password auth was added, the password hash was stored in the same column with a `local:` prefix. It works but a dedicated column would be cleaner.
