import json
import logging
from dataclasses import dataclass

from google import genai
from groq import AsyncGroq

from core.config import settings

logger = logging.getLogger(__name__)

GROQ_MODEL = "llama-3.3-70b-versatile"
GEMINI_MODEL = "gemini-2.0-flash"

SYSTEM_PROMPT = "You are Sarvagna, an expert VTU engineering tutor. Answer only from the provided textbook context."

RESPONSE_SCHEMA = """{
  "exact_answer": "verbatim or close-paraphrase from textbook",
  "simplified_answer": "step by step simple explanation",
  "real_world_example": "practical Indian student relatable scenario"
}"""


@dataclass
class TeacherResponse:
    exact_answer: str
    simplified_answer: str
    real_world_example: str


def _build_user_prompt(question: str, context_chunks: list[str], subject_name: str, module_title: str) -> str:
    context = "\n\n".join(f"[Chunk {i+1}]\n{chunk}" for i, chunk in enumerate(context_chunks))
    return (
        f"Subject: {subject_name}\n"
        f"Module: {module_title}\n\n"
        f"=== TEXTBOOK CONTENT ===\n{context}\n\n"
        f"=== QUESTION ===\n{question}\n\n"
        f"Respond ONLY with valid JSON matching this schema:\n{RESPONSE_SCHEMA}"
    )


def _parse_response(text: str) -> TeacherResponse:
    text = text.strip()
    if text.startswith("```"):
        text = text.split("```")[1]
        if text.startswith("json"):
            text = text[4:]
    data = json.loads(text.strip())
    return TeacherResponse(
        exact_answer=data["exact_answer"],
        simplified_answer=data["simplified_answer"],
        real_world_example=data["real_world_example"],
    )


async def ask_teacher(
    question: str,
    context_chunks: list[str],
    subject_name: str,
    module_title: str,
) -> TeacherResponse:
    user_prompt = _build_user_prompt(question, context_chunks, subject_name, module_title)

    try:
        client = AsyncGroq(api_key=settings.GROQ_API_KEY)
        completion = await client.chat.completions.create(
            model=GROQ_MODEL,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.1,
            response_format={"type": "json_object"},
        )
        return _parse_response(completion.choices[0].message.content)

    except Exception as groq_err:
        logger.warning("Groq failed (%s), falling back to Gemini", groq_err)
        try:
            gemini_client = genai.Client(api_key=settings.GEMINI_API_KEY)
            full_prompt = f"{SYSTEM_PROMPT}\n\n{user_prompt}"
            response = await gemini_client.aio.models.generate_content(
                model=GEMINI_MODEL,
                contents=full_prompt,
            )
            return _parse_response(response.text)
        except Exception as gemini_err:
            logger.error("Gemini fallback also failed: %s", gemini_err)
            raise RuntimeError("Both Groq and Gemini failed") from gemini_err
