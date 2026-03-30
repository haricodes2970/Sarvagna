import uuid
from datetime import datetime, date

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from agents.orchestrator import handle_query
from api.routes.auth import current_user_dep
from core.config import get_settings
from core.database import get_db
from models.db_models import Query, Subject, User

router = APIRouter(prefix="/query", tags=["query"])

_DAILY_LIMIT = 10


# ---------------------------------------------------------------------------
# Rate limit helper (Redis)
# ---------------------------------------------------------------------------

async def _check_rate_limit(user_id: str) -> None:
    """Raise HTTP 429 if the user has exceeded the daily query limit."""
    try:
        import redis.asyncio as aioredis
        settings = get_settings()
        r = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
        today = date.today().isoformat()
        key = f"rate:{user_id}:{today}"
        count = await r.incr(key)
        if count == 1:
            await r.expire(key, 86400)  # 24-hour TTL on first write
        await r.aclose()
        if count > _DAILY_LIMIT:
            raise HTTPException(
                status_code=429,
                detail=f"Daily limit reached ({_DAILY_LIMIT} queries/day). Resets at midnight.",
            )
    except HTTPException:
        raise
    except Exception:
        # Redis unavailable — fail open (don't block the user)
        pass


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
    await _check_rate_limit(str(user.id))

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
