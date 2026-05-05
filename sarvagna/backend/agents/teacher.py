"""
teacher.py — Socratic Teaching Engine for Sarvagna.

generate_tutor_response() produces a structured reply in 3-Format style:
  • Exact     — precise definition / theorem (LaTeX where applicable)
  • Simple    — plain-language analogy a first-year can follow
  • Example   — worked example or real-world use case
  • Checkpoint — a Socratic question to verify understanding

Every substantive reply ends with a Checkpoint question.
The agent is grounded by Qdrant chunks retrieved for the topic before calling.
"""
import json
import logging
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)

_SYSTEM_PROMPT = """You are Sarvagna, a patient and brilliant Socratic tutor for engineering students.

RESPONSE FORMAT — always return valid JSON with these four keys:
{
  "exact":       "Precise definition/theorem. Use LaTeX for formulas: $..$ inline, $$...$$ block.",
  "simple":      "Plain-language analogy. No jargon. Max 3 sentences.",
  "example":     "Worked example OR real-world application. Show steps if math is involved.",
  "checkpoint":  "One Socratic question to test the student's understanding. End with '?'"
}

RULES:
- LaTeX: surround inline math with single $, block math with $$.
- Never skip the checkpoint field — every reply must end with a question.
- If the student answers a checkpoint correctly, praise briefly then deepen the topic.
- If incorrect, guide with hints — never just give the answer.
- Keep 'simple' and 'checkpoint' under 60 words each.
- Ground explanations in the provided context excerpts.
- Do NOT output any text outside the JSON object.
"""


@dataclass
class TutorResponse:
    exact: str
    simple: str
    example: str
    checkpoint: str
    raw_json: dict = field(default_factory=dict)

    def to_dict(self) -> dict:
        return {
            "exact": self.exact,
            "simple": self.simple,
            "example": self.example,
            "checkpoint": self.checkpoint,
        }

    @property
    def spoken_text(self) -> str:
        """Text intended for TTS — simple explanation + checkpoint question."""
        return f"{self.simple}  {self.checkpoint}"


def _build_user_turn(topic: str, user_message: str, context_chunks: list[str]) -> str:
    context_block = ""
    if context_chunks:
        excerpts = "\n---\n".join(chunk[:600] for chunk in context_chunks[:5])
        context_block = f"\n\n[Context from uploaded materials]\n{excerpts}\n"
    return (
        f"Topic: {topic}{context_block}\n"
        f"Student: {user_message}"
    )


def _parse_response(raw: str) -> TutorResponse:
    raw = raw.strip()
    start = raw.find("{")
    end = raw.rfind("}") + 1
    if start == -1 or end == 0:
        raise ValueError("No JSON object in model response")
    data = json.loads(raw[start:end])
    return TutorResponse(
        exact=str(data.get("exact", "")),
        simple=str(data.get("simple", "")),
        example=str(data.get("example", "")),
        checkpoint=str(data.get("checkpoint", "What questions do you have so far?")),
        raw_json=data,
    )


async def generate_tutor_response(
    topic: str,
    user_message: str,
    session_history: list[dict],
    context_chunks: list[str],
) -> TutorResponse:
    """
    Build a Socratic tutor reply grounded in Qdrant context.

    Args:
        topic: roadmap module title or concept name
        user_message: latest student input
        session_history: list of {role, content} dicts (prior turns)
        context_chunks: text excerpts retrieved from Qdrant

    Returns:
        TutorResponse with exact/simple/example/checkpoint fields
    """
    from groq import AsyncGroq
    from core.config import settings

    if not settings.GROQ_API_KEY:
        return TutorResponse(
            exact="AI tutor not available — GROQ_API_KEY not configured.",
            simple="Please add your Groq API key to continue.",
            example="",
            checkpoint="Is your API key set in the environment?",
        )

    messages: list[dict] = [{"role": "system", "content": _SYSTEM_PROMPT}]

    for turn in session_history[-10:]:
        role = turn.get("role", "user")
        content = turn.get("content", "")
        if role in ("user", "assistant") and content:
            messages.append({"role": role, "content": content})

    messages.append({
        "role": "user",
        "content": _build_user_turn(topic, user_message, context_chunks),
    })

    try:
        client = AsyncGroq(api_key=settings.GROQ_API_KEY)
        completion = await client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=messages,
            temperature=0.4,
            max_tokens=1024,
        )
        raw = completion.choices[0].message.content or ""
        return _parse_response(raw)
    except json.JSONDecodeError as e:
        logger.error("Teacher JSON parse failed: %s", e)
        return TutorResponse(
            exact="Parsing error in AI response.",
            simple="The tutor had trouble formatting its reply. Try rephrasing your question.",
            example="",
            checkpoint="Can you try asking that in a different way?",
        )
    except Exception as e:
        logger.error("Teacher Groq call failed: %s", e)
        return TutorResponse(
            exact=f"AI error: {e}",
            simple="Something went wrong. Please try again.",
            example="",
            checkpoint="Shall we try again?",
        )
