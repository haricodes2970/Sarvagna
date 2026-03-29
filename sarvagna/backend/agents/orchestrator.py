import hashlib
import json
import logging

from redis.asyncio import Redis

from agents import roadmap_agent, teacher_agent
from core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

_CACHE_TTL = 86_400  # 24 hours


def _cache_key(question: str, subject: str) -> str:
    digest = hashlib.sha256(f"{subject}::{question}".encode()).hexdigest()
    return f"sarvagna:answer:{digest}"


async def handle_query(question: str, subject: str, user_id: str) -> dict:
    """
    Full query pipeline:
    1. Check Redis cache for existing answer
    2. If miss, call teacher_agent.answer_question
    3. Award XP for asking a question via roadmap_agent
    4. Check for newly unlocked badges
    5. Return combined response: answer + xp_earned + badges_unlocked
    """
    redis = Redis.from_url(settings.REDIS_URL, decode_responses=True)
    key = _cache_key(question, subject)

    # --- Step 1: Cache check ---
    cached_raw = await redis.get(key)
    await redis.aclose()

    if cached_raw:
        logger.info("Orchestrator cache hit for user %s", user_id)
        answer = json.loads(cached_raw)
        return {
            **answer,
            "cached": True,
            "xp_earned": 0,
            "badges_unlocked": [],
        }

    # --- Step 2: Get answer from teacher agent (also caches internally) ---
    answer = await teacher_agent.answer_question(question, subject, user_id)

    # --- Step 3: Award XP ---
    xp_result = await roadmap_agent.award_xp(user_id, "ask_question")

    # --- Step 4: Update streak and check badges ---
    await roadmap_agent.update_streak(user_id)
    badges = await roadmap_agent.check_badges(user_id)

    return {
        **answer,
        "cached": False,
        "xp_earned": xp_result["xp_earned"],
        "new_xp": xp_result["new_xp"],
        "level": xp_result["level"],
        "level_name": xp_result["level_name"],
        "leveled_up": xp_result.get("leveled_up", False),
        "badges_unlocked": badges,
    }
