"""
teacher.py — Grounded Socratic Teaching Engine (NotebookLM style).

Answers ONLY from provided Qdrant context chunks.
Every reply is JSON with: exact / simple / example / checkpoint /
checkpoint_validated / source_citations.
"""
import json
import logging
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)

_SYSTEM_PROMPT = """You are Sarvagna AI — a strict Socratic tutor for VTU engineering students.

CRITICAL GROUNDING RULE:
- Answer ONLY from the [Context] excerpts provided below the student's message.
- If the answer is not in the context, say: "This topic is not covered in your uploaded materials. Please upload the relevant PDF."
- NEVER hallucinate facts, formulas, or examples not present in the context.
- Cite sources inline as [filename, p.N].

RESPONSE FORMAT — return valid JSON with exactly these keys:
{
  "exact":                "Precise definition/theorem from context. LaTeX: $..$ inline, $$..$$ block. Include [filename, p.N] citations.",
  "simple":               "Plain analogy, max 3 sentences. No jargon.",
  "example":              "Worked example from context with steps.",
  "checkpoint":           "One Socratic question to test understanding. Must end with '?'",
  "checkpoint_validated": null,
  "source_citations":     ["filename, p.N"]
}

checkpoint_validated:
  null  — new explanation (not evaluating a prior checkpoint)
  true  — student answer was correct per context
  false — student answer was wrong; give a hint, do not reveal answer

RULES:
- checkpoint is MANDATORY every response
- If context is empty → state it explicitly, do not guess
- Do NOT output any text outside the JSON object
"""


@dataclass
class TutorResponse:
    exact: str
    simple: str
    example: str
    checkpoint: str
    checkpoint_validated: bool | None = None
    source_citations: list[str] = field(default_factory=list)
    raw_json: dict = field(default_factory=dict)

    def to_dict(self) -> dict:
        return {
            "exact": self.exact,
            "simple": self.simple,
            "example": self.example,
            "checkpoint": self.checkpoint,
            "checkpoint_validated": self.checkpoint_validated,
            "source_citations": self.source_citations,
        }

    @property
    def spoken_text(self) -> str:
        return f"{self.simple}  {self.checkpoint}"


def _build_user_turn(topic: str, user_message: str, context_chunks: list[dict]) -> str:
    """
    Formats the user turn. context_chunks is list[dict] with keys:
      text, filename (optional), page (optional), section (optional)
    """
    context_block = ""
    if context_chunks:
        parts = []
        for chunk in context_chunks[:8]:
            text = chunk.get("text", "")[:700]
            filename = chunk.get("filename", "unknown")
            page = chunk.get("page", "?")
            section = chunk.get("section", "")
            label = f"[{filename}, p.{page}{', ' + section if section else ''}]"
            parts.append(f"{label}\n{text}")
        context_block = "\n\n[Context]\n" + "\n---\n".join(parts) + "\n"
    return f"Topic: {topic}{context_block}\nStudent: {user_message}"


def _parse_response(raw: str) -> TutorResponse:
    raw = raw.strip()
    start = raw.find("{")
    end = raw.rfind("}") + 1
    if start == -1 or end == 0:
        raise ValueError("No JSON object in model response")
    data = json.loads(raw[start:end])
    cv = data.get("checkpoint_validated")
    if cv is not None:
        cv = bool(cv)
    return TutorResponse(
        exact=str(data.get("exact", "")),
        simple=str(data.get("simple", "")),
        example=str(data.get("example", "")),
        checkpoint=str(data.get("checkpoint", "What questions do you have so far?")),
        checkpoint_validated=cv,
        source_citations=list(data.get("source_citations") or []),
        raw_json=data,
    )


async def generate_tutor_response(
    topic: str,
    user_message: str,
    session_history: list[dict],
    context_chunks: list[dict],
) -> TutorResponse:
    """
    context_chunks: list[dict] with keys text, filename, page, section.
    Returns TutorResponse grounded strictly in provided context.
    """
    from groq import AsyncGroq
    from core.config import settings

    if not settings.GROQ_API_KEY:
        return TutorResponse(
            exact="AI tutor not available — GROQ_API_KEY not configured.",
            simple="Please add your Groq API key.",
            example="",
            checkpoint="Is your API key set?",
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
            temperature=0.3,
            max_tokens=1200,
        )
        raw = completion.choices[0].message.content or ""
        return _parse_response(raw)
    except json.JSONDecodeError as e:
        logger.error("Teacher JSON parse failed: %s", e)
        return TutorResponse(
            exact="Parsing error in AI response.",
            simple="The tutor had trouble formatting its reply.",
            example="",
            checkpoint="Can you rephrase your question?",
        )
    except Exception as e:
        logger.error("Teacher Groq call failed: %s", e)
        return TutorResponse(
            exact=f"AI error: {e}",
            simple="Something went wrong.",
            example="",
            checkpoint="Shall we try again?",
        )
