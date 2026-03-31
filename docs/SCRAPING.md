# Scraping Pipeline

How Sarvagna fetches study content for each subject module.

---

## Overview

```
Subject Added
      ↓
_background_scrape() — asyncio.gather() — 5 modules in parallel
      ↓
For each module:
  scrape_subject() → (text, image_urls)
      ↓
  chunk_and_store(text, images) → Qdrant
      ↓
  DB: UPDATE subjects SET modules_scraped = modules_scraped + 1
```

---

## File: `backend/agents/scraper_agent.py`

---

## Strategy (2 sources, in order)

### 1. Wikipedia API (Primary)

Wikipedia is fast, reliable, always available, and covers every academic CS/AIML topic.

**Search query:** `"{subject_name} {module_topic}"` (e.g. "Natural Language Processing Introduction to NLP")

**API calls:**
```
GET https://en.wikipedia.org/w/api.php
  ?action=query&list=search&srsearch={query}&format=json&srlimit=2
→ Returns list of article titles

GET https://en.wikipedia.org/w/api.php
  ?action=query&prop=extracts&explaintext=True&titles={title}&format=json
→ Returns plain text extract (up to 12,000 chars)
```

Up to 3 queries per module (subject+topic, subject only, topic only). Fetches up to 2 articles. Combined text separator: `\n\n---\n\n`.

**Blocked from your network?** Falls through to DDG fallback automatically.

---

### 2. DuckDuckGo + Web Fetch (Fallback)

If Wikipedia returns < 500 chars, falls back to web scraping.

**Search query:** `"VTU {subject_name} {first 4 words of topic} notes"`

Example: `"VTU Machine Learning Introduction to notes"`

**Steps:**
1. `GET https://html.duckduckgo.com/html/?q={query}`
2. Parse `<a class="result__a">` links — DDG wraps real URLs in `//duckduckgo.com/l/?uddg=<encoded_url>`
3. Decode the `uddg` param to get actual URL
4. Fetch up to 3 pages (8s timeout per page)
5. Clean HTML, extract text + images
6. Filter junk pages

**DDG URL Decoding:**
DDG uses redirect links. The code decodes them:
```python
href = "//duckduckgo.com/l/?uddg=https%3A%2F%2Fvtucircle.com%2F..."
→ real_url = "https://vtucircle.com/..."
```

---

## HTML Cleaning (`_clean_html`)

When a page is fetched, all non-content elements are removed:
- `<script>`, `<style>`, `<nav>`, `<footer>`, `<header>`, `<aside>`, `<noscript>`, `<form>`, `<button>`, `<iframe>`

Then the best content container is selected (in priority order):
1. `<main>`
2. `<article>`
3. Element with `id` matching `content|main|post|article`
4. Element with `class` matching `content|main|post|entry|article`
5. `<body>` as fallback

Text is extracted with `get_text(separator="\n")` and excessive blank lines collapsed.

---

## Image Extraction (`_extract_images`)

While cleaning HTML, images are also extracted from the content area.

**Included:**
- `.jpg`, `.jpeg`, `.png` images
- Images with meaningful alt text

**Excluded (junk filter):**
- Filenames containing: `icon`, `logo`, `favicon`, `avatar`, `button`, `banner`, `ad`, `sponsor`, `pixel`, `tracking`, `spacer`, `1x1`, `blank`, `emoji`, `badge`, `arrow`
- `.gif`, `.svg`, `.ico`, `.webp` files
- Alt text matching the same junk patterns

Up to **6 images per page**, up to **8 images total** per module.

Images are stored in the first chunk's Qdrant payload and injected into chat responses.

---

## Junk Detection (`_is_useful`)

A page is rejected if:
- Text length < 300 characters
- Contains: `404`, `page not found`, `no results`, `captcha`, `access denied`, `forbidden`, `just a moment`
- None of the subject name's keywords (>3 chars) appear in the text

---

## Chunking & Storage (`backend/agents/chunker_agent.py`)

After scraping, text is:

1. **Tokenized** using tiktoken `cl100k_base` encoding
2. **Split** into chunks of 512 tokens with 50-token overlap
3. **Embedded** via Ollama:
   ```
   POST http://localhost:11434/api/embeddings
   { "model": "nomic-embed-text", "prompt": "<chunk>" }
   → 768-dimensional float vector
   ```
4. **Stored** in Qdrant collection `{subject_slug}_module_{n}`:
   ```python
   PointStruct(
     id=chunk_index,
     vector=[...768 floats...],
     payload={
       "text": chunk,
       "subject": subject_name,
       "module": module_number,
       "chunk_index": i,
       "image_urls": [...]  # only on chunk 0
     }
   )
   ```

Collection is created automatically if it doesn't exist (COSINE distance, 768-dim).

---

## Module Topic Resolution

The scraper uses the syllabus to build better search queries.

```python
# From syllabus_loader.get_modules(branch, semester, subject_name)
modules = ["Introduction to NLP and Text Processing", "Language Models and Text Representation", ...]

module_topic = modules[module_number - 1]
# → "Introduction to NLP and Text Processing"

short_topic = " ".join(module_topic.split()[:4])
# → "Introduction to NLP and"

query = f"VTU {subject_name} {short_topic} notes"
# → "VTU Natural Language Processing Introduction to NLP and notes"
```

Topic is truncated to 4 words to prevent DuckDuckGo returning 0 results for very long queries.

---

## Scraping Trigger Points

| Trigger | When |
|---------|------|
| Auto (background) | Every time a subject is added via `POST /subjects/add` |
| Manual re-scrape | `POST /subjects/{subject_id}/scrape` |

Auto-scraping runs all 5 modules **in parallel** using `asyncio.gather()`.

---

## Progress Tracking

After each module scrapes successfully:

```sql
UPDATE subjects
SET modules_scraped = modules_scraped + 1
WHERE id = '{subject_id}'
```

This is an atomic SQL increment — avoids race conditions when all 5 modules run simultaneously.

The frontend polls `GET /subjects` every 8 seconds and shows:
- **Amber banner:** "Scraping content… X/5 modules done"
- **Green banner:** "Textbook content ready — 5/5 modules scraped"

---

## Known Limitations

| Issue | Notes |
|-------|-------|
| Wikipedia blocked | Falls back to DDG automatically |
| DDG rate limiting | If too many requests at once, DDG returns 0 results |
| Studocu.com | Blocks scrapers — always fails, ignored |
| Images | Only from web pages, not PDFs or YouTube |
| PDF textbooks | Not supported yet |
