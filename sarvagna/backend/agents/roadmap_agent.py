"""
roadmap_agent.py — Intelligent Roadmap + Exam-Yield Engine for Sarvagna.

generate_roadmap():
  1. Scroll Qdrant for all chunks belonging to user+subject → collect unique sections
  2. Ask Groq to organise sections into 5 logical modules
  3. Fetch ExamPrediction rows for user+subject → derive topic set
  4. Score each module: high / medium / low yield
  5. Persist RoadmapEntry rows; return them
"""
import json
import logging
from dataclasses import dataclass
from datetime import datetime, timezone

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from core.gamification import XP_CONFIG
from models.db_models import ExamPrediction, Module, Progress, RoadmapEntry, Subject

logger = logging.getLogger(__name__)

MODULES_PER_SUBJECT = 5

# ---------------------------------------------------------------------------
# Legacy dataclass (kept for existing callers of get_roadmap / unlock_next_module)
# ---------------------------------------------------------------------------

@dataclass
class ModuleStatus:
    module_number: int
    title: str
    status: str
    topics: list
    xp_earned: int
    unlocked_at: datetime | None


# ---------------------------------------------------------------------------
# Legacy helpers
# ---------------------------------------------------------------------------

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


# ---------------------------------------------------------------------------
# Pillar 2 — generate_roadmap
# ---------------------------------------------------------------------------

async def _scroll_sections(collection_name: str, subject_id: int) -> list[str]:
    """Return unique section names from Qdrant for this collection + subject."""
    try:
        from core.vector_store import client as qdrant_client
        from qdrant_client.http import models as qm

        scroll_filter = qm.Filter(
            must=[qm.FieldCondition(key="subject_id", match=qm.MatchValue(value=subject_id))]
        )

        sections: set[str] = set()
        offset = None
        while True:
            results, next_offset = await qdrant_client.scroll(
                collection_name=collection_name,
                scroll_filter=scroll_filter,
                with_payload=True,
                with_vectors=False,
                limit=100,
                offset=offset,
            )
            for point in results:
                sec = (point.payload or {}).get("section", "")
                if sec and sec != "General":
                    sections.add(sec)
            if next_offset is None:
                break
            offset = next_offset

        logger.info("Scrolled %d unique sections from %s", len(sections), collection_name)
        return list(sections)
    except Exception as e:
        logger.warning("Qdrant scroll failed: %s", e)
        return []


def _build_groq_prompt(subject_name: str, sections: list[str]) -> str:
    sections_text = "\n".join(f"- {s}" for s in sections[:80]) or "No specific sections detected."
    return f"""You are an expert curriculum designer for engineering students.

Subject: {subject_name}
Detected content sections from uploaded study materials:
{sections_text}

Organise these topics into exactly 5 logical learning modules in study order.
For each module provide:
- title: short descriptive name
- sections: list of the section names that belong here (subset of the ones above)
- core_concepts: 3-5 key terms a student must master
- estimated_minutes: realistic solo-study time (30-180)
- is_core: true if this module is essential for exam pass (not optional enrichment)

Reply ONLY with a JSON array of 5 objects matching this schema:
[{{"module_number":1,"title":"...","sections":[...],"core_concepts":[...],"estimated_minutes":90,"is_core":true}}, ...]"""


async def _call_groq(prompt: str) -> list[dict]:
    try:
        from groq import AsyncGroq
        from core.config import settings

        client = AsyncGroq(api_key=settings.GROQ_API_KEY)
        chat = await client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.3,
            max_tokens=2048,
        )
        raw = chat.choices[0].message.content or ""
        start = raw.find("[")
        end = raw.rfind("]") + 1
        if start == -1 or end == 0:
            raise ValueError("No JSON array in response")
        return json.loads(raw[start:end])
    except Exception as e:
        logger.warning("Groq roadmap call failed: %s", e)
        return []


def _fallback_modules(sections: list[str], subject_name: str) -> list[dict]:
    """Simple even split when Groq is unavailable."""
    chunk = max(1, len(sections) // 5)
    modules = []
    for i in range(5):
        sl = sections[i * chunk: (i + 1) * chunk]
        modules.append({
            "module_number": i + 1,
            "title": f"Module {i + 1}: {subject_name}",
            "sections": sl,
            "core_concepts": sl[:3],
            "estimated_minutes": 60,
            "is_core": i < 3,
        })
    return modules


def _yield_score(module: dict, prediction_topics: set[str]) -> str:
    """Score module yield based on overlap with QP predictions."""
    if not prediction_topics:
        return "medium"
    concepts = {c.lower() for c in module.get("core_concepts", [])}
    sections = {s.lower() for s in module.get("sections", [])}
    haystack = concepts | sections
    hits = sum(1 for t in prediction_topics if any(t in h or h in t for h in haystack))
    if hits >= 2:
        return "high"
    if hits == 1:
        return "medium"
    return "low"


async def generate_roadmap(
    subject_id: int,
    user_id: int,
    subject_name: str,
    db: AsyncSession,
) -> list[RoadmapEntry]:
    """
    Full Pillar-2 pipeline: Qdrant scan → Groq organisation → yield scoring → DB persist.
    Returns saved RoadmapEntry list ordered by module_number.
    """
    collection_name = f"user_{user_id}_uploads"
    sections = await _scroll_sections(collection_name, subject_id)

    if sections:
        prompt = _build_groq_prompt(subject_name, sections)
        raw_modules = await _call_groq(prompt)
    else:
        raw_modules = []

    if len(raw_modules) != 5:
        logger.info("Groq returned %d modules; using fallback split", len(raw_modules))
        raw_modules = _fallback_modules(sections, subject_name)

    # Fetch exam predictions for yield scoring
    pred_result = await db.execute(
        select(ExamPrediction).where(
            ExamPrediction.user_id == user_id,
            ExamPrediction.subject_id == subject_id,
        )
    )
    predictions = pred_result.scalars().all()
    prediction_topics: set[str] = set()
    for p in predictions:
        for t in (p.topics or []):
            prediction_topics.add(t.lower())

    # Delete stale entries for this user+subject before regenerating
    await db.execute(
        delete(RoadmapEntry).where(
            RoadmapEntry.user_id == user_id,
            RoadmapEntry.subject_id == subject_id,
        )
    )

    entries: list[RoadmapEntry] = []
    for m in raw_modules:
        num = int(m.get("module_number", len(entries) + 1))
        score = _yield_score(m, prediction_topics)
        entry = RoadmapEntry(
            user_id=user_id,
            subject_id=subject_id,
            module_number=num,
            title=str(m.get("title", f"Module {num}")),
            sections=m.get("sections", []),
            core_concepts=m.get("core_concepts", []),
            estimated_minutes=int(m.get("estimated_minutes", 60)),
            yield_score=score,
            is_core=bool(m.get("is_core", num <= 3)),
            generated_at=datetime.now(timezone.utc),
        )
        db.add(entry)
        entries.append(entry)

    await db.commit()
    for e in entries:
        await db.refresh(e)

    logger.info(
        "Roadmap generated for subject %d user %d: %d modules, predictions=%d",
        subject_id, user_id, len(entries), len(predictions),
    )
    return sorted(entries, key=lambda e: e.module_number)
