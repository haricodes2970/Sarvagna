# AI Pipeline

How Sarvagna teaches students using Retrieval-Augmented Generation (RAG).

---

## Overview

```
User message
    ↓
Embed with Ollama (nomic-embed-text, 768-dim)
    ↓
Search Qdrant (module collection + important questions collection)
    ↓
Build prompt: system_prompt + context_chunks + chat_history + user_message
    ↓
Call Groq (llama-3.3-70b-versatile, temp=0.4, max_tokens=2048)
    ↓
Append image URLs (if any from Qdrant payload)
    ↓
Return structured markdown response
```

---

## File: `backend/agents/teacher_agent.py`

---

## Embedding

Every message is embedded before searching Qdrant:

```python
POST http://localhost:11434/api/embeddings
{
  "model": "nomic-embed-text",
  "prompt": "Explain the bigram model"
}
→ [0.123, -0.456, ...] # 768 floats
```

The same model is used for both storing (at scrape time) and querying (at chat time). This is critical — if you change the embedding model, you must re-scrape all subjects.

---

## Qdrant Search

### Normal module chat (module_number 1–5)

```python
qdrant.search(
  collection_name = "natural_language_processing_module_1",
  query_vector = user_embedding,
  limit = 8,              # Top-K chunks
  score_threshold = 0.5   # Minimum similarity
)
```

### Full-subject chat (module_number = 0)

Searches ALL module collections for the subject:

```python
all_collections = qdrant.get_collections()
matching = [c for c in all_collections if c.startswith("natural_language_processing_module_")]

for collection in matching:
    results = qdrant.search(collection, query_vector, limit=4, threshold=0.5)
    context_chunks.extend(results)

context_chunks = context_chunks[:8]  # Cap at 8 total
```

### Important questions injection

Always searched in addition to content:

```python
qdrant.search(
  collection_name = f"important_{subject_id}",
  query_vector = user_embedding,
  limit = 5,
  score_threshold = 0.6
)
```

Matching questions are prepended with:
```
⚠️ PROFESSOR MARKED THIS AS IMPORTANT: <question text>
```

and added to the context block.

---

## Image Injection

After searching Qdrant, image URLs are collected from chunk payloads:

```python
for hit in results:
    for img_url in hit.payload.get("image_urls", []):
        image_urls.append(img_url)
```

After the Groq response, images are appended:

```
<!-- SARVAGNA_IMAGES -->
https://vtucircle.com/images/pos-tagging-diagram.jpg
https://example.com/nlp-pipeline.png
<!-- /SARVAGNA_IMAGES -->
```

The frontend strips this block and renders images in a grid below the text.

---

## System Prompt

The system prompt defines the teaching format. The AI MUST follow this exact structure for every topic:

```markdown
## 📘 Topic: <Topic Name>

> 🎯 **Exam Weightage:** <e.g., "Frequently asked — 5 to 10 marks">

### 🔹 Definition
One clear, crisp sentence.

### 🔹 Theory
- Bullet point 1
- Bullet point 2
(max 6–8 bullets)

### 🔹 Diagram
ASCII art diagram in a code block:
```
[Input] ──▶ [Process] ──▶ [Output]
```

### 🔹 Example
Real-world analogy or example.

### 🔹 Key Points to Write in Exam
- ✅ Point to write
- ✅ Another point
```

### Special formats also in the prompt:

**Algorithm:**
```
⚡ ALGORITHM: <Name>
Step 1: ...
Step 2: ...
```

**Solved Example:**
```
📝 SOLVED EXAMPLE:
Given: ...
Find: ...
Step 1: ...
Answer: ...
```

**Table:**
```
📊 TABLE: <Title>
| Col1 | Col2 |
|------|------|
```

### Teaching flow rules in the prompt:
- Teach ONE topic at a time
- After every topic: ask "Did you understand? Any doubts?"
- Do NOT move forward until student confirms
- If confused: re-explain with simpler language and different analogy
- When all topics done: say "Module complete! Ready to mark as done?"

---

## Groq LLM Call

```python
groq_client = AsyncGroq(api_key=settings.GROQ_API_KEY)
completion = await groq_client.chat.completions.create(
  model = "llama-3.3-70b-versatile",
  messages = [
    { "role": "system", "content": system_prompt + context_block },
    { "role": "user",   "content": "message 1" },
    { "role": "assistant", "content": "response 1" },
    ...  # full chat history
    { "role": "user",   "content": current_message }
  ],
  temperature = 0.4,   # Lower = more structured, less creative
  max_tokens = 2048    # Allows full exam-ready answers
)
```

---

## Q&A Pipeline (Separate from Chat)

Used in the Q&A panel (not the teaching chat). Returns structured JSON instead of markdown.

```python
# In agents/orchestrator.py
async def handle_query(question, subject, user_id):
  key = sha256(f"{subject}::{question}")

  # 1. Check Redis cache
  cached = await redis.get(f"sarvagna:answer:{key}")
  if cached:
    return {**json.loads(cached), "cached": True}

  # 2. Call teacher_agent.answer_question()
  answer = await teacher_agent.answer_question(question, subject, user_id)

  # 3. Award XP
  await roadmap_agent.award_xp(user_id, "ask_question")  # +8 XP
  await roadmap_agent.update_streak(user_id)
  badges = await roadmap_agent.check_badges(user_id)

  # 4. Cache for 24 hours
  await redis.setex(key, 86400, json.dumps(answer))

  return {**answer, "badges_unlocked": badges, "cached": False}
```

**Q&A prompt format** (different from chat — returns JSON):
```
You are Sarvagna, an expert academic tutor.
CONTEXT: <chunks>
QUESTION: <question>

Respond with ONLY valid JSON:
{
  "exact_answer": "...",
  "simplified_answer": "...",
  "real_world_example": "..."
}
```

---

## Context Fall-through

If no content found in Qdrant (modules_scraped = 0 or threshold not met):

```python
context = (
  "No scraped textbook content available.\n"
  "IMPORTANT: Teach from general knowledge, but begin your FIRST response with:\n"
  "> ⚠️ Note: Teaching from general knowledge — textbook content loading...\n"
  "Do NOT repeat this note in later messages."
)
```

---

## Topic Status Inference (ModuleMap)

The `/modulemap` route infers which topic the student is currently on by parsing chat history.

```python
# Regex to find last topic taught:
pattern = r"##\s*📘\s*Topic:\s*(.+)"
last_topic = re.findall(pattern, all_chat_content)[-1]

# Jaccard similarity to match to syllabus topics:
def jaccard(a, b):
  sa, sb = set(a.lower().split()), set(b.lower().split())
  return len(sa & sb) / len(sa | sb)

# Topic with highest similarity = "current"
# Topics before it = "completed"
# Topics after it = "locked"
```

---

## Map Layout Generation (`groq_map_placer.py`)

For the fantasy learning map, Groq generates node placement:

```python
prompt = f"""
You are a fantasy map designer. Place the following topics on a map.
Topics: {topics}
Subtopics: {subtopics}

Return JSON:
{{
  "capital": {{ "name": "...", "x": 50, "y": 50, "topic": "..." }},
  "cities": [...],
  "villages": [...],
  "roads": [{{ "from": "...", "to": "..." }}]
}}
"""
```

Cached in Redis for 24 hours. Falls back to deterministic spiral layout if Groq fails or times out.
