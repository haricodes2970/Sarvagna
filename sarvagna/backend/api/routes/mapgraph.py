"""Map graph route — Groq-powered topic placement with Redis caching."""
import json
import uuid

import redis.asyncio as aioredis
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.routes.auth import current_user_dep
from core.config import get_settings
from core.database import get_db
from models.db_models import ModuleImage, Subject, User
from services.groq_map_placer import generate_map_layout
from services.syllabus_loader import get_syllabus

router = APIRouter(prefix="/mapgraph", tags=["mapgraph"])

_VALID_MAPS = {f"map{i}" for i in range(1, 7)}
_CACHE_TTL = 86_400  # 24 hours


# ─── Response model ──────────────────────────────────────────────────────────

class MapGraphResponse(BaseModel):
    layout: dict
    selected_map: str
    map_image: str


# ─── Helpers ─────────────────────────────────────────────────────────────────

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


def _extract_topics(syllabus_data, subject, module_number: int) -> tuple[str, list[dict]]:
    """Return (module_title, topics_list) from the branch syllabus."""
    if not isinstance(syllabus_data, list):
        return f"Module {module_number}", []

    subject_lower = (subject.name or "").strip().lower()
    entry = None
    best_score = -1.0
    for e in syllabus_data:
        if e.get("semester") != (subject.semester or 0):
            continue
        name = (e.get("name") or "").strip().lower()
        if name == subject_lower:
            entry = e
            break
        if subject_lower in name or name in subject_lower:
            entry = e
            best_score = 0.9

    if entry is None:
        return f"Module {module_number}", []

    modules = sorted(entry.get("modules") or [], key=lambda m: m.get("number", 0))
    idx = module_number - 1
    if idx < 0 or idx >= len(modules):
        return f"Module {module_number}", []

    mod = modules[idx] or {}
    module_title = str(mod.get("title") or f"Module {module_number}")

    raw_subs = mod.get("subtopics") if "subtopics" in mod else mod.get("topics") or []
    subtopics_str: list[str] = [str(x) for x in (raw_subs or []) if isinstance(x, str)]

    # Build a single "topic" node (the module itself) with its subtopics
    topics = [
        {
            "id": f"m{module_number}",
            "title": module_title,
            "subtopics": [
                {"id": f"t{module_number}-{i}", "title": s}
                for i, s in enumerate(subtopics_str)
            ],
        }
    ]
    return module_title, topics


# ─── Route ───────────────────────────────────────────────────────────────────

@router.get("/{subject_id}/{module_number}", response_model=MapGraphResponse)
async def get_map_graph(
    subject_id: str,
    module_number: int,
    user: User = Depends(current_user_dep),
    db: AsyncSession = Depends(get_db),
):
    subject = await _verify_subject(db, subject_id, user.id)

    # Resolve selected map
    result = await db.execute(
        select(ModuleImage).where(
            ModuleImage.subject_id == uuid.UUID(subject_id),
            ModuleImage.module_number == module_number,
        )
    )
    row = result.scalar_one_or_none()
    default_map = f"map{((module_number - 1) % 6) + 1}"
    selected_map = (row.selected_map if row and row.selected_map else default_map)

    # Redis cache check
    cache_key = f"mapgraph:{subject_id}:{module_number}"
    layout: dict | None = None
    redis_client = None

    try:
        redis_client = aioredis.from_url(get_settings().REDIS_URL, decode_responses=True)
        cached = await redis_client.get(cache_key)
        if cached:
            layout = json.loads(cached)
    except Exception:
        pass  # Redis unavailable — generate fresh

    if layout is None:
        # Build topics from syllabus
        syllabus_data = get_syllabus(subject.branch or "")
        module_title, topics = _extract_topics(syllabus_data, subject, module_number)

        layout = await generate_map_layout(module_title, topics)

        # Cache for 24 hours
        try:
            if redis_client:
                await redis_client.set(cache_key, json.dumps(layout), ex=_CACHE_TTL)
        except Exception:
            pass

    if redis_client:
        try:
            await redis_client.aclose()
        except Exception:
            pass

    return MapGraphResponse(
        layout=layout,
        selected_map=selected_map,
        map_image=f"/maps/{selected_map}.jpg",
    )
