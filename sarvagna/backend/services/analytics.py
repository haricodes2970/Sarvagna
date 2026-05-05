"""
analytics.py — Subject Mastery + Heatmap engine for Sarvagna.

Mastery score = weighted average:
  - Roadmap progress   40%  (modules completed / 5)
  - Quiz performance   40%  (avg score % across all completed quizzes)
  - SRS health         20%  (cards with repetitions >= 1 / total cards)

Heatmap entry = per-topic quiz score (green/amber/red).
"""
import logging
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models.db_models import Flashcard, Module, QuizSession, RoadmapEntry

logger = logging.getLogger(__name__)


@dataclass
class SubjectMastery:
    subject_id: int
    subject_name: str
    roadmap_pct: float
    quiz_pct: float
    srs_pct: float
    mastery_score: float  # 0-100 weighted

    def to_dict(self) -> dict:
        return {
            "subject_id": self.subject_id,
            "subject_name": self.subject_name,
            "roadmap_pct": round(self.roadmap_pct, 1),
            "quiz_pct": round(self.quiz_pct, 1),
            "srs_pct": round(self.srs_pct, 1),
            "mastery_score": round(self.mastery_score, 1),
        }


@dataclass
class HeatmapEntry:
    topic: str
    score_pct: float
    quiz_count: int
    color: str  # green / amber / red

    def to_dict(self) -> dict:
        return {
            "topic": self.topic,
            "score_pct": round(self.score_pct, 1),
            "quiz_count": self.quiz_count,
            "color": self.color,
        }


def _color(pct: float) -> str:
    if pct >= 80:
        return "green"
    if pct >= 50:
        return "amber"
    return "red"


async def compute_subject_mastery(
    user_id: int,
    subject_id: int,
    subject_name: str,
    db: AsyncSession,
) -> SubjectMastery:
    # 1. Roadmap progress: completed RoadmapEntry modules (no Module table dep)
    road_result = await db.execute(
        select(RoadmapEntry).where(
            RoadmapEntry.user_id == user_id,
            RoadmapEntry.subject_id == subject_id,
        )
    )
    entries = road_result.scalars().all()
    # Use Module table for completion status if available
    mod_result = await db.execute(
        select(Module).where(Module.subject_id == subject_id)
    )
    modules = mod_result.scalars().all()
    if modules:
        completed = sum(1 for m in modules if m.status == "complete")
        road_pct = (completed / len(modules)) * 100
    elif entries:
        # No modules tracked yet — treat roadmap as generated (25% baseline)
        road_pct = 25.0
    else:
        road_pct = 0.0

    # 2. Quiz performance
    quiz_result = await db.execute(
        select(QuizSession).where(
            QuizSession.user_id == user_id,
            QuizSession.subject_id == subject_id,
            QuizSession.completed_at.is_not(None),
        )
    )
    quizzes = quiz_result.scalars().all()
    if quizzes:
        scores = [((q.score or 0) / q.total * 100) for q in quizzes if q.total]
        quiz_pct = sum(scores) / len(scores) if scores else 0.0
    else:
        quiz_pct = 0.0

    # 3. SRS health
    fc_result = await db.execute(
        select(Flashcard).where(
            Flashcard.user_id == user_id,
            Flashcard.subject_id == subject_id,
        )
    )
    cards = fc_result.scalars().all()
    if cards:
        recalled = sum(1 for c in cards if c.repetitions >= 1)
        srs_pct = (recalled / len(cards)) * 100
    else:
        srs_pct = 0.0

    mastery = road_pct * 0.4 + quiz_pct * 0.4 + srs_pct * 0.2

    return SubjectMastery(
        subject_id=subject_id,
        subject_name=subject_name,
        roadmap_pct=road_pct,
        quiz_pct=quiz_pct,
        srs_pct=srs_pct,
        mastery_score=mastery,
    )


async def compute_heatmap(user_id: int, db: AsyncSession) -> list[HeatmapEntry]:
    """Per-topic quiz score aggregated across all subjects."""
    quiz_result = await db.execute(
        select(QuizSession).where(
            QuizSession.user_id == user_id,
            QuizSession.completed_at.is_not(None),
        )
    )
    quizzes = quiz_result.scalars().all()

    topic_scores: dict[str, list[float]] = {}
    for q in quizzes:
        if not q.total:
            continue
        pct = (q.score or 0) / q.total * 100
        topic_scores.setdefault(q.topic, []).append(pct)

    entries: list[HeatmapEntry] = []
    for topic, scores in topic_scores.items():
        avg = sum(scores) / len(scores)
        entries.append(HeatmapEntry(
            topic=topic,
            score_pct=avg,
            quiz_count=len(scores),
            color=_color(avg),
        ))

    return sorted(entries, key=lambda e: e.score_pct)


async def compute_weak_areas(user_id: int, db: AsyncSession) -> list[dict]:
    """Topics with average quiz score < 60%."""
    heatmap = await compute_heatmap(user_id, db)
    return [e.to_dict() for e in heatmap if e.score_pct < 60]
