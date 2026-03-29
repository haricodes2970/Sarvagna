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
