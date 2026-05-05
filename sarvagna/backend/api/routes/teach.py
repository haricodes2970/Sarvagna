from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from agents.teacher import generate_tutor_response
from core.database import get_db
from core.security import get_current_user
from core import vector_store
from models.db_models import TeachingSession, User

router = APIRouter(tags=["teach"])


class MessageIn(BaseModel):
    role: str
    content: str


class SessionRequest(BaseModel):
    topic: str
    message: str
    subject_id: Optional[int] = None
    session_id: Optional[int] = None
    history: list[MessageIn] = []


class SourceChunk(BaseModel):
    filename: str
    page: str | int
    section: str
    score: float


class TutorReply(BaseModel):
    session_id: int
    exact: str
    simple: str
    example: str
    checkpoint: str
    spoken_text: str
    checkpoint_validated: Optional[bool] = None
    sources: list[SourceChunk] = []


class SessionSummary(BaseModel):
    id: int
    topic: str
    subject_id: Optional[int]
    message_count: int
    created_at: str
    updated_at: str


@router.post("/session", response_model=TutorReply, status_code=status.HTTP_200_OK)
async def teach_session(
    body: SessionRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Grounded Socratic session. Retrieves top-8 chunks with metadata →
    teacher strictly cites them. Returns sources for frontend sidebar.
    """
    collection = f"user_{current_user.id}_uploads"
    context_chunks = await vector_store.search_chunks_with_meta(
        collection_name=collection,
        query=f"{body.topic} {body.message}",
        subject_id=body.subject_id,
        top_k=8,
    )

    history = [{"role": m.role, "content": m.content} for m in body.history]

    response = await generate_tutor_response(
        topic=body.topic,
        user_message=body.message,
        session_history=history,
        context_chunks=context_chunks,
    )

    # Persist / update session
    session: TeachingSession | None = None
    if body.session_id:
        result = await db.execute(
            select(TeachingSession).where(
                TeachingSession.id == body.session_id,
                TeachingSession.user_id == current_user.id,
            )
        )
        session = result.scalar_one_or_none()

    if session is None:
        session = TeachingSession(
            user_id=current_user.id,
            subject_id=body.subject_id,
            topic=body.topic,
            messages=[],
        )
        db.add(session)
        await db.flush()

    msgs: list[dict] = list(session.messages or [])
    msgs.append({"role": "user", "content": body.message, "ts": datetime.now(timezone.utc).isoformat()})
    msgs.append({
        "role": "assistant",
        "content": response.to_dict(),
        "sources": [{"filename": c["filename"], "page": c["page"], "section": c["section"]} for c in context_chunks],
        "ts": datetime.now(timezone.utc).isoformat(),
    })
    session.messages = msgs
    session.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(session)

    # Deduplicated source list for sidebar
    seen_src: set[str] = set()
    sources: list[SourceChunk] = []
    for c in context_chunks:
        key = f"{c['filename']}:{c['page']}"
        if key not in seen_src:
            seen_src.add(key)
            sources.append(SourceChunk(
                filename=str(c["filename"]),
                page=c["page"],
                section=str(c["section"]),
                score=c["score"],
            ))

    return TutorReply(
        session_id=session.id,
        exact=response.exact,
        simple=response.simple,
        example=response.example,
        checkpoint=response.checkpoint,
        spoken_text=response.spoken_text,
        checkpoint_validated=response.checkpoint_validated,
        sources=sources,
    )


@router.get("/sessions/{subject_id}", response_model=list[SessionSummary])
async def list_sessions(
    subject_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(TeachingSession).where(
            TeachingSession.user_id == current_user.id,
            TeachingSession.subject_id == subject_id,
        ).order_by(TeachingSession.updated_at.desc())
    )
    sessions = result.scalars().all()
    return [
        SessionSummary(
            id=s.id,
            topic=s.topic,
            subject_id=s.subject_id,
            message_count=len(s.messages or []),
            created_at=s.created_at.isoformat(),
            updated_at=s.updated_at.isoformat(),
        )
        for s in sessions
    ]


@router.get("/export/{subject_id}")
async def export_sessions(
    subject_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(TeachingSession).where(
            TeachingSession.user_id == current_user.id,
            TeachingSession.subject_id == subject_id,
        ).order_by(TeachingSession.updated_at.desc())
    )
    sessions = result.scalars().all()
    return [
        {
            "id": s.id,
            "topic": s.topic,
            "subject_id": s.subject_id,
            "messages": s.messages or [],
            "created_at": s.created_at.isoformat(),
            "updated_at": s.updated_at.isoformat(),
        }
        for s in sessions
    ]
