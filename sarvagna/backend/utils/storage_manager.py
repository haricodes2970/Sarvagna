"""
storage_manager.py — Supabase Storage integration for Sarvagna.

Bucket: 'academic-docs' (create it in Supabase dashboard as Public).

upload_to_supabase(content, filename) → public URL string
get_or_create_bucket()                → ensures bucket exists on first use
"""
import logging
import mimetypes
from pathlib import PurePosixPath

from core.config import settings

logger = logging.getLogger(__name__)

BUCKET = "academic-docs"


def _client():
    """Return a Supabase client using service role key (bypasses RLS)."""
    from supabase import create_client
    key = settings.supabase_key
    if not settings.SUPABASE_URL or not key:
        raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_KEY (or SUPABASE_SERVICE_ROLE_KEY) must be set")
    return create_client(settings.SUPABASE_URL, key)


def _ensure_bucket(sb) -> None:
    """Create the bucket if it doesn't exist yet."""
    try:
        buckets = sb.storage.list_buckets()
        names = [b.name for b in buckets]
        if BUCKET not in names:
            sb.storage.create_bucket(BUCKET, options={"public": True})
            logger.info("Created Supabase bucket: %s", BUCKET)
    except Exception as e:
        logger.warning("Could not verify/create bucket '%s': %s", BUCKET, e)


async def upload_to_supabase(file_content: bytes, filename: str) -> str:
    """
    Upload bytes to the 'academic-docs' Supabase bucket.

    Returns the public URL of the uploaded file.
    Overwrites if the file already exists (upsert).
    """
    import asyncio

    def _sync_upload() -> str:
        sb = _client()
        _ensure_bucket(sb)

        # Sanitise filename — no path traversal
        safe_name = PurePosixPath(filename).name or "document.pdf"
        mime = mimetypes.guess_type(safe_name)[0] or "application/pdf"

        sb.storage.from_(BUCKET).upload(
            path=safe_name,
            file=file_content,
            file_options={"content-type": mime, "upsert": "true"},
        )

        public_url: str = sb.storage.from_(BUCKET).get_public_url(safe_name)
        logger.info("Uploaded to Supabase: %s → %s", safe_name, public_url)
        return public_url

    # Run sync Supabase client in thread to keep FastAPI async
    return await asyncio.to_thread(_sync_upload)
