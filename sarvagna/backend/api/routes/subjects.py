import asyncio
import logging
import uuid
from datetime import datetime, timezone

from celery import Celery
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from agents.chunker_agent import chunk_and_store
from agents.scraper_agent import scrape_subject as _scrape_subject
from api.routes.auth import current_user_dep
from core.config import get_settings
from core.database import get_db
from core.gamification import SUBJECT_SLOT_CONFIG
from models.db_models import Subject, User
from services.syllabus_loader import get_subjects as _get_subjects

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/subjects", tags=["subjects"])
settings = get_settings()

_celery = Celery("sarvagna", broker=settings.REDIS_URL)


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class SubjectOut(BaseModel):
    id: str
    name: str
    branch: str
    semester: int
    modules_scraped: int
    is_completed: bool
    added_at: datetime
    scraping: str | None = None


class AddSubjectRequest(BaseModel):
    name: str
    branch: str
    semester: int


class ScrapeResponse(BaseModel):
    task_id: str
    message: str


class CatalogResponse(BaseModel):
    branch: str
    semester: int
    subjects: list[str]


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@router.get("/catalog", response_model=CatalogResponse)
async def get_catalog(
    branch: str,
    semester: int,
    _: User = Depends(current_user_dep),
):
    """Return subject names from the syllabus for a given branch + semester."""
    subjects = _get_subjects(branch, semester)
    return CatalogResponse(branch=branch, semester=semester, subjects=subjects)

@router.get("", response_model=list[SubjectOut])
async def list_subjects(
    user: User = Depends(current_user_dep),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Subject)
        .where(Subject.user_id == user.id, Subject.is_completed == False)
        .order_by(Subject.added_at.desc())
    )
    subjects = result.scalars().all()
    return [
        SubjectOut(
            id=str(s.id),
            name=s.name,
            branch=s.branch,
            semester=s.semester,
            modules_scraped=s.modules_scraped,
            is_completed=s.is_completed,
            added_at=s.added_at,
        )
        for s in subjects
    ]


async def _background_scrape(subject_id: str, subject_name: str, branch: str, semester: int) -> None:
    """Scrape all 5 modules in parallel after subject creation."""
    from core.database import async_session

    async def _scrape_one(module_number: int) -> None:
        try:
            content = await _scrape_subject(
                subject_name=subject_name,
                module_number=module_number,
                branch=branch,
                semester=semester,
            )
            if content and len(content) > 100:
                await chunk_and_store(content, subject_name, module_number)
                logger.info("Auto-scrape done: %s module %d", subject_name, module_number)
                # Mark this module as scraped in DB
                async with async_session() as db:
                    result = await db.execute(
                        select(Subject).where(Subject.id == uuid.UUID(subject_id))
                    )
                    subj = result.scalar_one_or_none()
                    if subj:
                        subj.modules_scraped = (subj.modules_scraped or 0) + 1
                        await db.commit()
            else:
                logger.warning("Auto-scrape: no content for %s module %d", subject_name, module_number)
        except Exception as exc:
            logger.error("Auto-scrape failed for %s module %d: %s", subject_name, module_number, exc)

    await asyncio.gather(*[_scrape_one(n) for n in range(1, 6)])


@router.post("/add", response_model=SubjectOut, status_code=status.HTTP_201_CREATED)
async def add_subject(
    body: AddSubjectRequest,
    background_tasks: BackgroundTasks,
    user: User = Depends(current_user_dep),
    db: AsyncSession = Depends(get_db),
):
    count_result = await db.execute(
        select(Subject).where(Subject.user_id == user.id, Subject.is_completed == False)
    )
    active_count = len(count_result.scalars().all())

    if active_count >= SUBJECT_SLOT_CONFIG.MAX_SUBJECTS:
        raise HTTPException(
            status_code=400,
            detail=f"Subject slot limit reached ({SUBJECT_SLOT_CONFIG.MAX_SUBJECTS} max). "
                   "Complete or remove a subject to add a new one.",
        )

    subject = Subject(
        user_id=user.id,
        name=body.name,
        branch=body.branch,
        semester=body.semester,
    )
    db.add(subject)
    await db.commit()
    await db.refresh(subject)

    # Kick off parallel scrape of all 5 modules in the background
    background_tasks.add_task(_background_scrape, str(subject.id), body.name, body.branch, body.semester)

    return SubjectOut(
        id=str(subject.id),
        name=subject.name,
        branch=subject.branch,
        semester=subject.semester,
        modules_scraped=subject.modules_scraped,
        is_completed=subject.is_completed,
        added_at=subject.added_at,
        scraping="started",
    )


@router.delete("/{subject_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_subject(
    subject_id: str,
    user: User = Depends(current_user_dep),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Subject).where(
            Subject.id == uuid.UUID(subject_id),
            Subject.user_id == user.id,
        )
    )
    subject = result.scalar_one_or_none()
    if subject is None:
        raise HTTPException(status_code=404, detail="Subject not found")

    await db.delete(subject)
    await db.commit()


@router.post("/{subject_id}/scrape", response_model=ScrapeResponse)
async def scrape_subject(
    subject_id: str,
    user: User = Depends(current_user_dep),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Subject).where(
            Subject.id == uuid.UUID(subject_id),
            Subject.user_id == user.id,
        )
    )
    subject = result.scalar_one_or_none()
    if subject is None:
        raise HTTPException(status_code=404, detail="Subject not found")

    task = _celery.send_task(
        "tasks.scrape_and_chunk",
        kwargs={
            "subject_id": subject_id,
            "subject_name": subject.name,
            "module_number": subject.modules_scraped + 1,
        },
    )

    return ScrapeResponse(
        task_id=task.id,
        message=f"Scraping started for '{subject.name}' module {subject.modules_scraped + 1}",
    )
