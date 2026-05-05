"""
quiz_agent.py — Quiz Generation Agent for Sarvagna.

generate_quiz(topic, subject_id, user_id, count) produces a mix of:
  - MCQ    (conceptual multiple-choice)
  - BLANK  (fill-in-the-blank for formulas / definitions)
  - SHORT  (short-answer for key definitions)

Each question carries: id, type, question, options (MCQ only),
correct_answer, explanation.
"""
import json
import logging
import uuid

logger = logging.getLogger(__name__)

_QUIZ_PROMPT = """You are an expert exam setter for engineering students.

Topic: {topic}

Context from uploaded study materials:
{context}

Generate exactly {count} quiz questions as a JSON array.
Use this mix: roughly 50% MCQ, 25% BLANK (fill-in-the-blank), 25% SHORT (short answer).

Each question object MUST follow this schema exactly:
{{
  "id": "<uuid>",
  "type": "MCQ" | "BLANK" | "SHORT",
  "question": "...",
  "options": ["A. ...", "B. ...", "C. ...", "D. ..."],  // MCQ only, else []
  "correct_answer": "...",   // for MCQ: full option text; BLANK: the missing word(s); SHORT: model answer
  "explanation": "..."       // brief reason / concept link
}}

Rules:
- MCQ: one clearly correct option, three plausible distractors.
- BLANK: use ___ in the question for the blank. Keep blanks to 1-3 words.
- SHORT: expect 1-3 sentence answers; provide a model answer.
- LaTeX for math: $inline$ or $$block$$.
- Difficulty: mix easy (20%), medium (60%), hard (20%).
- No duplicate questions.
- Return ONLY the JSON array, no extra text.
"""


async def generate_quiz(
    topic: str,
    subject_id: int | None,
    user_id: int,
    count: int = 5,
) -> list[dict]:
    """
    Pull Qdrant chunks for topic, call Groq to generate questions.
    Returns list of question dicts (schema as above).
    Falls back to empty list on failure.
    """
    from core import vector_store
    from core.config import settings
    from groq import AsyncGroq

    collection = f"user_{user_id}_uploads"
    chunks = await vector_store.search_chunks_filtered(
        collection_name=collection,
        query=topic,
        subject_id=subject_id,
        top_k=8,
    )
    context = "\n---\n".join(c[:500] for c in chunks[:6]) if chunks else f"General knowledge about {topic}."

    if not settings.GROQ_API_KEY:
        logger.warning("GROQ_API_KEY not set — returning empty quiz")
        return []

    prompt = _QUIZ_PROMPT.format(topic=topic, context=context, count=count)

    try:
        client = AsyncGroq(api_key=settings.GROQ_API_KEY)
        completion = await client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.5,
            max_tokens=2048,
        )
        raw = (completion.choices[0].message.content or "").strip()
        start = raw.find("[")
        end = raw.rfind("]") + 1
        if start == -1 or end == 0:
            raise ValueError("No JSON array in response")
        questions = json.loads(raw[start:end])

        # Ensure every question has an id
        for q in questions:
            if not q.get("id"):
                q["id"] = str(uuid.uuid4())
            if "options" not in q:
                q["options"] = []

        logger.info("Quiz generated: %d questions for topic '%s'", len(questions), topic)
        return questions[:count]

    except json.JSONDecodeError as e:
        logger.error("Quiz JSON parse failed: %s", e)
        return []
    except Exception as e:
        logger.error("Quiz generation failed: %s", e)
        return []
