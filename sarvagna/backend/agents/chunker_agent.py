import logging
import re

import httpx
import tiktoken
from qdrant_client import AsyncQdrantClient
from qdrant_client.models import Distance, PointStruct, VectorParams

from core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

_CHUNK_TOKENS = 512
_OVERLAP_TOKENS = 50
_EMBED_DIM = 768  # nomic-embed-text output dimension


def _collection_name(subject_name: str, module_number: int) -> str:
    slug = re.sub(r"[^a-z0-9]+", "_", subject_name.lower()).strip("_")
    return f"{slug}_module_{module_number}"


def _split_into_chunks(text: str, encoding: tiktoken.Encoding) -> list[str]:
    tokens = encoding.encode(text)
    chunks: list[str] = []
    start = 0

    while start < len(tokens):
        end = start + _CHUNK_TOKENS
        chunk_tokens = tokens[start:end]
        chunks.append(encoding.decode(chunk_tokens))
        start += _CHUNK_TOKENS - _OVERLAP_TOKENS

    return chunks


async def _embed(text: str) -> list[float]:
    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(
            f"{settings.OLLAMA_BASE_URL}/api/embeddings",
            json={"model": settings.OLLAMA_EMBED_MODEL, "prompt": text},
        )
        resp.raise_for_status()
        return resp.json()["embedding"]


async def _ensure_collection(client: AsyncQdrantClient, name: str) -> None:
    existing = {c.name for c in (await client.get_collections()).collections}
    if name not in existing:
        await client.create_collection(
            collection_name=name,
            vectors_config=VectorParams(size=_EMBED_DIM, distance=Distance.COSINE),
        )


async def chunk_and_store(
    raw_text: str,
    subject_name: str,
    module_number: int,
    image_urls: list[str] | None = None,
) -> int:
    """
    Split raw_text into 512-token chunks (50-token overlap), embed each with
    nomic-embed-text via Ollama, store in Qdrant. Returns number of chunks stored.
    Image URLs are stored in the first chunk's payload.
    """
    encoding = tiktoken.get_encoding("cl100k_base")
    chunks = _split_into_chunks(raw_text, encoding)
    logger.info("Split into %d chunks for '%s' module %d", len(chunks), subject_name, module_number)

    collection = _collection_name(subject_name, module_number)

    qdrant = AsyncQdrantClient(host=settings.QDRANT_HOST, port=settings.QDRANT_PORT)
    await _ensure_collection(qdrant, collection)

    points: list[PointStruct] = []
    for i, chunk in enumerate(chunks):
        vector = await _embed(chunk)
        payload: dict = {
            "text": chunk,
            "subject": subject_name,
            "module": module_number,
            "chunk_index": i,
        }
        if i == 0 and image_urls:
            payload["image_urls"] = image_urls
        points.append(PointStruct(id=i, vector=vector, payload=payload))

    await qdrant.upsert(collection_name=collection, points=points)
    await qdrant.close()

    logger.info("Stored %d vectors in collection '%s'", len(points), collection)
    return len(points)
