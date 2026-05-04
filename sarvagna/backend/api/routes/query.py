import dataclasses
import logging
from datetime import datetime
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from agents.orchestrator import AgentResponse, OrchestratorRequest, orchestrate
from agents.roadmap_agent import ModuleStatus, get_roadmap, unlock_next_module
from agents.scraper_agent import scrape_content
from core.database import get_db
from core.gamification import LEVELS, XP_CONFIG
from models.db_models import Module, Progress, Query, Subject, User
from core.security import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(tags=["query"])


# ── helpers ──────────────────────────────────────────────────────────────────

def _compute_level(xp: int) -> int:
    level = 1
    for lvl in LEVELS:
        if xp >= lvl.xp_required:
            level = lvl.level
    return level


def _dataclass_to_dict(obj: Any) -> Any:
    if dataclasses.is_dataclass(obj):
        return {k: _dataclass_to_dict(v) for k, v in dataclasses.asdict(obj).items()}
    if isinstance(obj, list):
        return [_dataclass_to_dict(i) for i in obj]
    if isinstance(obj, datetime):
        return obj.isoformat()
    return obj


async def _award_xp(user_id: int, amount: int, db: AsyncSession) -> dict:
    result = await db.execute(select(Progress).where(Progress.user_id == user_id))
    prog = result.scalar_one_or_none()
    if not prog:
        return {"new_xp": 0, "new_level": 1, "leveled_up": False}

    old_level = prog.level
    prog.xp += amount
    new_level = _compute_level(prog.xp)
    leveled_up = new_level > old_level
    prog.level = new_level
    return {"new_xp": prog.xp, "new_level": new_level, "leveled_up": leveled_up}


# ── request / response models ─────────────────────────────────────────────────

class QueryRequest(BaseModel):
    question: str
    subject_id: int
    action_type: Literal["ask", "flashcard", "roadmap"]


class QueryResponse(BaseModel):
    action_type: str
    data: Any
    xp_awarded: int
    new_xp: int
    new_level: int
    leveled_up: bool


class RoadmapRequest(BaseModel):
    subject_id: int


class ModuleStatusResponse(BaseModel):
    module_number: int
    title: str
    status: str
    topics: list
    xp_earned: int
    unlocked_at: datetime | None


class UnlockResponse(BaseModel):
    unlock_result: dict
    roadmap: list[ModuleStatusResponse]
    new_xp: int
    new_level: int
    leveled_up: bool


class QueryHistoryItem(BaseModel):
    id: int
    question: str
    exact_answer: str | None
    simplified_answer: str | None
    real_world_example: str | None
    sources: list
    subject_name: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


# ── routes ────────────────────────────────────────────────────────────────────

@router.post("", response_model=QueryResponse)
async def query(
    body: QueryRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # 1. verify subject ownership
    subject_result = await db.execute(
        select(Subject).where(Subject.id == body.subject_id, Subject.user_id == current_user.id)
    )
    subject = subject_result.scalar_one_or_none()
    if not subject:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Subject not found")

    # 2. find current active module
    modules_result = await db.execute(
        select(Module).where(Module.subject_id == body.subject_id).order_by(Module.number)
    )
    modules = modules_result.scalars().all()
    active_module = next(
        (m for m in modules if m.status == "unlocked"),
        modules[0] if modules else None,
    )
    module_title = active_module.title if active_module else ""
    topics = active_module.topics if active_module else []

    # 3. scrape context
    chunks: list[str] = []
    if body.action_type in ("ask", "flashcard"):
        try:
            chunks = await scrape_content(
                subject_name=subject.name,
                module_title=module_title,
                topics=topics,
            )
        except Exception as e:
            logger.warning("Scraper failed, continuing with empty context: %s", e)

    # 4. orchestrate
    try:
        agent_response: AgentResponse = await orchestrate(
            OrchestratorRequest(
                action_type=body.action_type,
                user_id=current_user.id,
                subject_id=body.subject_id,
                question=body.question,
                context_chunks=chunks,
                subject_name=subject.name,
                module_title=module_title,
                topics=topics,
                db=db,
            )
        )
    except Exception as e:
        logger.error("Orchestrator failed: %s", e)
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(e))

    # 5. save query row for "ask" only
    if body.action_type == "ask":
        data = agent_response.data
        q = Query(
            user_id=current_user.id,
            subject_id=body.subject_id,
            question=body.question,
            exact_answer=getattr(data, "exact_answer", None),
            simplified_answer=getattr(data, "simplified_answer", None),
            real_world_example=getattr(data, "real_world_example", None),
            sources=[],
        )
        db.add(q)

    # 6. award XP
    xp_amount = XP_CONFIG.ASK_QUESTION
    xp_result = await _award_xp(current_user.id, xp_amount, db)
    await db.commit()

    return QueryResponse(
        action_type=agent_response.action_type,
        data=_dataclass_to_dict(agent_response.data),
        xp_awarded=xp_amount,
        **xp_result,
    )


@router.post("/roadmap", response_model=list[ModuleStatusResponse])
async def roadmap(
    body: RoadmapRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        modules: list[ModuleStatus] = await get_roadmap(
            subject_id=body.subject_id,
            user_id=current_user.id,
            db=db,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))

    return [
        ModuleStatusResponse(
            module_number=m.module_number,
            title=m.title,
            status=m.status,
            topics=m.topics,
            xp_earned=m.xp_earned,
            unlocked_at=m.unlocked_at,
        )
        for m in modules
    ]


@router.post("/unlock", response_model=UnlockResponse)
async def unlock(
    body: RoadmapRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        unlock_result = await unlock_next_module(
            subject_id=body.subject_id,
            user_id=current_user.id,
            db=db,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))

    # unlock_next_module already added XP to progress; read back current state
    prog_result = await db.execute(select(Progress).where(Progress.user_id == current_user.id))
    prog = prog_result.scalar_one_or_none()

    new_xp = prog.xp if prog else 0
    new_level = _compute_level(new_xp)
    old_level = prog.level if prog else 1
    leveled_up = new_level > old_level

    if prog and leveled_up:
        prog.level = new_level
        await db.commit()

    # fresh roadmap after unlock
    updated_modules = await get_roadmap(
        subject_id=body.subject_id,
        user_id=current_user.id,
        db=db,
    )

    return UnlockResponse(
        unlock_result=unlock_result,
        roadmap=[
            ModuleStatusResponse(
                module_number=m.module_number,
                title=m.title,
                status=m.status,
                topics=m.topics,
                xp_earned=m.xp_earned,
                unlocked_at=m.unlocked_at,
            )
            for m in updated_modules
        ],
        new_xp=new_xp,
        new_level=new_level,
        leveled_up=leveled_up,
    )


@router.get("/history", response_model=list[QueryHistoryItem])
async def history(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Query)
        .options(selectinload(Query.subject))
        .where(Query.user_id == current_user.id)
        .order_by(Query.created_at.desc())
        .limit(20)
    )
    rows = result.scalars().all()

    return [
        QueryHistoryItem(
            id=q.id,
            question=q.question,
            exact_answer=q.exact_answer,
            simplified_answer=q.simplified_answer,
            real_world_example=q.real_world_example,
            sources=q.sources or [],
            subject_name=q.subject.name if q.subject else None,
            created_at=q.created_at,
        )
        for q in rows
    ]
