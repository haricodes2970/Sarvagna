from dataclasses import dataclass
from typing import List, Dict

# =========================
# XP SYSTEM
# =========================

@dataclass(frozen=True)
class XPConfig:
    VIEW_TOPIC: int = 5
    COMPLETE_MODULE: int = 50
    DAILY_LOGIN: int = 10
    ASK_QUESTION: int = 8
    SEVEN_DAY_STREAK: int = 100
    QUIZ_CORRECT: int = 10
    QUIZ_PERFECT: int = 50
    QUIZ_MASTERY: int = 100
    FLASHCARD_REVIEW: int = 3


XP_CONFIG = XPConfig()


# =========================
# LEVEL SYSTEM
# =========================

@dataclass(frozen=True)
class Level:
    level: int
    name: str
    xp_required: int


LEVELS: List[Level] = [
    Level(1, "Prarambha", 0),
    Level(2, "Jigyasa", 100),
    Level(3, "Shravana", 300),
    Level(4, "Manana", 700),
    Level(5, "Abhyasa", 1500),
    Level(6, "Viveka", 3000),
    Level(7, "Vidyarthi", 6000),
    Level(8, "Pandita", 10000),
    Level(9, "Acharya", 15000),
    Level(10, "Sarvagna", 25000),
]


# =========================
# BADGE SYSTEM
# =========================

@dataclass(frozen=True)
class Badge:
    id: str
    name: str
    condition: str


BADGES: List[Badge] = [
    Badge("first_login", "First Step", "Complete first login"),
    Badge("first_topic", "Curious Mind", "View first topic"),
    Badge("first_module", "Module Master", "Complete first module"),
    Badge("5_day_streak", "Consistency I", "Maintain 5-day streak"),
    Badge("7_day_streak", "Consistency II", "Maintain 7-day streak"),
    Badge("30_day_streak", "Unstoppable", "Maintain 30-day streak"),
    Badge("100_topics", "Explorer", "View 100 topics"),
    Badge("500_topics", "Deep Explorer", "View 500 topics"),
    Badge("10_modules", "Finisher I", "Complete 10 modules"),
    Badge("50_modules", "Finisher II", "Complete 50 modules"),
    Badge("first_question", "Inquisitive", "Ask first question"),
    Badge("50_questions", "Thinker", "Ask 50 questions"),
    Badge("subject_complete", "Subject Conqueror", "Complete a subject"),
    Badge("all_slots_full", "Maxed Out", "Fill all subject slots"),
    Badge("level_10", "Enlightened", "Reach Level 10"),
    Badge("perfect_quiz", "Quiz Master", "Perfect score on any quiz"),
    Badge("high_yield_mastery", "Exam Ready", "Perfect score on a High-Yield topic quiz"),
    Badge("flashcard_50", "Memory Champion", "Successfully recall 50 flashcards"),
]


# =========================
# STREAK SYSTEM
# =========================

@dataclass(frozen=True)
class StreakConfig:
    DAILY_INCREMENT: int = 1
    GRACE_PERIOD_HOURS: int = 24
    STREAK_RESET_AFTER_MISS: bool = True
    STREAK_RESTORE_WITHIN_HOURS: int = 12
    BONUS_ON_7_DAYS: int = XP_CONFIG.SEVEN_DAY_STREAK


STREAK_CONFIG = StreakConfig()


# =========================
# SUBJECT SLOT SYSTEM
# =========================

@dataclass(frozen=True)
class SubjectSlotConfig:
    MAX_SUBJECTS: int = 10
    HARD_BLOCK_ON_FULL: bool = True
    REMOVE_ON_COMPLETION: bool = True
    AUTO_FREE_SLOT_ON_COMPLETION: bool = True
    COMPLETION_REWARD_XP: int = 200


SUBJECT_SLOT_CONFIG = SubjectSlotConfig()


# =========================
# OPTIONAL: ACTION MAP
# =========================

ACTION_XP_MAP: Dict[str, int] = {
    "view_topic": XP_CONFIG.VIEW_TOPIC,
    "complete_module": XP_CONFIG.COMPLETE_MODULE,
    "daily_login": XP_CONFIG.DAILY_LOGIN,
    "ask_question": XP_CONFIG.ASK_QUESTION,
    "seven_day_streak": XP_CONFIG.SEVEN_DAY_STREAK,
    "quiz_correct": XP_CONFIG.QUIZ_CORRECT,
    "quiz_perfect": XP_CONFIG.QUIZ_PERFECT,
    "quiz_mastery": XP_CONFIG.QUIZ_MASTERY,
    "flashcard_review": XP_CONFIG.FLASHCARD_REVIEW,
}