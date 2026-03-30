"""Map route — returns module nodes with connection data for the 2D game map."""
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.routes.auth import current_user_dep
from core.database import get_db
from models.db_models import Progress, Subject, User
from services.syllabus_loader import get_modules, get_topic_keywords

router = APIRouter(prefix="/map", tags=["map"])


# ── Schemas ────────────────────────────────────────────────────────────────

class ConnectionOut(BaseModel):
    from_: int
    to: int
    type: str  # "sequential" | "related"

    class Config:
        populate_by_name = True

    @classmethod
    def seq(cls, src: int, tgt: int) -> "ConnectionOut":
        return cls(from_=src, to=tgt, type="sequential")

    @classmethod
    def rel(cls, src: int, tgt: int) -> "ConnectionOut":
        return cls(from_=src, to=tgt, type="related")


class MapModuleNode(BaseModel):
    module_number: int
    title: str
    status: str  # "completed" | "current" | "locked"
    xp: int
    completion_date: datetime | None
    connections: list[dict]


class MapResponse(BaseModel):
    subject_id: str
    subject_name: str
    total_modules: int
    completed_modules: int
    completion_percentage: float
    modules: list[MapModuleNode]


# ── Helpers ────────────────────────────────────────────────────────────────

def _find_related(
    all_keywords: list[list[str]], module_idx: int, threshold: int = 2
) -> list[int]:
    """Return indices (0-based) of modules sharing >= threshold keywords with module_idx."""
    src = set(all_keywords[module_idx])
    related: list[int] = []
    for i, kws in enumerate(all_keywords):
        if i == module_idx:
            continue
        if len(src & set(kws)) >= threshold:
            related.append(i)
    return related


# ── Route ──────────────────────────────────────────────────────────────────

@router.get("/{subject_id}", response_model=MapResponse)
async def get_map(
    subject_id: str,
    user: User = Depends(current_user_dep),
    db: AsyncSession = Depends(get_db),
):
    subject_result = await db.execute(
        select(Subject).where(
            Subject.id == uuid.UUID(subject_id),
            Subject.user_id == user.id,
        )
    )
    subject = subject_result.scalar_one_or_none()
    if subject is None:
        raise HTTPException(status_code=404, detail="Subject not found")

    progress_result = await db.execute(
        select(Progress)
        .where(Progress.user_id == user.id, Progress.subject_id == uuid.UUID(subject_id))
        .order_by(Progress.module_number)
    )
    all_progress = {p.module_number: p for p in progress_result.scalars().all()}

    total = max(subject.modules_scraped, 5)

    # Determine status per module
    first_incomplete: int | None = None
    module_statuses: list[str] = []
    for n in range(1, total + 1):
        p = all_progress.get(n)
        if p and p.is_completed:
            module_statuses.append("completed")
        elif first_incomplete is None:
            first_incomplete = n
            module_statuses.append("current")
        else:
            module_statuses.append("locked")

    # Fetch topic keywords for related edge detection
    syllabus_modules = get_modules(subject.branch or "", subject.semester or 0, subject.name)
    all_keywords: list[list[str]] = []
    for n in range(1, total + 1):
        kws = get_topic_keywords(
            subject.branch or "", subject.semester or 0, subject.name, n
        )
        all_keywords.append(kws)

    # Build module nodes with connection data
    nodes: list[MapModuleNode] = []
    for i, n in enumerate(range(1, total + 1)):
        p = all_progress.get(n)
        connections: list[dict] = []

        # Sequential edge to next
        if n < total:
            connections.append({"from": n, "to": n + 1, "type": "sequential"})

        # Related edges (skip pure sequential neighbours)
        for rel_idx in _find_related(all_keywords, i):
            rel_num = rel_idx + 1
            if abs(rel_num - n) > 1:
                connections.append({"from": n, "to": rel_num, "type": "related"})

        # Module title from syllabus (fallback to generic)
        if i < len(syllabus_modules):
            title = syllabus_modules[i]
        else:
            title = f"Module {n}"

        nodes.append(
            MapModuleNode(
                module_number=n,
                title=title,
                status=module_statuses[i],
                xp=50,
                completion_date=p.completed_at if p else None,
                connections=connections,
            )
        )

    completed_count = sum(1 for s in module_statuses if s == "completed")
    pct = round(completed_count / total * 100, 1) if total > 0 else 0.0

    return MapResponse(
        subject_id=subject_id,
        subject_name=subject.name,
        total_modules=total,
        completed_modules=completed_count,
        completion_percentage=pct,
        modules=nodes,
    )
