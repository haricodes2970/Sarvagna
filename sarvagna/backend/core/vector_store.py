import logging
import uuid

from qdrant_client import AsyncQdrantClient
from qdrant_client import models as qm

from core.config import settings

logger = logging.getLogger(__name__)

VECTOR_DIM = 768


def _client() -> AsyncQdrantClient:
    url = settings.QDRANT_URL or f"http://{settings.QDRANT_HOST}:{settings.QDRANT_PORT}"
    return AsyncQdrantClient(url=url, api_key=settings.QDRANT_API_KEY or None)


async def _embed(text: str) -> list[float]:
    if not settings.GEMINI_API_KEY:
        return [0.0] * VECTOR_DIM
    try:
        from google import genai
        client = genai.Client(api_key=settings.GEMINI_API_KEY)
        result = await client.aio.models.embed_content(
            model="text-embedding-004",
            contents=text,
        )
        return list(result.embeddings[0].values)
    except Exception as e:
        logger.warning("Embed failed, using zero vector: %s", e)
        return [0.0] * VECTOR_DIM


async def _ensure_collection(qdrant: AsyncQdrantClient, name: str) -> None:
    try:
        await qdrant.get_collection(name)
    except Exception:
        await qdrant.create_collection(
            collection_name=name,
            vectors_config=qm.VectorParams(size=VECTOR_DIM, distance=qm.Distance.COSINE),
        )


async def index_chunks(
    collection_name: str,
    chunks: list,   # list[str] or list[dict with "text","section","page"]
    payload: dict,
) -> int:
    """
    Accept plain strings OR ContextualChunk.to_dict() dicts.
    Dicts must have key "text"; optional keys "section" and "page"
    are stored in the Qdrant payload for structured retrieval.
    """
    if not chunks:
        return 0
    try:
        qdrant = _client()
        await _ensure_collection(qdrant, collection_name)
        points = []
        for chunk in chunks:
            if isinstance(chunk, dict):
                text = chunk["text"]
                extra = {k: chunk[k] for k in ("section", "page") if k in chunk}
            else:
                text = chunk
                extra = {}
            vector = await _embed(text)
            points.append(qm.PointStruct(
                id=str(uuid.uuid4()),
                vector=vector,
                payload={**payload, **extra, "text": text},
            ))
        await qdrant.upsert(collection_name=collection_name, points=points)
        return len(points)
    except Exception as e:
        logger.error("Qdrant index_chunks failed: %s", e)
        return 0


async def delete_by_payload(collection_name: str, match: dict) -> None:
    try:
        qdrant = _client()
        conditions = [
            qm.FieldCondition(key=k, match=qm.MatchValue(value=v))
            for k, v in match.items()
        ]
        await qdrant.delete(
            collection_name=collection_name,
            points_selector=qm.FilterSelector(
                filter=qm.Filter(must=conditions)
            ),
        )
    except Exception as e:
        logger.error("Qdrant delete_by_payload failed: %s", e)


async def search_chunks(collection_name: str, query: str, top_k: int = 5) -> list[str]:
    try:
        qdrant = _client()
        vector = await _embed(query)
        results = await qdrant.search(
            collection_name=collection_name,
            query_vector=vector,
            limit=top_k,
        )
        return [r.payload.get("text", "") for r in results if r.payload]
    except Exception as e:
        logger.error("Qdrant search failed: %s", e)
        return []


async def search_chunks_filtered(
    collection_name: str,
    query: str,
    subject_id: int | None = None,
    top_k: int = 6,
) -> list[str]:
    """Semantic search with optional subject_id payload filter."""
    try:
        qdrant = _client()
        vector = await _embed(query)
        search_filter = None
        if subject_id is not None:
            search_filter = qm.Filter(
                must=[qm.FieldCondition(key="subject_id", match=qm.MatchValue(value=subject_id))]
            )
        results = await qdrant.search(
            collection_name=collection_name,
            query_vector=vector,
            query_filter=search_filter,
            limit=top_k,
        )
        return [r.payload.get("text", "") for r in results if r.payload]
    except Exception as e:
        logger.error("Qdrant filtered search failed: %s", e)
        return []


# expose client for direct scroll access (roadmap_agent)
client = _client()
