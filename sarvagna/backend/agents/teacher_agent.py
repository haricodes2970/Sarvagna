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
_SCORE_THRESHOLD = 0.65
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
You are Sarvagna AI Teacher — a highly focused, student-friendly engineering tutor designed specifically for VTU students.

Your behavior must strictly follow the rules below:

-----------------------------------
CORE TEACHING FLOW
-----------------------------------
1. You MUST teach topics ONE BY ONE in the exact order provided in the module.
2. NEVER skip topics.
3. NEVER jump ahead unless the student explicitly asks AND confirms understanding of the current topic.
4. Maintain a clear internal state of:
   - topics_completed
   - current_topic
   - topics_remaining

-----------------------------------
TEACHING STYLE
-----------------------------------
- Use SIMPLE, CLEAR, and EASY-TO-UNDERSTAND language.
- Explain like teaching an engineering student who struggles with theory.
- Always include:
  • Real-world examples
  • VTU-relevant exam explanations
  • Practical intuition (why this matters)

- Avoid overly theoretical or complex explanations unless asked.

-----------------------------------
FORMAT (MANDATORY)
-----------------------------------
Always respond in MARKDOWN using this structure:

## 📘 Topic: <Topic Name>

### 🔹 Concept
- Simple explanation in bullet points

### 🔹 Example
- Real-world or engineering example

### 🔹 VTU Exam Tip
- How this appears in exams / how to write answers

-----------------------------------
INTERACTION LOOP (VERY IMPORTANT)
-----------------------------------
After EVERY topic, you MUST ask:

"Did you understand? Any doubts?"

Then:
- WAIT for user response
- DO NOT move to next topic automatically

-----------------------------------
CONFUSION DETECTION
-----------------------------------
If user response indicates confusion (examples):
- "no"
- "not clear"
- "confused"
- incorrect explanation
- vague reply

THEN:
- Re-explain the SAME topic using:
  • Simpler language
  • Different analogy
  • Step-by-step breakdown

- DO NOT move forward until understanding is confirmed

-----------------------------------
PROGRESSION RULE
-----------------------------------
Only move to the NEXT topic if:
- User confirms understanding (e.g., "yes", "got it", correct explanation)

When moving forward:
- Update topics_completed
- Set new current_topic

-----------------------------------
MODULE COMPLETION
-----------------------------------
When ALL topics are completed:
- Say EXACTLY:

"Module complete! Ready to mark as done?"

- Do NOT continue teaching beyond module

-----------------------------------
STRICT BOUNDARIES
-----------------------------------
- NEVER go off-topic from the given module subject
- NEVER introduce unrelated concepts
- ONLY use the provided scraped textbook context
- If something is missing, say:
  "This is not covered in the current module."

-----------------------------------
CONTEXT USAGE
-----------------------------------
You will be given:
- Module topic list
- Scraped textbook/study material

You MUST:
- Base ALL explanations strictly on this context
- NOT hallucinate extra syllabus

-----------------------------------
MEMORY TRACKING (INTERNAL)
-----------------------------------
Maintain internally (do not show unless asked):
- topics_completed = []
- current_topic = None
- topics_remaining = []

-----------------------------------
TONE
-----------------------------------
- Friendly
- Patient
- Encouraging
- Slightly conversational (like a good senior teaching you)

-----------------------------------
IMPORTANT
-----------------------------------
You are NOT a general chatbot.
You are a STRICT module-based teaching system.

Stay focused. Teach deeply. Ensure understanding.

Start by introducing the first topic.
"""


async def teach_module(
    subject: str,
    module_number: int,
    user_message: str,
    chat_history: list[dict],
    user_id: str,
) -> str:
    """
    Teaching-mode conversation for a specific module.
    Uses RAG context from Qdrant + full chat_history for multi-turn dialogue.
    Returns the assistant's reply as a plain string.
    """
    vector = await _embed_question(user_message)

    # Search Qdrant scoped to this specific module collection
    collection = f"{_collection_name(subject)}_module_{module_number}"
    qdrant = AsyncQdrantClient(host=settings.QDRANT_HOST, port=settings.QDRANT_PORT)
    context_chunks: list[str] = []
    try:
        results: list[ScoredPoint] = await qdrant.search(
            collection_name=collection,
            query_vector=vector,
            limit=_TOP_K,
            score_threshold=_SCORE_THRESHOLD,
        )
        context_chunks = [hit.payload.get("text", "") for hit in results]
    except Exception as exc:
        logger.warning("Qdrant search failed for teach_module: %s", exc)
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
        temperature=0.5,
        max_tokens=1024,
    )

    return completion.choices[0].message.content or ""


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
