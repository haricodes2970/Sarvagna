"""Celery task definitions for Sarvagna background jobs.

Start the worker from sarvagna/backend/ with:
    celery -A tasks worker --loglevel=info
"""
from celery import Celery

from core.config import get_settings

settings = get_settings()

celery_app = Celery(
    "sarvagna",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
)


@celery_app.task(bind=True, max_retries=3, default_retry_delay=30)
def scrape_and_chunk(self, subject_id: str, module_number: int):
    """Scrape web content for a module and chunk it into Qdrant.

    Called automatically when a subject reaches 80% completion.

    Args:
        subject_id: UUID string of the subject.
        module_number: The module number to scrape (1-indexed).
    """
    import asyncio
    from agents.scraper_agent import scrape_subject
    from agents.chunker_agent import chunk_and_store

    try:
        # Scrape
        docs = asyncio.run(scrape_subject(subject_id=subject_id, module_number=module_number))
        if not docs:
            return {"status": "no_content", "subject_id": subject_id, "module": module_number}

        # Chunk + embed into Qdrant
        asyncio.run(chunk_and_store(subject_id=subject_id, module_number=module_number, docs=docs))

        return {
            "status": "success",
            "subject_id": subject_id,
            "module": module_number,
            "chunks": len(docs),
        }
    except Exception as exc:
        raise self.retry(exc=exc)
