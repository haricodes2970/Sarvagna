import json
import logging
from typing import Optional

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from groq import AsyncGroq
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from core.config import settings
from core.database import get_db
from core.security import get_current_user
from models.db_models import ExamPrediction, User

logger = logging.getLogger(__name__)
router = APIRouter(tags=["qp"])

GROQ_MODEL = "llama-3.3-70b-versatile"

QP_PROMPT = """You are a VTU exam expert. Analyze this question paper and return ONLY valid JSON.

Extract:
1. All questions with marks
2. Most repeated topics with frequency count
3. High weightage topics (questions worth >10 marks)
4. Predicted important topics for the next exam based on patterns

Return this exact JSON structure with no extra text:
{
  "questions": [{"question": "...", "marks": 0, "topic": "...", "unit": "..."}],
  "repeated_topics": [{"topic": "...", "frequency": 0}],
  "high_weightage": ["topic1", "topic2"],
  "predictions": ["topic1", "topic2"]
}

Question paper text:
"""


def _extract_pdf_text(file_bytes: bytes) -> str:
    import io
    import pdfplumber
    pages: list[str] = []
    with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
        for page in pdf.pages:
            pages.append(page.extract_text() or "")
    return "\n".join(pages)


def _clean_json(raw: str) -> str:
    raw = raw.strip()
    if raw.startswith("```"):
        lines = raw.split("\n")
        raw = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:])
    return raw.strip()


@router.post("/analyze", status_code=status.HTTP_200_OK)
async def analyze_question_paper(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files accepted")

    content = await file.read()
    if len(content) > 20 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large (max 20MB)")

    try:
        text = _extract_pdf_text(content)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"PDF extraction failed: {e}")

    if len(text.strip()) < 50:
        raise HTTPException(status_code=400, detail="Could not extract readable text from PDF")

    prompt = QP_PROMPT + text[:8000]

    if not settings.GROQ_API_KEY:
        raise HTTPException(status_code=503, detail="AI service not configured")

    try:
        client = AsyncGroq(api_key=settings.GROQ_API_KEY)
        completion = await client.chat.completions.create(
            model=GROQ_MODEL,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.1,
            response_format={"type": "json_object"},
        )
        raw = completion.choices[0].message.content or ""
        data = json.loads(_clean_json(raw))
    except json.JSONDecodeError as e:
        logger.error("QP analyzer JSON parse failed: %s", e)
        raise HTTPException(status_code=500, detail="AI returned invalid JSON")
    except Exception as e:
        logger.error("QP analyzer Groq call failed: %s", e)
        raise HTTPException(status_code=500, detail=f"AI analysis failed: {e}")

    return {
        "questions": data.get("questions", []),
        "repeated_topics": data.get("repeated_topics", []),
        "high_weightage": data.get("high_weightage", []),
        "predictions": data.get("predictions", []),
    }


class SavePredictionsRequest(BaseModel):
    topics: list[str]
    subject_id: Optional[int] = None
    source_filename: Optional[str] = None


@router.post("/predictions", status_code=status.HTTP_201_CREATED)
async def save_predictions(
    body: SavePredictionsRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Persist QP-derived exam predictions so roadmap agent can use them."""
    if not body.topics:
        raise HTTPException(status_code=400, detail="topics list must not be empty")

    record = ExamPrediction(
        user_id=current_user.id,
        subject_id=body.subject_id,
        topics=body.topics,
        source_filename=body.source_filename,
    )
    db.add(record)
    await db.commit()
    await db.refresh(record)
    return {"id": record.id, "topic_count": len(body.topics), "status": "saved"}
