"""Important questions — store professor's questions, embed in Qdrant."""
import io
import re
import uuid

import pdfplumber
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel
from qdrant_client import AsyncQdrantClient
from qdrant_client.models import Distance, PointStruct, VectorParams
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from agents.embedder import embed, EMBED_DIM
from api.routes.auth import current_user_dep
from core.config import get_settings
from core.database import get_db
from models.db_models import ImportantQuestion, Subject, User

router = APIRouter(prefix="/important-questions", tags=["important-questions"])
settings = get_settings()


# ─── Schemas ─────────────────────────────────────────────────────────────────

class UploadRequest(BaseModel):
    text: str        # raw text — one question per line or numbered list
    module_number: int = 0


class QuestionOut(BaseModel):
    id: str
    question: str
    module_number: int
    created_at: str


class UploadResponse(BaseModel):
    count: int
    questions: list[str]


# ─── Helpers ─────────────────────────────────────────────────────────────────

def _parse_questions(raw: str) -> list[str]:
    """
    Parse a numbered list into individual questions.
    Multi-line questions (continuation lines after a number) are joined together.
    Supports formats: '1.' '1)' 'Q1.' etc.
    """
    lines = raw.strip().splitlines()
    questions: list[str] = []
    current: list[str] = []

    _numbered = re.compile(r"^\s*(?:Q|q)?(\d+)[.)]\s+\S")

    for line in lines:
        stripped = line.strip()
        if not stripped:
            continue
        if _numbered.match(line):
            # Save previous question
            if current:
                questions.append(" ".join(current))
            # Strip the leading number prefix
            clean = re.sub(r"^\s*(?:Q|q)?\d+[.)]\s*", "", stripped)
            current = [clean] if clean else []
        else:
            # Continuation of the current question
            if current:
                current.append(stripped)
            else:
                # Unnumbered standalone line
                clean = re.sub(r"^[-•*]\s*", "", stripped)
                if len(clean) > 5:
                    questions.append(clean)

    if current:
        questions.append(" ".join(current))

    return [q for q in questions if len(q) > 5]


async def _ensure_collection(client: AsyncQdrantClient, name: str) -> None:
    existing = {c.name for c in (await client.get_collections()).collections}
    if name not in existing:
        await client.create_collection(
            collection_name=name,
            vectors_config=VectorParams(size=_EMBED_DIM, distance=Distance.COSINE),
        )


async def _verify_subject(db: AsyncSession, subject_id: str, user_id: uuid.UUID) -> Subject:
    result = await db.execute(
        select(Subject).where(
            Subject.id == uuid.UUID(subject_id),
            Subject.user_id == user_id,
        )
    )
    s = result.scalar_one_or_none()
    if s is None:
        raise HTTPException(status_code=404, detail="Subject not found")
    return s


# ─── Routes ──────────────────────────────────────────────────────────────────

@router.post("/{subject_id}", response_model=UploadResponse)
async def upload_questions(
    subject_id: str,
    body: UploadRequest,
    user: User = Depends(current_user_dep),
    db: AsyncSession = Depends(get_db),
):
    await _verify_subject(db, subject_id, user.id)
    questions = _parse_questions(body.text)
    if not questions:
        raise HTTPException(status_code=400, detail="No questions parsed from input")

    collection = f"important_{subject_id}"
    qdrant = AsyncQdrantClient(host=settings.QDRANT_HOST, port=settings.QDRANT_PORT)
    await _ensure_collection(qdrant, collection)

    # Get current max point id to avoid overwrites
    existing = await qdrant.count(collection)
    offset = existing.count

    points: list[PointStruct] = []
    db_rows: list[ImportantQuestion] = []

    for i, q in enumerate(questions):
        vector = await embed(q)
        points.append(PointStruct(
            id=offset + i,
            vector=vector,
            payload={"question": q, "subject_id": subject_id, "module_number": body.module_number},
        ))
        db_rows.append(ImportantQuestion(
            user_id=user.id,
            subject_id=uuid.UUID(subject_id),
            question=q,
            module_number=body.module_number,
        ))

    await qdrant.upsert(collection_name=collection, points=points)
    await qdrant.close()

    for row in db_rows:
        db.add(row)
    await db.commit()

    return UploadResponse(count=len(questions), questions=questions)


@router.get("/{subject_id}", response_model=list[QuestionOut])
async def get_questions(
    subject_id: str,
    user: User = Depends(current_user_dep),
    db: AsyncSession = Depends(get_db),
):
    await _verify_subject(db, subject_id, user.id)

    result = await db.execute(
        select(ImportantQuestion)
        .where(
            ImportantQuestion.subject_id == uuid.UUID(subject_id),
            ImportantQuestion.user_id == user.id,
        )
        .order_by(ImportantQuestion.created_at.asc())
    )
    rows = result.scalars().all()
    return [
        QuestionOut(
            id=str(r.id),
            question=r.question,
            module_number=r.module_number,
            created_at=r.created_at.isoformat(),
        )
        for r in rows
    ]


@router.delete("/{subject_id}/{question_id}", status_code=204)
async def delete_question(
    subject_id: str,
    question_id: str,
    user: User = Depends(current_user_dep),
    db: AsyncSession = Depends(get_db),
):
    await _verify_subject(db, subject_id, user.id)

    result = await db.execute(
        select(ImportantQuestion).where(
            ImportantQuestion.id == uuid.UUID(question_id),
            ImportantQuestion.user_id == user.id,
        )
    )
    row = result.scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Question not found")
    await db.delete(row)
    await db.commit()


@router.post("/{subject_id}/pdf", response_model=UploadResponse)
async def upload_pdf(
    subject_id: str,
    module_number: int = 0,
    file: UploadFile = File(...),
    user: User = Depends(current_user_dep),
    db: AsyncSession = Depends(get_db),
):
    """
    Upload a PDF file — extract text with pdfplumber, parse questions,
    embed and store exactly like the text upload endpoint.
    Only typed/digital PDFs work. Handwritten notes require OCR (not supported).
    """
    await _verify_subject(db, subject_id, user.id)

    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are accepted")

    raw_bytes = await file.read()
    if len(raw_bytes) > 20 * 1024 * 1024:  # 20 MB limit
        raise HTTPException(status_code=400, detail="PDF too large (max 20 MB)")

    # Extract text from all pages
    try:
        with pdfplumber.open(io.BytesIO(raw_bytes)) as pdf:
            pages_text = [page.extract_text() or "" for page in pdf.pages]
        raw_text = "\n".join(pages_text).strip()
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"Could not read PDF: {exc}")

    if not raw_text:
        raise HTTPException(
            status_code=422,
            detail="No text found in PDF. Only typed/digital PDFs are supported — handwritten notes cannot be read.",
        )

    questions = _parse_questions(raw_text)
    if not questions:
        raise HTTPException(status_code=400, detail="No questions could be parsed from the PDF")

    collection = f"important_{subject_id}"
    qdrant = AsyncQdrantClient(host=settings.QDRANT_HOST, port=settings.QDRANT_PORT)
    await _ensure_collection(qdrant, collection)

    existing = await qdrant.count(collection)
    offset = existing.count

    points: list[PointStruct] = []
    db_rows: list[ImportantQuestion] = []

    for i, q in enumerate(questions):
        vector = await embed(q)
        points.append(PointStruct(
            id=offset + i,
            vector=vector,
            payload={"question": q, "subject_id": subject_id, "module_number": module_number},
        ))
        db_rows.append(ImportantQuestion(
            user_id=user.id,
            subject_id=uuid.UUID(subject_id),
            question=q,
            module_number=module_number,
        ))

    await qdrant.upsert(collection_name=collection, points=points)
    await qdrant.close()

    for row in db_rows:
        db.add(row)
    await db.commit()

    return UploadResponse(count=len(questions), questions=questions)
