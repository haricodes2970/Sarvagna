import logging
from dataclasses import dataclass
from typing import Any

from agents.flashcard_agent import Flashcard, generate_flashcards
from agents.roadmap_agent import ModuleStatus, get_roadmap
from agents.scraper_agent import scrape_content
from agents.teacher_agent import TeacherResponse, ask_teacher

logger = logging.getLogger(__name__)

ACTION_ASK = "ask"
ACTION_ROADMAP = "roadmap"
ACTION_FLASHCARD = "flashcard"
ACTION_SCRAPE = "scrape"


@dataclass
class OrchestratorRequest:
    action_type: str
    user_id: int
    subject_id: int | None = None

    # ask / flashcard
    question: str | None = None
    context_chunks: list[str] | None = None
    subject_name: str | None = None
    module_title: str | None = None

    # flashcard
    topic: str | None = None
    flashcard_count: int = 10

    # scrape
    topics: list[str] | None = None

    # roadmap needs db — pass via keyword
    db: Any = None


@dataclass
class AgentResponse:
    action_type: str
    data: TeacherResponse | list[ModuleStatus] | list[Flashcard] | list[str]


async def orchestrate(request: OrchestratorRequest) -> AgentResponse:
    action = request.action_type

    if action == ACTION_ASK:
        result = await ask_teacher(
            question=request.question or "",
            context_chunks=request.context_chunks or [],
            subject_name=request.subject_name or "",
            module_title=request.module_title or "",
        )
        return AgentResponse(action_type=action, data=result)

    if action == ACTION_ROADMAP:
        if request.db is None:
            raise ValueError("db session required for roadmap action")
        result = await get_roadmap(
            subject_id=request.subject_id,
            user_id=request.user_id,
            db=request.db,
        )
        return AgentResponse(action_type=action, data=result)

    if action == ACTION_FLASHCARD:
        result = await generate_flashcards(
            topic=request.topic or request.module_title or "",
            content_chunks=request.context_chunks or [],
            count=request.flashcard_count,
        )
        return AgentResponse(action_type=action, data=result)

    if action == ACTION_SCRAPE:
        result = await scrape_content(
            subject_name=request.subject_name or "",
            module_title=request.module_title or "",
            topics=request.topics or [],
        )
        return AgentResponse(action_type=action, data=result)

    raise ValueError(f"Unknown action_type: '{action}'. Valid: ask, roadmap, flashcard, scrape")
