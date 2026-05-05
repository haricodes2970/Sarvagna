from datetime import date, datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from core.gamification import XP_CONFIG
from core.security import get_current_user
from core.srs_engine import sm2
from models.db_models import Flashcard, Progress, User

router = APIRouter(tags=["flashcards"])


class FlashcardCreate(BaseModel):
    front: str
    back: str
    topic: str = "General"
    subject_id: Optional[int] = None


class FlashcardOut(BaseModel):
    id: int
    front: str
    back: str
    topic: str
    subject_id: Optional[int]
    easiness_factor: float
    interval: int
    repetitions: int
    next_review_date: str
    created_at: str

    model_config = {"from_attributes": True}


class RateRequest(BaseModel):
    card_id: int
    rating: int  # 1-5


def _card_out(c: Flashcard) -> FlashcardOut:
    return FlashcardOut(
        id=c.id,
        front=c.front,
        back=c.back,
        topic=c.topic,
        subject_id=c.subject_id,
        easiness_factor=c.easiness_factor,
        interval=c.interval,
        repetitions=c.repetitions,
        next_review_date=c.next_review_date.isoformat(),
        created_at=c.created_at.isoformat(),
    )


@router.post("", response_model=FlashcardOut, status_code=status.HTTP_201_CREATED)
async def create_flashcard(
    body: FlashcardCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    card = Flashcard(
        user_id=current_user.id,
        subject_id=body.subject_id,
        topic=body.topic,
        front=body.front,
        back=body.back,
        easiness_factor=2.5,
        interval=1,
        repetitions=0,
        next_review_date=date.today(),
    )
    db.add(card)
    await db.commit()
    await db.refresh(card)
    return _card_out(card)


@router.get("", response_model=list[FlashcardOut])
async def list_flashcards(
    subject_id: Optional[int] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    q = select(Flashcard).where(Flashcard.user_id == current_user.id)
    if subject_id is not None:
        q = q.where(Flashcard.subject_id == subject_id)
    result = await db.execute(q.order_by(Flashcard.next_review_date))
    return [_card_out(c) for c in result.scalars().all()]


@router.get("/review", response_model=list[FlashcardOut])
async def cards_due_today(
    subject_id: Optional[int] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Cards with next_review_date <= today."""
    today = date.today()
    q = select(Flashcard).where(
        Flashcard.user_id == current_user.id,
        Flashcard.next_review_date <= today,
    )
    if subject_id is not None:
        q = q.where(Flashcard.subject_id == subject_id)
    result = await db.execute(q.order_by(Flashcard.next_review_date))
    return [_card_out(c) for c in result.scalars().all()]


@router.post("/rate", response_model=FlashcardOut)
async def rate_card(
    body: RateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if body.rating < 1 or body.rating > 5:
        raise HTTPException(status_code=400, detail="rating must be 1-5")

    result = await db.execute(
        select(Flashcard).where(
            Flashcard.id == body.card_id,
            Flashcard.user_id == current_user.id,
        )
    )
    card = result.scalar_one_or_none()
    if not card:
        raise HTTPException(status_code=404, detail="Flashcard not found")

    srs = sm2(
        rating=body.rating,
        easiness_factor=card.easiness_factor,
        interval=card.interval,
        repetitions=card.repetitions,
    )
    card.easiness_factor = srs.easiness_factor
    card.interval = srs.interval
    card.repetitions = srs.repetitions
    card.next_review_date = srs.next_review_date

    # Award XP for any successful recall (rating >= 3)
    if body.rating >= 3:
        prog_result = await db.execute(select(Progress).where(Progress.user_id == current_user.id))
        progress = prog_result.scalar_one_or_none()
        if progress:
            progress.xp += XP_CONFIG.FLASHCARD_REVIEW
            # Badge: flashcard_50 — check total successful reps across all cards
            total_reps_result = await db.execute(
                select(Flashcard).where(
                    Flashcard.user_id == current_user.id,
                    Flashcard.repetitions >= 1,
                )
            )
            if len(total_reps_result.scalars().all()) >= 50:
                badges: list = list(progress.badges or [])
                if "flashcard_50" not in badges:
                    badges.append("flashcard_50")
                    progress.badges = badges

    await db.commit()
    await db.refresh(card)
    return _card_out(card)


@router.delete("/{card_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_flashcard(
    card_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Flashcard).where(
            Flashcard.id == card_id,
            Flashcard.user_id == current_user.id,
        )
    )
    card = result.scalar_one_or_none()
    if not card:
        raise HTTPException(status_code=404, detail="Flashcard not found")
    await db.delete(card)
    await db.commit()
