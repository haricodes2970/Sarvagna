from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from core.gamification import SUBJECT_SLOT_CONFIG
from core.security import get_current_user
from models.db_models import Module, Subject, User

router = APIRouter(tags=["subjects"])

MAX_SLOTS = SUBJECT_SLOT_CONFIG.MAX_SUBJECTS


class SubjectCreate(BaseModel):
    name: str
    code: str = "CUSTOM"
    branch: str = "GEN"
    semester: int = 0


class SubjectResponse(BaseModel):
    id: int
    code: str | None
    name: str
    branch: str | None
    semester: int | None
    status: str
    slot_position: int | None
    xp_earned: int

    model_config = {"from_attributes": True}


class ModuleResponse(BaseModel):
    id: int
    number: int
    title: str
    topics: list
    status: str

    model_config = {"from_attributes": True}


@router.get("", response_model=list[SubjectResponse])
async def list_subjects(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Subject)
        .where(Subject.user_id == current_user.id, Subject.status == "active")
        .order_by(Subject.slot_position)
    )
    return result.scalars().all()


@router.post("", response_model=SubjectResponse, status_code=status.HTTP_201_CREATED)
async def add_subject(
    body: SubjectCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    count_result = await db.execute(
        select(func.count()).where(Subject.user_id == current_user.id, Subject.status == "active")
    )
    active_count = count_result.scalar_one()

    if active_count >= MAX_SLOTS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Subject slot limit ({MAX_SLOTS}) reached",
        )

    used_slots_result = await db.execute(
        select(Subject.slot_position).where(Subject.user_id == current_user.id, Subject.status == "active")
    )
    used_slots = {row for row in used_slots_result.scalars().all() if row is not None}
    slot = next((i for i in range(1, MAX_SLOTS + 1) if i not in used_slots), None)

    subject = Subject(
        user_id=current_user.id,
        code=body.code,
        name=body.name,
        branch=body.branch,
        semester=body.semester,
        slot_position=slot,
    )
    db.add(subject)
    await db.commit()
    await db.refresh(subject)
    return subject


@router.delete("/{subject_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_subject(
    subject_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Subject).where(Subject.id == subject_id, Subject.user_id == current_user.id)
    )
    subject = result.scalar_one_or_none()
    if not subject:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Subject not found")

    await db.delete(subject)
    await db.commit()


@router.get("/{subject_id}/modules", response_model=list[ModuleResponse])
async def list_modules(
    subject_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    subject_result = await db.execute(
        select(Subject).where(Subject.id == subject_id, Subject.user_id == current_user.id)
    )
    if not subject_result.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Subject not found")

    result = await db.execute(
        select(Module).where(Module.subject_id == subject_id).order_by(Module.number)
    )
    return result.scalars().all()
