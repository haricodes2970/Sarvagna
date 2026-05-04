from fastapi import APIRouter, Depends, HTTPException, Query

from agents.discovery_agent import find_academic_resources
from core.security import get_current_user
from models.db_models import User

router = APIRouter(tags=["discovery"])


@router.get("/recommend")
async def recommend_resources(
    subject: str = Query(..., min_length=2, max_length=100, description="Topic or subject name"),
    limit: int = Query(3, ge=1, le=10),
    current_user: User = Depends(get_current_user),
):
    """
    Return up to `limit` academic PDF resources for a given subject.
    Sources: OpenStax (curated) + Internet Archive (live search).
    """
    if not subject.strip():
        raise HTTPException(status_code=400, detail="subject must not be blank")

    results = await find_academic_resources(subject.strip(), limit=limit)
    return [r.to_dict() for r in results]
