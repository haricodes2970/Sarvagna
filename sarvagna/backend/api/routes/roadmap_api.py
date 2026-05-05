from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from agents.roadmap_agent import generate_roadmap
from core.database import get_db
from core.security import get_current_user
from models.db_models import RoadmapEntry, Subject, User

router = APIRouter(tags=["roadmap"])


class GenerateRequest(BaseModel):
    subject_id: int
    subject_name: str


class RoadmapEntryOut(BaseModel):
    id: int
    module_number: int
    title: str
    sections: list[str]
    core_concepts: list[str]
    estimated_minutes: int
    yield_score: str
    is_core: bool
    generated_at: str

    model_config = {"from_attributes": True}


def _to_out(e: RoadmapEntry) -> RoadmapEntryOut:
    return RoadmapEntryOut(
        id=e.id,
        module_number=e.module_number,
        title=e.title,
        sections=e.sections or [],
        core_concepts=e.core_concepts or [],
        estimated_minutes=e.estimated_minutes,
        yield_score=e.yield_score,
        is_core=e.is_core,
        generated_at=e.generated_at.isoformat(),
    )


@router.post("/generate", response_model=list[RoadmapEntryOut], status_code=status.HTTP_201_CREATED)
async def generate(
    body: GenerateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    subject_result = await db.execute(
        select(Subject).where(
            Subject.id == body.subject_id,
            Subject.user_id == current_user.id,
        )
    )
    if not subject_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Subject not found")

    try:
        entries = await generate_roadmap(
            subject_id=body.subject_id,
            user_id=current_user.id,
            subject_name=body.subject_name,
            db=db,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    return [_to_out(e) for e in entries]


@router.get("/{subject_id}", response_model=list[RoadmapEntryOut])
async def get_roadmap_entries(
    subject_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(RoadmapEntry).where(
            RoadmapEntry.subject_id == subject_id,
            RoadmapEntry.user_id == current_user.id,
        ).order_by(RoadmapEntry.module_number)
    )
    entries = result.scalars().all()
    return [_to_out(e) for e in entries]


@router.get("/{subject_id}/crunch", response_model=list[RoadmapEntryOut])
async def crunch_mode(
    subject_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return only High Yield or Core modules — for exam crunch mode."""
    result = await db.execute(
        select(RoadmapEntry).where(
            RoadmapEntry.subject_id == subject_id,
            RoadmapEntry.user_id == current_user.id,
        ).order_by(RoadmapEntry.module_number)
    )
    entries = result.scalars().all()
    crunch = [e for e in entries if e.yield_score == "high" or e.is_core]
    return [_to_out(e) for e in crunch]
