from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from core.gamification import BADGES, LEVELS, SUBJECT_SLOT_CONFIG
from core.security import get_current_user
from models.db_models import Progress, Subject, User

router = APIRouter(tags=["progress"])

MAX_SLOTS = SUBJECT_SLOT_CONFIG.MAX_SUBJECTS

STREAK_BADGE_MAP = {
    5: "5_day_streak",
    7: "7_day_streak",
    30: "30_day_streak",
}

BADGE_IDS = {b.id for b in BADGES}


def _compute_level(xp: int) -> int:
    level = 1
    for lvl in LEVELS:
        if xp >= lvl.xp_required:
            level = lvl.level
    return level


def _check_badges(
    current_badges: list,
    new_xp: int,
    new_level: int,
    streak_days: int,
    active_subject_count: int,
) -> list[str]:
    earned = set(current_badges)
    unlocked = []

    for threshold, badge_id in STREAK_BADGE_MAP.items():
        if streak_days >= threshold and badge_id not in earned:
            unlocked.append(badge_id)
            earned.add(badge_id)

    if new_level == 10 and "level_10" not in earned:
        unlocked.append("level_10")
        earned.add("level_10")

    if active_subject_count >= MAX_SLOTS and "all_slots_full" not in earned:
        unlocked.append("all_slots_full")
        earned.add("all_slots_full")

    return unlocked


class ProgressResponse(BaseModel):
    xp: int
    level: int
    streak_days: int
    badges: list

    model_config = {"from_attributes": True}


class XPAddRequest(BaseModel):
    amount: int
    action: str | None = None


class XPAddResponse(BaseModel):
    new_xp: int
    new_level: int
    leveled_up: bool
    new_badges: list[str]


@router.get("", response_model=ProgressResponse)
async def get_progress(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Progress).where(Progress.user_id == current_user.id))
    prog = result.scalar_one_or_none()
    if not prog:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Progress not found")
    return prog


@router.post("/xp", response_model=XPAddResponse)
async def add_xp(
    body: XPAddRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Progress).where(Progress.user_id == current_user.id))
    prog = result.scalar_one_or_none()
    if not prog:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Progress not found")

    old_level = prog.level
    prog.xp += body.amount
    new_level = _compute_level(prog.xp)
    leveled_up = new_level > old_level
    prog.level = new_level

    subject_count_result = await db.execute(
        select(func.count()).where(Subject.user_id == current_user.id, Subject.status == "active")
    )
    active_subject_count = subject_count_result.scalar_one()

    new_badges = _check_badges(prog.badges, prog.xp, new_level, prog.streak_days, active_subject_count)
    if new_badges:
        prog.badges = list(prog.badges) + new_badges

    await db.commit()

    return XPAddResponse(
        new_xp=prog.xp,
        new_level=prog.level,
        leveled_up=leveled_up,
        new_badges=new_badges,
    )
