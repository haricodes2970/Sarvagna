import json
import logging
from dataclasses import dataclass

from groq import AsyncGroq

from core.config import settings

logger = logging.getLogger(__name__)

GROQ_MODEL = "llama-3.3-70b-versatile"

FLASHCARD_SCHEMA = '[{"front": "question", "back": "answer", "type": "definition|concept|numerical|application"}]'


@dataclass
class Flashcard:
    front: str
    back: str
    type: str


def _parse_flashcards(text: str) -> list[Flashcard]:
    text = text.strip()
    if text.startswith("```"):
        text = text.split("```")[1]
        if text.startswith("json"):
            text = text[4:]
    data = json.loads(text.strip())
    return [
        Flashcard(
            front=item["front"],
            back=item["back"],
            type=item.get("type", "concept"),
        )
        for item in data
    ]


async def generate_flashcards(
    topic: str,
    content_chunks: list[str],
    count: int = 10,
) -> list[Flashcard]:
    context = "\n\n".join(f"[Chunk {i+1}]\n{chunk}" for i, chunk in enumerate(content_chunks))

    prompt = (
        f"Topic: {topic}\n\n"
        f"=== CONTENT ===\n{context}\n\n"
        f"Generate {count} flashcards from this content.\n"
        f"Cover definitions, concepts, numericals, and applications.\n"
        f"Return ONLY a JSON array matching this schema:\n{FLASHCARD_SCHEMA}"
    )

    client = AsyncGroq(api_key=settings.GROQ_API_KEY)
    completion = await client.chat.completions.create(
        model=GROQ_MODEL,
        messages=[
            {
                "role": "system",
                "content": "You are a VTU exam preparation assistant. Generate concise, exam-focused flashcards.",
            },
            {"role": "user", "content": prompt},
        ],
        temperature=0.3,
        response_format={"type": "json_object"},
    )

    raw = completion.choices[0].message.content
    try:
        return _parse_flashcards(raw)
    except (json.JSONDecodeError, KeyError) as e:
        logger.error("Failed to parse flashcard response: %s\nRaw: %s", e, raw)
        raise ValueError("Groq returned invalid flashcard JSON") from e
