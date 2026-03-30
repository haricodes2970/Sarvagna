"""Map selection route — persist and retrieve which static map a module uses."""
import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.routes.auth import current_user_dep
from core.database import get_db
from models.db_models import ModuleImage, Subject, User

router = APIRouter(prefix="/mapselection", tags=["mapselection"])

_VALID_MAPS = {f"map{i}" for i in range(1, 7)}


class MapSelectionOut(BaseModel):
    subject_id: str
    module_number: int
    selected_map: str


class MapSelectionIn(BaseModel):
    map_id: str


async def _verify_subject(db: AsyncSession, subject_id: str, user_id: uuid.UUID) -> Subject:
    result = await db.execute(
        select(Subject).where(
            Subject.id == uuid.UUID(subject_id),
            Subject.user_id == user_id,
        )
    )
    subject = result.scalar_one_or_none()
    if subject is None:
        raise HTTPException(status_code=404, detail="Subject not found")
    return subject


@router.get("/{subject_id}/{module_number}", response_model=MapSelectionOut)
async def get_selected_map(
    subject_id: str,
    module_number: int,
    user: User = Depends(current_user_dep),
    db: AsyncSession = Depends(get_db),
):
    await _verify_subject(db, subject_id, user.id)

    result = await db.execute(
        select(ModuleImage).where(
            ModuleImage.subject_id == uuid.UUID(subject_id),
            ModuleImage.module_number == module_number,
        )
    )
    row = result.scalar_one_or_none()

    # Default: cycle through map1–map6 by module number
    default_map = f"map{((module_number - 1) % 6) + 1}"
    selected = (row.selected_map if row and row.selected_map else default_map)

    return MapSelectionOut(
        subject_id=subject_id,
        module_number=module_number,
        selected_map=selected,
    )


@router.post("/{subject_id}/{module_number}", response_model=MapSelectionOut)
async def save_selected_map(
    subject_id: str,
    module_number: int,
    body: MapSelectionIn,
    user: User = Depends(current_user_dep),
    db: AsyncSession = Depends(get_db),
):
    if body.map_id not in _VALID_MAPS:
        raise HTTPException(status_code=400, detail=f"Invalid map_id. Must be one of {sorted(_VALID_MAPS)}")

    await _verify_subject(db, subject_id, user.id)

    result = await db.execute(
        select(ModuleImage).where(
            ModuleImage.subject_id == uuid.UUID(subject_id),
            ModuleImage.module_number == module_number,
        )
    )
    row = result.scalar_one_or_none()

    if row:
        row.selected_map = body.map_id
    else:
        # Create a stub row (image_url placeholder since Replicate is removed)
        row = ModuleImage(
            subject_id=uuid.UUID(subject_id),
            module_number=module_number,
            image_url="",
            selected_map=body.map_id,
        )
        db.add(row)

    await db.commit()

    return MapSelectionOut(
        subject_id=subject_id,
        module_number=module_number,
        selected_map=body.map_id,
    )
