import re
import uuid
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.routes.auth import current_user_dep
from core.database import get_db
from models.db_models import ChatMessage, Subject, User
from services.syllabus_loader import get_syllabus

router = APIRouter(prefix="/modulemap", tags=["modulemap"])

_MODULE_COMPLETE_PROMPT = "Module complete! Ready to mark as done?"

# TeacherAgent formats topic headers like:
#   ## 📘 Topic: <Topic Name>
# We'll parse the last such header across assistant messages.
_TOPIC_HEADING_RE = re.compile(r"^##\s*.*?Topic:\s*(.+?)\s*$", re.MULTILINE | re.IGNORECASE)


class ModuleSubtopicOut(BaseModel):
    id: str
    title: str
    status: str  # "completed" | "current" | "locked"


class ModuleTopicOut(BaseModel):
    id: str
    title: str
    status: str  # "completed" | "current" | "locked"
    subtopics: list[ModuleSubtopicOut]


class ModuleMapResponse(BaseModel):
    subject_id: str
    subject_name: str
    module_number: int
    module_title: str
    topics: list[ModuleTopicOut]


def _norm(s: str) -> str:
    # Keep alphanumerics only; improves fuzzy matching between syllabus strings and parsed topic titles.
    return re.sub(r"[^a-z0-9]+", " ", (s or "").lower()).strip()


def _jaccard(a: str, b: str) -> float:
    at = set(_norm(a).split())
    bt = set(_norm(b).split())
    if not at or not bt:
        return 0.0
    inter = len(at & bt)
    union = len(at | bt)
    return inter / union if union else 0.0


def _extract_flatlist_module(data: list[dict[str, Any]], semester: int, subject_name: str, module_number: int) -> tuple[str, list[str]]:
    subject_lower = (subject_name or "").strip().lower()

    # Find the flat-list subject entry by semester + best-effort name match.
    entry: Optional[dict[str, Any]] = None
    best_score = -1.0
    for e in data:
        if e.get("semester") != semester:
            continue
        name = (e.get("name") or "").strip()
        if not name:
            continue

        name_lower = name.lower()
        if name_lower == subject_lower:
            entry = e
            best_score = 1.0
            break
        if subject_lower in name_lower or name_lower in subject_lower:
            entry = e
            best_score = 0.9
            break
        score = _jaccard(subject_lower, name_lower)
        if score > best_score:
            best_score = score
            entry = e

    if entry is None:
        return (f"Module {module_number}", [])

    modules = entry.get("modules") or []
    if not isinstance(modules, list):
        return (f"Module {module_number}", [])

    modules_sorted = sorted(modules, key=lambda m: (m or {}).get("number", 0))
    idx = module_number - 1
    if idx < 0 or idx >= len(modules_sorted):
        return (f"Module {module_number}", [])

    mod = modules_sorted[idx] or {}
    module_title = mod.get("title") or f"Module {module_number}"

    # Current syllabus JSON uses `subtopics: [string...]`, but we also accept legacy `topics: [...]`.
    raw = mod.get("subtopics") if "subtopics" in mod else mod.get("topics")
    subtopics: list[str] = []
    if isinstance(raw, list):
        subtopics = [str(x) for x in raw if isinstance(x, str)]
    return (str(module_title), subtopics)


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


@router.get("/{subject_id}/{module_number}", response_model=ModuleMapResponse)
async def get_module_map(
    subject_id: str,
    module_number: int,
    user: User = Depends(current_user_dep),
    db: AsyncSession = Depends(get_db),
):
    subject = await _verify_subject(db, subject_id, user.id)

    # Syllabus module metadata
    syllabus_data = get_syllabus(subject.branch or "")
    module_title = f"Module {module_number}"
    subtopics: list[str] = []

    if isinstance(syllabus_data, list):
        module_title, subtopics = _extract_flatlist_module(
            syllabus_data,
            semester=subject.semester or 0,
            subject_name=subject.name,
            module_number=module_number,
        )

    # Chat history for this (user, subject, module)
    result = await db.execute(
        select(ChatMessage)
        .where(
            ChatMessage.user_id == user.id,
            ChatMessage.subject_id == uuid.UUID(subject_id),
            ChatMessage.module_number == module_number,
        )
        .order_by(ChatMessage.created_at.asc())
    )
    messages = result.scalars().all()

    assistant_contents = [m.content for m in messages if m.role == "assistant"]

    # If module complete prompt appears, treat everything as completed.
    if any(_MODULE_COMPLETE_PROMPT in (c or "") for c in assistant_contents):
        main_status = "completed"
        sub_statuses = ["completed" for _ in subtopics]
    else:
        # No assistant history yet → module is ready to start, so show the first topic as `current`.
        if not assistant_contents:
            main_status = "current"
            if not subtopics:
                sub_statuses = []
            else:
                sub_statuses = []
                for i in range(len(subtopics)):
                    sub_statuses.append("current" if i == 0 else "locked")
        else:
            # Otherwise infer "current" from the last topic heading taught by the assistant.
            last_topic_name: Optional[str] = None
            for c in assistant_contents:
                for match in _TOPIC_HEADING_RE.finditer(c or ""):
                    last_topic_name = (match.group(1) or "").strip()

            if not subtopics:
                main_status = "current"
                sub_statuses = []
            else:
                if last_topic_name:
                    scores = [(i, _jaccard(last_topic_name, st)) for i, st in enumerate(subtopics)]
                    # Also allow substring matches to override low Jaccard scores.
                    substring_idx = None
                    last_norm = _norm(last_topic_name)
                    for i, st in enumerate(subtopics):
                        st_norm = _norm(st)
                        if last_norm and (last_norm in st_norm or st_norm in last_norm):
                            substring_idx = i
                            break

                    if substring_idx is not None:
                        current_index = substring_idx
                    else:
                        current_index, best = max(scores, key=lambda x: x[1])
                        # If matching is too weak, default to first topic.
                        if best < 0.15:
                            current_index = 0
                else:
                    current_index = 0

                main_status = "current"
                sub_statuses = []
                for i in range(len(subtopics)):
                    if i < current_index:
                        sub_statuses.append("completed")
                    elif i == current_index:
                        sub_statuses.append("current")
                    else:
                        sub_statuses.append("locked")

    topic = ModuleTopicOut(
        id=f"m{module_number}",
        title=module_title,
        status=main_status,
        subtopics=[
            ModuleSubtopicOut(id=f"t{module_number}-{i}", title=subtopics[i], status=sub_statuses[i])
            for i in range(len(subtopics))
        ],
    )

    return ModuleMapResponse(
        subject_id=subject_id,
        subject_name=subject.name,
        module_number=module_number,
        module_title=module_title,
        topics=[topic],
    )

