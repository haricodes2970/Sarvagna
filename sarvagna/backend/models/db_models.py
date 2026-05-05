from datetime import date, datetime

from sqlalchemy import Boolean, Date, Float, JSON, DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from core.database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    email: Mapped[str] = mapped_column(String, unique=True, nullable=False, index=True)
    hashed_password: Mapped[str] = mapped_column(String, nullable=False)
    name: Mapped[str] = mapped_column(String, nullable=False)
    branch: Mapped[str] = mapped_column(String, nullable=False)
    semester: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    subjects: Mapped[list["Subject"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    queries: Mapped[list["Query"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    progress: Mapped["Progress"] = relationship(back_populates="user", uselist=False, cascade="all, delete-orphan")
    uploaded_files: Mapped[list["UploadedFile"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    exam_predictions: Mapped[list["ExamPrediction"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    roadmap_entries: Mapped[list["RoadmapEntry"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    teaching_sessions: Mapped[list["TeachingSession"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    flashcards: Mapped[list["Flashcard"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    quiz_sessions: Mapped[list["QuizSession"]] = relationship(back_populates="user", cascade="all, delete-orphan")


class Subject(Base):
    __tablename__ = "subjects"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=True)
    code: Mapped[str | None] = mapped_column(String, nullable=True, default="CUSTOM")
    name: Mapped[str] = mapped_column(String, nullable=False)
    branch: Mapped[str | None] = mapped_column(String, nullable=True, default="GEN")
    semester: Mapped[int | None] = mapped_column(Integer, nullable=True, default=0)
    status: Mapped[str] = mapped_column(String, default="active")
    slot_position: Mapped[int] = mapped_column(Integer, nullable=True)
    xp_earned: Mapped[int] = mapped_column(Integer, default=0)
    branch_template: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    user: Mapped["User"] = relationship(back_populates="subjects")
    modules: Mapped[list["Module"]] = relationship(back_populates="subject", cascade="all, delete-orphan")
    queries: Mapped[list["Query"]] = relationship(back_populates="subject", cascade="all, delete-orphan")


class Module(Base):
    __tablename__ = "modules"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    subject_id: Mapped[int] = mapped_column(Integer, ForeignKey("subjects.id", ondelete="CASCADE"), nullable=False)
    number: Mapped[int] = mapped_column(Integer, nullable=False)
    title: Mapped[str] = mapped_column(String, nullable=False)
    topics: Mapped[list] = mapped_column(JSON, default=list)
    status: Mapped[str] = mapped_column(String, default="locked")
    unlocked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    subject: Mapped["Subject"] = relationship(back_populates="modules")


class Query(Base):
    __tablename__ = "queries"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    subject_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("subjects.id", ondelete="SET NULL"), nullable=True)
    question: Mapped[str] = mapped_column(String, nullable=False)
    exact_answer: Mapped[str | None] = mapped_column(String, nullable=True)
    simplified_answer: Mapped[str | None] = mapped_column(String, nullable=True)
    real_world_example: Mapped[str | None] = mapped_column(String, nullable=True)
    sources: Mapped[list] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    user: Mapped["User"] = relationship(back_populates="queries")
    subject: Mapped["Subject | None"] = relationship(back_populates="queries")


class UploadedFile(Base):
    __tablename__ = "uploaded_files"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    subject_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("subjects.id", ondelete="SET NULL"), nullable=True)
    filename: Mapped[str] = mapped_column(String, nullable=False)
    file_type: Mapped[str] = mapped_column(String, nullable=False)
    file_hash: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    chunk_count: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    user: Mapped["User"] = relationship(back_populates="uploaded_files")


class ExamPrediction(Base):
    __tablename__ = "exam_predictions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    subject_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("subjects.id", ondelete="SET NULL"), nullable=True)
    topics: Mapped[list] = mapped_column(JSON, default=list)
    source_filename: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    user: Mapped["User"] = relationship(back_populates="exam_predictions")


class RoadmapEntry(Base):
    __tablename__ = "roadmap_entries"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    subject_id: Mapped[int] = mapped_column(Integer, ForeignKey("subjects.id", ondelete="CASCADE"), nullable=False)
    module_number: Mapped[int] = mapped_column(Integer, nullable=False)
    title: Mapped[str] = mapped_column(String, nullable=False)
    sections: Mapped[list] = mapped_column(JSON, default=list)
    core_concepts: Mapped[list] = mapped_column(JSON, default=list)
    estimated_minutes: Mapped[int] = mapped_column(Integer, default=60)
    yield_score: Mapped[str] = mapped_column(String, default="medium")
    is_core: Mapped[bool] = mapped_column(Boolean, default=False)
    generated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    user: Mapped["User"] = relationship(back_populates="roadmap_entries")


class Flashcard(Base):
    __tablename__ = "flashcards"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    subject_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("subjects.id", ondelete="SET NULL"), nullable=True)
    topic: Mapped[str] = mapped_column(String, nullable=False, default="General")
    front: Mapped[str] = mapped_column(String, nullable=False)
    back: Mapped[str] = mapped_column(String, nullable=False)
    # SM-2 SRS fields
    easiness_factor: Mapped[float] = mapped_column(Float, default=2.5)
    interval: Mapped[int] = mapped_column(Integer, default=1)
    repetitions: Mapped[int] = mapped_column(Integer, default=0)
    next_review_date: Mapped[date] = mapped_column(Date, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    user: Mapped["User"] = relationship(back_populates="flashcards")


class QuizSession(Base):
    __tablename__ = "quiz_sessions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    subject_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("subjects.id", ondelete="SET NULL"), nullable=True)
    topic: Mapped[str] = mapped_column(String, nullable=False)
    questions: Mapped[list] = mapped_column(JSON, default=list)
    score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    total: Mapped[int] = mapped_column(Integer, default=0)
    xp_awarded: Mapped[int] = mapped_column(Integer, default=0)
    mastery_badge: Mapped[bool] = mapped_column(Boolean, default=False)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    user: Mapped["User"] = relationship(back_populates="quiz_sessions")


class TeachingSession(Base):
    __tablename__ = "teaching_sessions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    subject_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("subjects.id", ondelete="SET NULL"), nullable=True)
    topic: Mapped[str] = mapped_column(String, nullable=False)
    messages: Mapped[list] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    user: Mapped["User"] = relationship(back_populates="teaching_sessions")


class Progress(Base):
    __tablename__ = "progress"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False)
    xp: Mapped[int] = mapped_column(Integer, default=0)
    level: Mapped[int] = mapped_column(Integer, default=1)
    streak_days: Mapped[int] = mapped_column(Integer, default=0)
    last_active: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    badges: Mapped[list] = mapped_column(JSON, default=list)

    user: Mapped["User"] = relationship(back_populates="progress")
