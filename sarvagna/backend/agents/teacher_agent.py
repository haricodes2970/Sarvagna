import hashlib
import json
import logging
import re

import httpx
from groq import AsyncGroq
from qdrant_client import AsyncQdrantClient
from qdrant_client.models import ScoredPoint
from redis.asyncio import Redis

from core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

_GROQ_MODEL = "llama-3.3-70b-versatile"
_TOP_K = 8
_SCORE_THRESHOLD = 0.5
_CACHE_TTL = 86_400  # 24 hours in seconds


def _cache_key(question: str, subject: str) -> str:
    digest = hashlib.sha256(f"{subject}::{question}".encode()).hexdigest()
    return f"sarvagna:answer:{digest}"


async def _embed_question(question: str) -> list[float]:
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            f"{settings.OLLAMA_BASE_URL}/api/embeddings",
            json={"model": settings.OLLAMA_EMBED_MODEL, "prompt": question},
        )
        resp.raise_for_status()
        return resp.json()["embedding"]


def _collection_name(subject: str) -> str:
    """Best-effort: search across all modules by subject prefix."""
    return re.sub(r"[^a-z0-9]+", "_", subject.lower()).strip("_")


async def _search_qdrant(subject: str, vector: list[float]) -> list[str]:
    qdrant = AsyncQdrantClient(host=settings.QDRANT_HOST, port=settings.QDRANT_PORT)

    collections_resp = await qdrant.get_collections()
    subject_slug = _collection_name(subject)
    matching = [c.name for c in collections_resp.collections if c.name.startswith(subject_slug)]

    contexts: list[tuple[float, str]] = []
    for collection in matching:
        try:
            results: list[ScoredPoint] = await qdrant.search(
                collection_name=collection,
                query_vector=vector,
                limit=_TOP_K,
                score_threshold=_SCORE_THRESHOLD,
            )
            for hit in results:
                contexts.append((hit.score, hit.payload.get("text", "")))
        except Exception as exc:
            logger.warning("Qdrant search failed for collection '%s': %s", collection, exc)

    await qdrant.close()

    contexts.sort(key=lambda x: x[0], reverse=True)
    return [text for _, text in contexts[:_TOP_K]]


def _build_prompt(question: str, context_chunks: list[str]) -> str:
    context = "\n\n---\n\n".join(context_chunks) if context_chunks else "No context available."
    return f"""You are Sarvagna, an expert academic tutor. Answer the student's question using the provided context.

CONTEXT:
{context}

QUESTION: {question}

Respond with ONLY valid JSON (no markdown, no extra text) in this exact format:
{{
  "exact_answer": "Precise, textbook-accurate answer",
  "simplified_answer": "Simple explanation a first-year student can understand",
  "real_world_example": "A concrete real-world analogy or application"
}}"""


def _extract_json(text: str) -> dict:
    text = text.strip()
    # Strip markdown code fences if present
    text = re.sub(r"^```(?:json)?\s*", "", text)
    text = re.sub(r"\s*```$", "", text)
    return json.loads(text)


SARVAGNA_SYSTEM_PROMPT = """
You are Sarvagna AI Teacher — a VTU exam-focused engineering tutor. You teach in a structured, exam-ready format that students can directly use to write answers in exams.

===================================
MANDATORY RESPONSE FORMAT
===================================
Every topic explanation MUST follow this EXACT structure:

## 📘 Topic: <Topic Name>

> 🎯 **Exam Weightage:** <e.g., "Frequently asked — 5 to 10 marks" or "Short answer — 2 to 5 marks">

### 🔹 Definition
One clear, crisp sentence. Write this in exams as-is.

### 🔹 Theory
- Point 1 — simple and direct
- Point 2
- Point 3
(use bullet points, max 6-8 points, no fluff)

### 🔹 Diagram
ALWAYS draw diagrams using plain ASCII art inside a code block (DO NOT use mermaid syntax):
```
         ┌─────────┐
Input ──▶│ Process │──▶ Output
         └────┬────┘
              │
         ┌────▼────┐
         │ Sub-step│
         └─────────┘
```
Use boxes (┌─┐ │ └─┘), arrows (──▶ │ ▼ ▲), and labels. Make it look like a textbook diagram.
NEVER write "graph LR", "graph TD", or any mermaid syntax — it will not render correctly.

### 🔹 Example
A concrete, easy-to-remember example. Use a real-world analogy if possible.

### 🔹 Key Points to Write in Exam
- ✅ Point 1 (write this in your answer)
- ✅ Point 2
- ✅ Point 3

---

===================================
ALGORITHM FORMAT (use when explaining any step-by-step process)
===================================
⚡ ALGORITHM: <Name>
```
Step 1: ...
Step 2: ...
Step 3: ...
...
Result: ...
```

===================================
SOLVED EXAMPLE FORMAT
===================================
📝 SOLVED EXAMPLE:
```
Given:  ...
Find:   ...

Step 1: ...
Step 2: ...
Step 3: ...

Answer: ...
```

===================================
TABLE FORMAT (for comparisons, categories)
===================================
📊 TABLE: <Title>
| Column 1 | Column 2 | Column 3 |
|----------|----------|----------|
| ...      | ...      | ...      |

===================================
TEACHING FLOW
===================================
1. Teach topics ONE BY ONE in module order.
2. After EVERY topic ask: "Did you understand? Any doubts?"
3. WAIT — do NOT move to next topic until student confirms.
4. If student is confused, re-explain with simpler words and a different example.
5. When ALL topics done, say: "Module complete! Ready to mark as done?"

===================================
TONE & STYLE
===================================
- Teach like a helpful senior who scored well in VTU.
- Simple language — avoid heavy jargon unless defining it.
- Every response should feel like a well-written study note.
- Never give vague or one-liner answers. Always give full, complete explanations.

===================================
STRICT RULES
===================================
- ALWAYS include the Diagram section if the topic has any visual representation.
- ALWAYS include Exam Weightage so student knows how important it is.
- ALWAYS include Key Points to Write in Exam — this is the most important section.
- Use the provided textbook context as the primary source.
- Do NOT skip sections of the format.
"""


async def teach_module(
    subject: str,
    module_number: int,
    user_message: str,
    chat_history: list[dict],
    user_id: str,
    subject_id: str = "",
) -> str:
    """
    Teaching-mode conversation for a specific module.
    Uses RAG context from Qdrant + full chat_history for multi-turn dialogue.
    Module 0 = full-subject chat (searches all module collections).
    Returns the assistant's reply as a plain string.
    """
    vector = await _embed_question(user_message)

    qdrant = AsyncQdrantClient(host=settings.QDRANT_HOST, port=settings.QDRANT_PORT)
    context_chunks: list[str] = []
    important_chunks: list[str] = []
    image_urls: list[str] = []
    seen_images: set[str] = set()

    try:
        subject_slug = _collection_name(subject)

        if module_number == 0:
            # Full-subject chat: search all module collections
            all_collections_resp = await qdrant.get_collections()
            module_collections = [
                c.name for c in all_collections_resp.collections
                if c.name.startswith(subject_slug + "_module_")
            ]
            for col in module_collections:
                try:
                    results: list[ScoredPoint] = await qdrant.search(
                        collection_name=col,
                        query_vector=vector,
                        limit=4,
                        score_threshold=_SCORE_THRESHOLD,
                    )
                    context_chunks.extend([hit.payload.get("text", "") for hit in results])
                    for hit in results:
                        for img in hit.payload.get("image_urls", []):
                            if img not in seen_images:
                                seen_images.add(img)
                                image_urls.append(img)
                except Exception:
                    pass
            context_chunks = context_chunks[:_TOP_K]
        else:
            collection = f"{subject_slug}_module_{module_number}"
            try:
                results: list[ScoredPoint] = await qdrant.search(
                    collection_name=collection,
                    query_vector=vector,
                    limit=_TOP_K,
                    score_threshold=_SCORE_THRESHOLD,
                )
                context_chunks = [hit.payload.get("text", "") for hit in results]
                for hit in results:
                    for img in hit.payload.get("image_urls", []):
                        if img not in seen_images:
                            seen_images.add(img)
                            image_urls.append(img)
            except Exception as exc:
                logger.warning("Qdrant search failed for teach_module: %s", exc)

        # Search professor's important questions for this subject
        if subject_id:
            important_collection = f"important_{subject_id}"
            try:
                imp_results: list[ScoredPoint] = await qdrant.search(
                    collection_name=important_collection,
                    query_vector=vector,
                    limit=5,
                    score_threshold=0.6,
                )
                important_chunks = [
                    f"⚠️ PROFESSOR MARKED THIS AS IMPORTANT: {hit.payload.get('question', '')}"
                    for hit in imp_results
                ]
            except Exception:
                pass  # collection may not exist yet
    finally:
        await qdrant.close()

    has_context = bool(context_chunks)
    if has_context:
        context = "\n\n---\n\n".join(context_chunks)
    else:
        context = (
            "No scraped textbook content is available for this module yet.\n"
            "IMPORTANT: Teach from your general knowledge of the subject, but begin your "
            "FIRST response in this session with exactly this notice on its own line:\n"
            "> ⚠️ Note: Teaching from general knowledge — textbook content loading...\n"
            "After that note, proceed with normal teaching. Do NOT repeat the note in later messages."
        )

    if important_chunks:
        context += "\n\n---\n\nPROFESSOR'S IMPORTANT QUESTIONS (prioritise these in your teaching):\n" + "\n".join(important_chunks)

    system_prompt = SARVAGNA_SYSTEM_PROMPT + f"""

-----------------------------------
CURRENT SESSION CONTEXT
-----------------------------------
Subject: {subject}
Module: {module_number}

TEXTBOOK CONTENT:
{context}"""

    messages = [{"role": "system", "content": system_prompt}]

    # Append full conversation history (already formatted as role/content dicts)
    for msg in chat_history:
        messages.append({"role": msg["role"], "content": msg["content"]})

    # Append the latest user message
    messages.append({"role": "user", "content": user_message})

    groq_client = AsyncGroq(api_key=settings.GROQ_API_KEY)
    completion = await groq_client.chat.completions.create(
        model=_GROQ_MODEL,
        messages=messages,
        temperature=0.4,
        max_tokens=2048,
    )

    reply = completion.choices[0].message.content or ""

    # Append image URLs in a parseable marker so the frontend can render them
    if image_urls:
        image_block = "\n".join(image_urls[:6])
        reply += f"\n\n<!-- SARVAGNA_IMAGES -->\n{image_block}\n<!-- /SARVAGNA_IMAGES -->"

    return reply


async def answer_question(question: str, subject: str, user_id: str) -> dict:
    """
    Embed question → search Qdrant → call Groq → return JSON answer.
    Result is cached in Redis for 24 hours.
    """
    redis = Redis.from_url(settings.REDIS_URL, decode_responses=True)
    key = _cache_key(question, subject)

    cached = await redis.get(key)
    if cached:
        logger.info("Cache hit for key %s", key)
        await redis.aclose()
        return json.loads(cached)

    vector = await _embed_question(question)
    context_chunks = await _search_qdrant(subject, vector)

    prompt = _build_prompt(question, context_chunks)

    groq_client = AsyncGroq(api_key=settings.GROQ_API_KEY)
    completion = await groq_client.chat.completions.create(
        model=_GROQ_MODEL,
        messages=[{"role": "user", "content": prompt}],
        temperature=0.3,
        max_tokens=1024,
    )

    raw = completion.choices[0].message.content
    answer = _extract_json(raw)

    await redis.set(key, json.dumps(answer), ex=_CACHE_TTL)
    await redis.aclose()

    return answer
