import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from agents.teacher_agent import teach_module
from api.routes.auth import current_user_dep
from core.database import get_db
from models.db_models import ChatMessage, Subject, User

router = APIRouter(prefix="/chat", tags=["chat"])

_PAGE_SIZE = 100


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class MessageOut(BaseModel):
    id: str
    role: str
    content: str
    created_at: datetime


class ChatHistoryResponse(BaseModel):
    subject_id: str
    module_number: int
    messages: list[MessageOut]
    total: int
    page: int


class SendMessageRequest(BaseModel):
    content: str


class SendMessageResponse(BaseModel):
    user_message: MessageOut
    ai_message: MessageOut


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.get("/{subject_id}/{module_number}", response_model=ChatHistoryResponse)
async def get_chat_history(
    subject_id: str,
    module_number: int,
    page: int = 1,
    user: User = Depends(current_user_dep),
    db: AsyncSession = Depends(get_db),
):
    await _verify_subject(db, subject_id, user.id)

    offset = (page - 1) * _PAGE_SIZE

    result = await db.execute(
        select(ChatMessage)
        .where(
            ChatMessage.user_id == user.id,
            ChatMessage.subject_id == uuid.UUID(subject_id),
            ChatMessage.module_number == module_number,
        )
        .order_by(ChatMessage.created_at.asc())
        .offset(offset)
        .limit(_PAGE_SIZE)
    )
    messages = result.scalars().all()

    # Total count
    count_result = await db.execute(
        select(ChatMessage).where(
            ChatMessage.user_id == user.id,
            ChatMessage.subject_id == uuid.UUID(subject_id),
            ChatMessage.module_number == module_number,
        )
    )
    total = len(count_result.scalars().all())

    return ChatHistoryResponse(
        subject_id=subject_id,
        module_number=module_number,
        messages=[_to_out(m) for m in messages],
        total=total,
        page=page,
    )


@router.post("/{subject_id}/{module_number}", response_model=SendMessageResponse)
async def send_message(
    subject_id: str,
    module_number: int,
    body: SendMessageRequest,
    user: User = Depends(current_user_dep),
    db: AsyncSession = Depends(get_db),
):
    subject = await _verify_subject(db, subject_id, user.id)

    # Save user message
    user_msg = ChatMessage(
        user_id=user.id,
        subject_id=uuid.UUID(subject_id),
        module_number=module_number,
        role="user",
        content=body.content,
    )
    db.add(user_msg)
    await db.flush()

    # Load recent history for context (last 20 messages)
    history_result = await db.execute(
        select(ChatMessage)
        .where(
            ChatMessage.user_id == user.id,
            ChatMessage.subject_id == uuid.UUID(subject_id),
            ChatMessage.module_number == module_number,
            ChatMessage.id != user_msg.id,
        )
        .order_by(ChatMessage.created_at.desc())
        .limit(20)
    )
    recent = list(reversed(history_result.scalars().all()))
    chat_history = [{"role": m.role, "content": m.content} for m in recent]

    # Call TeacherAgent
    ai_reply = await teach_module(
        subject=subject.name,
        module_number=module_number,
        user_message=body.content,
        chat_history=chat_history,
        user_id=str(user.id),
        subject_id=subject_id,
    )

    # Save AI message
    ai_msg = ChatMessage(
        user_id=user.id,
        subject_id=uuid.UUID(subject_id),
        module_number=module_number,
        role="assistant",
        content=ai_reply,
    )
    db.add(ai_msg)
    await db.commit()
    await db.refresh(user_msg)
    await db.refresh(ai_msg)

    return SendMessageResponse(
        user_message=_to_out(user_msg),
        ai_message=_to_out(ai_msg),
    )


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _to_out(msg: ChatMessage) -> MessageOut:
    return MessageOut(
        id=str(msg.id),
        role=msg.role,
        content=msg.content,
        created_at=msg.created_at,
    )


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
