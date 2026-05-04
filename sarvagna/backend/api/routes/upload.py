import logging
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from agents.scraper_agent import _chunk_text, _extract_text
from core.database import get_db
from core.security import get_current_user
from core import vector_store
from models.db_models import UploadedFile, User
from services.ocr_service import extract_text_ocr

logger = logging.getLogger(__name__)
router = APIRouter(tags=["upload"])

UPLOAD_DIR = Path(__file__).resolve().parent.parent.parent / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)

ALLOWED_TYPES = {
    "application/pdf": "pdf",
    "text/plain": "txt",
    "text/markdown": "md",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
}
ALLOWED_EXTENSIONS = {".pdf", ".txt", ".md", ".docx"}


def _collection(user_id: int) -> str:
    return f"user_{user_id}_uploads"


def _extract_from_file(path: Path, file_type: str, raw_bytes: bytes) -> str:
    if file_type == "pdf":
        import pdfplumber
        pages: list[str] = []
        with pdfplumber.open(path) as pdf:
            for page in pdf.pages:
                pages.append(page.extract_text() or "")
        text = "\n".join(pages)
        total_pages = max(len(pages), 1)
        if len(text) / total_pages < 100:
            logger.info("PDF text sparse (%d chars/%d pages), falling back to OCR", len(text), total_pages)
            ocr_text = extract_text_ocr(raw_bytes)
            if ocr_text:
                return ocr_text
        return text
    if file_type == "docx":
        from docx import Document
        doc = Document(str(path))
        return "\n".join(p.text for p in doc.paragraphs)
    return path.read_text(encoding="utf-8", errors="ignore")


class UploadResponse(BaseModel):
    filename: str
    chunk_count: int
    status: str


class UrlUploadRequest(BaseModel):
    url: str
    subject_id: Optional[int] = None


class FileRecord(BaseModel):
    id: int
    filename: str
    file_type: str
    chunk_count: int
    subject_id: Optional[int]
    created_at: str

    model_config = {"from_attributes": True}


@router.post("/pdf", response_model=UploadResponse, status_code=status.HTTP_201_CREATED)
async def upload_file(
    file: UploadFile = File(...),
    subject_id: Optional[int] = Form(None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    ext = Path(file.filename or "").suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported file type. Allowed: {', '.join(ALLOWED_EXTENSIONS)}",
        )

    file_type = ext.lstrip(".")
    safe_name = f"{current_user.id}_{file.filename}"
    dest = UPLOAD_DIR / safe_name

    content = await file.read()
    dest.write_bytes(content)

    try:
        text = _extract_from_file(dest, file_type, content)
    except Exception as e:
        dest.unlink(missing_ok=True)
        raise HTTPException(status_code=500, detail=f"Text extraction failed: {e}")
    finally:
        dest.unlink(missing_ok=True)

    chunks = _chunk_text(text)
    chunk_count = await vector_store.index_chunks(
        collection_name=_collection(current_user.id),
        chunks=chunks,
        payload={"user_id": current_user.id, "filename": file.filename, "subject_id": subject_id},
    )

    record = UploadedFile(
        user_id=current_user.id,
        subject_id=subject_id,
        filename=file.filename,
        file_type=file_type,
        chunk_count=chunk_count,
    )
    db.add(record)
    await db.commit()

    return UploadResponse(filename=file.filename, chunk_count=chunk_count, status="indexed")


@router.post("/url", response_model=UploadResponse, status_code=status.HTTP_201_CREATED)
async def upload_url(
    body: UrlUploadRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    import httpx

    headers = {"User-Agent": "Mozilla/5.0 (compatible; Sarvagna/1.0)"}
    try:
        async with httpx.AsyncClient(headers=headers, timeout=15) as client:
            resp = await client.get(body.url, follow_redirects=True)
            resp.raise_for_status()
            html = resp.text
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to fetch URL: {e}")

    text = _extract_text(html)
    if len(text) < 50:
        raise HTTPException(status_code=400, detail="Page has too little text to index")

    chunks = _chunk_text(text)
    chunk_count = await vector_store.index_chunks(
        collection_name=_collection(current_user.id),
        chunks=chunks,
        payload={"user_id": current_user.id, "filename": body.url, "subject_id": body.subject_id},
    )

    record = UploadedFile(
        user_id=current_user.id,
        subject_id=body.subject_id,
        filename=body.url,
        file_type="url",
        chunk_count=chunk_count,
    )
    db.add(record)
    await db.commit()

    return UploadResponse(filename=body.url, chunk_count=chunk_count, status="indexed")


@router.get("/files", response_model=list[FileRecord])
async def list_files(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(UploadedFile)
        .where(UploadedFile.user_id == current_user.id)
        .order_by(UploadedFile.created_at.desc())
    )
    rows = result.scalars().all()
    return [
        FileRecord(
            id=r.id,
            filename=r.filename,
            file_type=r.file_type,
            chunk_count=r.chunk_count,
            subject_id=r.subject_id,
            created_at=r.created_at.isoformat(),
        )
        for r in rows
    ]


@router.delete("/files/{file_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_file(
    file_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(UploadedFile).where(
            UploadedFile.id == file_id,
            UploadedFile.user_id == current_user.id,
        )
    )
    record = result.scalar_one_or_none()
    if not record:
        raise HTTPException(status_code=404, detail="File not found")

    await vector_store.delete_by_payload(
        collection_name=_collection(current_user.id),
        match={"user_id": current_user.id, "filename": record.filename},
    )

    await db.delete(record)
    await db.commit()
