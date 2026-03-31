"""Singleton sentence-transformers embedder — BAAI/bge-base-en-v1.5 (768-dim, COSINE)."""
import asyncio
import logging
from functools import lru_cache

from sentence_transformers import SentenceTransformer

logger = logging.getLogger(__name__)

_MODEL_NAME = "BAAI/bge-base-en-v1.5"
EMBED_DIM = 768


@lru_cache(maxsize=1)
def _get_model() -> SentenceTransformer:
    logger.info("Loading embedding model '%s' …", _MODEL_NAME)
    model = SentenceTransformer(_MODEL_NAME)
    logger.info("Embedding model loaded.")
    return model


def embed_sync(text: str) -> list[float]:
    """Synchronous embed — runs on calling thread. Use embed() from async code."""
    model = _get_model()
    vector = model.encode(text, normalize_embeddings=True)
    return vector.tolist()


async def embed(text: str) -> list[float]:
    """Async wrapper — offloads CPU work to thread pool so event loop stays free."""
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, embed_sync, text)
