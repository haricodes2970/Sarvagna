from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from agents.quiz_agent import generate_quiz
from core.database import get_db
from core.gamification import XP_CONFIG
from core.security import get_current_user
from models.db_models import Progress, QuizSession, RoadmapEntry, User

router = APIRouter(tags=["quiz"])


class GenerateRequest(BaseModel):
    topic: str
    subject_id: Optional[int] = None
    count: int = 5


class SubmitAnswer(BaseModel):
    question_id: str
    user_answer: str
    is_correct: bool


class SubmitRequest(BaseModel):
    session_id: int
    answers: list[SubmitAnswer]
    is_high_yield: bool = False


class QuizOut(BaseModel):
    session_id: int
    topic: str
    questions: list[dict]


class ResultOut(BaseModel):
    session_id: int
    score: int
    total: int
    percentage: float
    xp_awarded: int
    mastery_badge: bool
    new_badges: list[str]


@router.post("/generate", response_model=QuizOut, status_code=status.HTTP_201_CREATED)
async def generate(
    body: GenerateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if body.count < 1 or body.count > 20:
        raise HTTPException(status_code=400, detail="count must be 1-20")

    questions = await generate_quiz(
        topic=body.topic,
        subject_id=body.subject_id,
        user_id=current_user.id,
        count=body.count,
    )
    if not questions:
        raise HTTPException(status_code=500, detail="Quiz generation failed — ensure study materials are uploaded")

    session = QuizSession(
        user_id=current_user.id,
        subject_id=body.subject_id,
        topic=body.topic,
        questions=questions,
        total=len(questions),
    )
    db.add(session)
    await db.commit()
    await db.refresh(session)

    return QuizOut(session_id=session.id, topic=session.topic, questions=questions)


@router.post("/submit", response_model=ResultOut)
async def submit_quiz(
    body: SubmitRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(QuizSession).where(
            QuizSession.id == body.session_id,
            QuizSession.user_id == current_user.id,
        )
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Quiz session not found")
    if session.completed_at:
        raise HTTPException(status_code=409, detail="Quiz already submitted")

    correct = sum(1 for a in body.answers if a.is_correct)
    total = session.total or len(body.answers)
    pct = correct / total if total else 0
    perfect = correct == total

    # XP calculation
    xp = correct * XP_CONFIG.QUIZ_CORRECT
    if perfect:
        xp += XP_CONFIG.QUIZ_PERFECT
    if perfect and body.is_high_yield:
        xp += XP_CONFIG.QUIZ_MASTERY

    # Determine new badges
    new_badges: list[str] = []
    prog_result = await db.execute(select(Progress).where(Progress.user_id == current_user.id))
    progress = prog_result.scalar_one_or_none()

    mastery = False
    if progress:
        progress.xp += xp
        badges: list = list(progress.badges or [])
        if perfect and "perfect_quiz" not in badges:
            badges.append("perfect_quiz")
            new_badges.append("perfect_quiz")
        if perfect and body.is_high_yield and "high_yield_mastery" not in badges:
            badges.append("high_yield_mastery")
            new_badges.append("high_yield_mastery")
            mastery = True
        progress.badges = badges

    session.score = correct
    session.xp_awarded = xp
    session.mastery_badge = mastery
    session.completed_at = datetime.now(timezone.utc)
    await db.commit()

    return ResultOut(
        session_id=session.id,
        score=correct,
        total=total,
        percentage=round(pct * 100, 1),
        xp_awarded=xp,
        mastery_badge=mastery,
        new_badges=new_badges,
    )


@router.get("/sessions", response_model=list[dict])
async def list_quiz_sessions(
    subject_id: Optional[int] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    q = select(QuizSession).where(QuizSession.user_id == current_user.id)
    if subject_id is not None:
        q = q.where(QuizSession.subject_id == subject_id)
    result = await db.execute(q.order_by(QuizSession.created_at.desc()))
    sessions = result.scalars().all()
    return [
        {
            "id": s.id,
            "topic": s.topic,
            "subject_id": s.subject_id,
            "score": s.score,
            "total": s.total,
            "percentage": round((s.score / s.total * 100) if s.total and s.score is not None else 0, 1),
            "xp_awarded": s.xp_awarded,
            "mastery_badge": s.mastery_badge,
            "completed_at": s.completed_at.isoformat() if s.completed_at else None,
            "created_at": s.created_at.isoformat(),
        }
        for s in sessions
    ]
