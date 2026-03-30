import uuid
from datetime import datetime
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.routes.auth import current_user_dep
from api.routes.modulemap import _extract_flatlist_module
from core.database import get_db
from models.db_models import ModuleImage, Subject, User
from services.syllabus_loader import get_syllabus
from services.map_generator import generate_module_map

router = APIRouter(prefix="/mapimage", tags=["mapimage"])


class ModuleImageOut(BaseModel):
    subject_id: str
    module_number: int
    image_url: str
    generated_at: datetime


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


@router.get("/{subject_id}/{module_number}", response_model=ModuleImageOut)
async def get_or_generate_module_image(
    subject_id: str,
    module_number: int,
    user: User = Depends(current_user_dep),
    db: AsyncSession = Depends(get_db),
):
    subject = await _verify_subject(db, subject_id, user.id)

    subject_uuid = uuid.UUID(subject_id)
    existing_result = await db.execute(
        select(ModuleImage).where(
            ModuleImage.subject_id == subject_uuid,
            ModuleImage.module_number == module_number,
        )
    )
    existing = existing_result.scalar_one_or_none()
    if existing is not None:
        return ModuleImageOut(
            subject_id=str(existing.subject_id),
            module_number=existing.module_number,
            image_url=existing.image_url,
            generated_at=existing.generated_at,
        )

    # Load syllabus module metadata for prompt generation.
    syllabus_data: Any = get_syllabus(subject.branch or "")
    module_title = f"Module {module_number}"
    topics_list: list[str] = []
    if isinstance(syllabus_data, list):
        module_title, topics_list = _extract_flatlist_module(
            syllabus_data,
            semester=subject.semester or 0,
            subject_name=subject.name,
            module_number=module_number,
        )

    image_url = await generate_module_map(
        module_title=module_title,
        topics_list=topics_list,
    )

    row = ModuleImage(
        subject_id=subject_uuid,
        module_number=module_number,
        image_url=image_url,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)

    return ModuleImageOut(
        subject_id=str(row.subject_id),
        module_number=row.module_number,
        image_url=row.image_url,
        generated_at=row.generated_at,
    )

