import uuid
from datetime import datetime, timezone

from celery import Celery
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.routes.auth import current_user_dep
from core.config import get_settings
from core.database import get_db
from core.gamification import SUBJECT_SLOT_CONFIG
from models.db_models import Subject, User

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


class AddSubjectRequest(BaseModel):
    name: str
    branch: str
    semester: int


class ScrapeResponse(BaseModel):
    task_id: str
    message: str


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

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


@router.post("/add", response_model=SubjectOut, status_code=status.HTTP_201_CREATED)
async def add_subject(
    body: AddSubjectRequest,
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

    return SubjectOut(
        id=str(subject.id),
        name=subject.name,
        branch=subject.branch,
        semester=subject.semester,
        modules_scraped=subject.modules_scraped,
        is_completed=subject.is_completed,
        added_at=subject.added_at,
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
