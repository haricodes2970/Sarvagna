"""
clear_data.py — Wipe all scraped data so a fresh re-scrape starts cleanly.

What this does:
  1. Deletes every collection in Qdrant (vectors from old embedding model)
  2. Resets modules_scraped = 0 for all subjects in PostgreSQL

Run this ONCE after switching the embedding model, then re-add subjects in the UI.
"""
import asyncio
import logging

from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from core.config import get_settings

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


async def clear_qdrant(settings) -> None:
    from qdrant_client import AsyncQdrantClient

    qdrant = AsyncQdrantClient(host=settings.QDRANT_HOST, port=settings.QDRANT_PORT)
    collections = await qdrant.get_collections()
    names = [c.name for c in collections.collections]

    if not names:
        logger.info("Qdrant: no collections found — already clean.")
        await qdrant.close()
        return

    logger.info("Qdrant: deleting %d collection(s): %s", len(names), names)
    for name in names:
        await qdrant.delete_collection(name)
        logger.info("  deleted: %s", name)

    await qdrant.close()
    logger.info("Qdrant: all collections deleted.")


async def reset_modules_scraped(settings) -> None:
    engine = create_async_engine(settings.DATABASE_URL)
    async with engine.begin() as conn:
        result = await conn.execute(
            text("UPDATE subjects SET modules_scraped = 0")
        )
        logger.info("PostgreSQL: reset modules_scraped = 0 on %d row(s)", result.rowcount)
    await engine.dispose()


async def main() -> None:
    settings = get_settings()
    logger.info("=== Sarvagna Data Clear ===")
    await clear_qdrant(settings)
    await reset_modules_scraped(settings)
    logger.info("=== Done. Re-scrape by opening each subject in the UI. ===")


if __name__ == "__main__":
    asyncio.run(main())
