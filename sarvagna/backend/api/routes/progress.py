import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from agents import roadmap_agent
from api.routes.auth import current_user_dep
from core.database import get_db
from core.gamification import BADGES, LEVELS, XP_CONFIG
from models.db_models import Progress, Subject, User

router = APIRouter(prefix="/progress", tags=["progress"])


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class BadgeOut(BaseModel):
    id: str
    name: str
    condition: str


class ProgressOverview(BaseModel):
    user_id: str
    xp: int
    level: int
    level_name: str
    xp_to_next_level: int | None
    streak: int
    badges: list[BadgeOut]


class ModuleNode(BaseModel):
    module_number: int
    is_completed: bool
    completed_at: datetime | None


class RoadmapResponse(BaseModel):
    subject_id: str
    subject_name: str
    total_modules: int
    completed_modules: int
    completion_percentage: float
    modules: list[ModuleNode]


class CompleteModuleRequest(BaseModel):
    subject_id: str
    module_number: int


class CompleteModuleResponse(BaseModel):
    xp_earned: int
    new_xp: int
    level: int
    level_name: str
    leveled_up: bool
    module_number: int
    subject_id: str


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _level_name(level: int) -> str:
    obj = next((l for l in LEVELS if l.level == level), LEVELS[0])
    return obj.name


def _xp_to_next(current_xp: int, level: int) -> int | None:
    next_lvl = next((l for l in LEVELS if l.level == level + 1), None)
    return (next_lvl.xp_required - current_xp) if next_lvl else None


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.get("", response_model=ProgressOverview)
async def get_progress(
    user: User = Depends(current_user_dep),
    db: AsyncSession = Depends(get_db),
):
    earned_badge_ids = await roadmap_agent.check_badges(str(user.id))
    badge_map = {b.id: b for b in BADGES}

    return ProgressOverview(
        user_id=str(user.id),
        xp=user.xp,
        level=user.level,
        level_name=_level_name(user.level),
        xp_to_next_level=_xp_to_next(user.xp, user.level),
        streak=user.streak,
        badges=[
            BadgeOut(id=bid, name=badge_map[bid].name, condition=badge_map[bid].condition)
            for bid in earned_badge_ids
            if bid in badge_map
        ],
    )


@router.get("/roadmap/{subject_id}", response_model=RoadmapResponse)
async def get_roadmap(
    subject_id: str,
    user: User = Depends(current_user_dep),
    db: AsyncSession = Depends(get_db),
):
    subject_result = await db.execute(
        select(Subject).where(
            Subject.id == uuid.UUID(subject_id),
            Subject.user_id == user.id,
        )
    )
    subject = subject_result.scalar_one_or_none()
    if subject is None:
        raise HTTPException(status_code=404, detail="Subject not found")

    progress_result = await db.execute(
        select(Progress)
        .where(Progress.user_id == user.id, Progress.subject_id == uuid.UUID(subject_id))
        .order_by(Progress.module_number)
    )
    all_progress = progress_result.scalars().all()

    total = max(subject.modules_scraped, 5)  # always show at least 5 nodes
    progress_map = {p.module_number: p for p in all_progress}

    modules = [
        ModuleNode(
            module_number=n,
            is_completed=progress_map[n].is_completed if n in progress_map else False,
            completed_at=progress_map[n].completed_at if n in progress_map else None,
        )
        for n in range(1, total + 1)
    ]

    completed_count = sum(1 for m in modules if m.is_completed)
    pct = round(completed_count / total * 100, 1) if total > 0 else 0.0

    return RoadmapResponse(
        subject_id=subject_id,
        subject_name=subject.name,
        total_modules=total,
        completed_modules=completed_count,
        completion_percentage=pct,
        modules=modules,
    )


@router.post("/module/complete", response_model=CompleteModuleResponse)
async def complete_module(
    body: CompleteModuleRequest,
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

    progress_result = await db.execute(
        select(Progress).where(
            Progress.user_id == user.id,
            Progress.subject_id == uuid.UUID(body.subject_id),
            Progress.module_number == body.module_number,
        )
    )
    prog = progress_result.scalar_one_or_none()

    if prog is None:
        prog = Progress(
            user_id=user.id,
            subject_id=uuid.UUID(body.subject_id),
            module_number=body.module_number,
        )
        db.add(prog)

    if prog.is_completed:
        raise HTTPException(status_code=400, detail="Module already completed")

    prog.is_completed = True
    prog.completed_at = datetime.now(timezone.utc)
    await db.flush()

    # Check if all modules done → mark subject complete
    all_progress_result = await db.execute(
        select(Progress).where(
            Progress.user_id == user.id,
            Progress.subject_id == uuid.UUID(body.subject_id),
        )
    )
    all_modules = all_progress_result.scalars().all()
    if subject.modules_scraped > 0 and all(m.is_completed for m in all_modules):
        subject.is_completed = True

    await db.commit()

    xp_result = await roadmap_agent.award_xp(str(user.id), "complete_module")

    return CompleteModuleResponse(
        xp_earned=xp_result["xp_earned"],
        new_xp=xp_result["new_xp"],
        level=xp_result["level"],
        level_name=xp_result["level_name"],
        leveled_up=xp_result.get("leveled_up", False),
        module_number=body.module_number,
        subject_id=body.subject_id,
    )
