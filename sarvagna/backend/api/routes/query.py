import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from agents.orchestrator import handle_query
from api.routes.auth import current_user_dep
from core.database import get_db
from models.db_models import Query, Subject, User

router = APIRouter(prefix="/query", tags=["query"])


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class QueryRequest(BaseModel):
    question: str
    subject_id: str


class QueryResponse(BaseModel):
    exact_answer: str
    simplified_answer: str
    real_world_example: str
    xp_earned: int
    new_xp: int
    level: int
    level_name: str
    leveled_up: bool
    badges_unlocked: list[str]
    cached: bool


class QueryHistoryItem(BaseModel):
    id: str
    question: str
    exact_answer: str | None
    simplified_answer: str | None
    real_world_example: str | None
    subject_name: str
    created_at: datetime


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.post("", response_model=QueryResponse)
async def ask_question(
    body: QueryRequest,
    user: User = Depends(current_user_dep),
    db: AsyncSession = Depends(get_db),
):
    subject_result = await db.execute(
        select(Subject).where(
            Subject.id == uuid.UUID(body.subject_id),
            Subject.user_id == user.id,
        )
    )
    subject = subject_result.scalar_one_or_none()
    if subject is None:
        raise HTTPException(status_code=404, detail="Subject not found")

    result = await handle_query(
        question=body.question,
        subject=subject.name,
        user_id=str(user.id),
    )

    # Persist query to DB (skip on cache hit to avoid duplicates)
    if not result.get("cached", False):
        query_record = Query(
            user_id=user.id,
            subject_id=subject.id,
            question=body.question,
            exact_answer=result.get("exact_answer"),
            simplified_answer=result.get("simplified_answer"),
            real_world_example=result.get("real_world_example"),
        )
        db.add(query_record)
        await db.commit()

    return QueryResponse(
        exact_answer=result.get("exact_answer", ""),
        simplified_answer=result.get("simplified_answer", ""),
        real_world_example=result.get("real_world_example", ""),
        xp_earned=result.get("xp_earned", 0),
        new_xp=result.get("new_xp", 0),
        level=result.get("level", user.level),
        level_name=result.get("level_name", ""),
        leveled_up=result.get("leveled_up", False),
        badges_unlocked=result.get("badges_unlocked", []),
        cached=result.get("cached", False),
    )


@router.get("/history", response_model=list[QueryHistoryItem])
async def query_history(
    user: User = Depends(current_user_dep),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Query, Subject.name)
        .join(Subject, Query.subject_id == Subject.id)
        .where(Query.user_id == user.id)
        .order_by(Query.created_at.desc())
        .limit(20)
    )
    rows = result.all()

    return [
        QueryHistoryItem(
            id=str(q.id),
            question=q.question,
            exact_answer=q.exact_answer,
            simplified_answer=q.simplified_answer,
            real_world_example=q.real_world_example,
            subject_name=subject_name,
            created_at=q.created_at,
        )
        for q, subject_name in rows
    ]
