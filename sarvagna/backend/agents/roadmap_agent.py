import logging
from dataclasses import dataclass
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.gamification import XP_CONFIG
from models.db_models import Module, Progress, Subject

logger = logging.getLogger(__name__)

MODULES_PER_SUBJECT = 5


@dataclass
class ModuleStatus:
    module_number: int
    title: str
    status: str
    topics: list
    xp_earned: int
    unlocked_at: datetime | None


async def get_roadmap(subject_id: int, user_id: int, db: AsyncSession) -> list[ModuleStatus]:
    subject_result = await db.execute(
        select(Subject).where(Subject.id == subject_id, Subject.user_id == user_id)
    )
    subject = subject_result.scalar_one_or_none()
    if not subject:
        raise ValueError(f"Subject {subject_id} not found for user {user_id}")

    modules_result = await db.execute(
        select(Module).where(Module.subject_id == subject_id).order_by(Module.number)
    )
    modules = modules_result.scalars().all()

    return [
        ModuleStatus(
            module_number=m.number,
            title=m.title,
            status=m.status,
            topics=m.topics or [],
            xp_earned=subject.xp_earned,
            unlocked_at=m.unlocked_at,
        )
        for m in modules
    ]


async def unlock_next_module(subject_id: int, user_id: int, db: AsyncSession) -> dict:
    subject_result = await db.execute(
        select(Subject).where(Subject.id == subject_id, Subject.user_id == user_id)
    )
    subject = subject_result.scalar_one_or_none()
    if not subject:
        raise ValueError(f"Subject {subject_id} not found for user {user_id}")

    modules_result = await db.execute(
        select(Module).where(Module.subject_id == subject_id).order_by(Module.number)
    )
    modules = list(modules_result.scalars().all())

    current = next((m for m in modules if m.status == "unlocked"), None)
    if not current:
        current = next((m for m in modules if m.status == "locked"), None)
        if current:
            current.status = "unlocked"
            current.unlocked_at = datetime.now(timezone.utc)
            await db.commit()
            return {"unlocked": current.title, "subject_complete": False}
        return {"unlocked": None, "subject_complete": False}

    current.status = "complete"

    next_module = next((m for m in modules if m.number == current.number + 1), None)
    if next_module:
        next_module.status = "unlocked"
        next_module.unlocked_at = datetime.now(timezone.utc)

    xp_award = XP_CONFIG.COMPLETE_MODULE
    subject.xp_earned += xp_award

    progress_result = await db.execute(select(Progress).where(Progress.user_id == user_id))
    progress = progress_result.scalar_one_or_none()
    if progress:
        progress.xp += xp_award

    all_complete = all(m.status == "complete" for m in modules if m.id != (next_module.id if next_module else -1))
    subject_complete = not next_module and all_complete

    if subject_complete:
        subject.status = "complete"
        logger.info("Subject %d complete for user %d, slot freed", subject_id, user_id)

    await db.commit()

    return {
        "completed_module": current.title,
        "unlocked": next_module.title if next_module else None,
        "xp_awarded": xp_award,
        "subject_complete": subject_complete,
    }
