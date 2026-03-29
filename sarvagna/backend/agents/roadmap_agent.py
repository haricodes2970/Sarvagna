import logging
import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import async_session
from core.gamification import ACTION_XP_MAP, BADGES, LEVELS, STREAK_CONFIG
from models.db_models import Progress, Subject, User

logger = logging.getLogger(__name__)


def _compute_level(total_xp: int) -> int:
    current = 1
    for lvl in LEVELS:
        if total_xp >= lvl.xp_required:
            current = lvl.level
    return current


async def award_xp(user_id: str, action: str) -> dict:
    """
    Award XP for a given action. Returns dict with xp_earned and new level info.
    """
    xp_amount = ACTION_XP_MAP.get(action, 0)
    if xp_amount == 0:
        logger.warning("Unknown action '%s', no XP awarded", action)
        return {"xp_earned": 0, "new_xp": 0, "level": 1, "level_name": LEVELS[0].name}

    async with async_session() as session:
        user = await _get_user(session, user_id)
        old_level = user.level

        user.xp += xp_amount
        user.level = _compute_level(user.xp)

        await session.commit()
        await session.refresh(user)

        level_obj = next((l for l in LEVELS if l.level == user.level), LEVELS[0])
        leveled_up = user.level > old_level

        return {
            "xp_earned": xp_amount,
            "new_xp": user.xp,
            "level": user.level,
            "level_name": level_obj.name,
            "leveled_up": leveled_up,
        }


async def check_badges(user_id: str) -> list[str]:
    """
    Evaluate which badges the user has newly unlocked based on current stats.
    Returns list of newly earned badge IDs.
    """
    async with async_session() as session:
        user = await _get_user(session, user_id)

        total_queries_result = await session.execute(
            select(Progress).where(Progress.user_id == user.id)
        )
        all_progress = total_queries_result.scalars().all()
        completed_modules = sum(1 for p in all_progress if p.is_completed)

        completed_subjects_result = await session.execute(
            select(Subject).where(Subject.user_id == user.id, Subject.is_completed == True)
        )
        completed_subjects = len(completed_subjects_result.scalars().all())

        all_subjects_result = await session.execute(
            select(Subject).where(Subject.user_id == user.id)
        )
        total_subjects = len(all_subjects_result.scalars().all())

        earned: list[str] = []

        conditions: dict[str, bool] = {
            "first_login": user.last_login is not None,
            "5_day_streak": user.streak >= 5,
            "7_day_streak": user.streak >= 7,
            "30_day_streak": user.streak >= 30,
            "10_modules": completed_modules >= 10,
            "50_modules": completed_modules >= 50,
            "subject_complete": completed_subjects >= 1,
            "all_slots_full": total_subjects >= 10,
            "level_10": user.level >= 10,
        }

        for badge in BADGES:
            if badge.id in conditions and conditions[badge.id]:
                earned.append(badge.id)

        return earned


async def update_streak(user_id: str) -> dict:
    """
    Update the user's streak based on last_login. Returns updated streak info.
    """
    async with async_session() as session:
        user = await _get_user(session, user_id)
        now = datetime.now(timezone.utc)
        bonus_xp = 0

        if user.last_login is None:
            user.streak = 1
        else:
            last = user.last_login.replace(tzinfo=timezone.utc) if user.last_login.tzinfo is None else user.last_login
            delta_hours = (now - last).total_seconds() / 3600

            if delta_hours < 24:
                pass  # Same day, no change
            elif delta_hours < STREAK_CONFIG.GRACE_PERIOD_HOURS * 2:
                user.streak += STREAK_CONFIG.DAILY_INCREMENT
                if user.streak % 7 == 0:
                    bonus_xp = STREAK_CONFIG.BONUS_ON_7_DAYS
                    user.xp += bonus_xp
                    user.level = _compute_level(user.xp)
            else:
                user.streak = 1 if STREAK_CONFIG.STREAK_RESET_AFTER_MISS else user.streak

        user.last_login = now

        await session.commit()
        return {"streak": user.streak, "bonus_xp": bonus_xp}


async def get_roadmap(user_id: str, subject_id: str) -> dict:
    """
    Return progress roadmap for a user's subject: modules completed, remaining, % done.
    """
    async with async_session() as session:
        user = await _get_user(session, user_id)

        subject_result = await session.execute(
            select(Subject).where(Subject.id == uuid.UUID(subject_id), Subject.user_id == user.id)
        )
        subject = subject_result.scalar_one_or_none()
        if subject is None:
            return {"error": "Subject not found"}

        progress_result = await session.execute(
            select(Progress).where(
                Progress.user_id == user.id,
                Progress.subject_id == uuid.UUID(subject_id),
            )
        )
        all_modules = progress_result.scalars().all()
        completed = [p for p in all_modules if p.is_completed]
        total = subject.modules_scraped or len(all_modules)
        pct = round(len(completed) / total * 100, 1) if total > 0 else 0.0

        return {
            "subject_id": subject_id,
            "subject_name": subject.name,
            "total_modules": total,
            "completed_modules": len(completed),
            "remaining_modules": total - len(completed),
            "completion_percentage": pct,
            "is_completed": subject.is_completed,
        }


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

async def _get_user(session: AsyncSession, user_id: str) -> User:
    result = await session.execute(select(User).where(User.id == uuid.UUID(user_id)))
    user = result.scalar_one_or_none()
    if user is None:
        raise ValueError(f"User {user_id} not found")
    return user
