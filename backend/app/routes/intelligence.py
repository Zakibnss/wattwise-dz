"""Energy Brain endpoints (V3 Étape 6)."""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.energy_brain import generate_insights
from app.ai.optimization_service import generate_recommendations
from app.database import get_session
from app.schemas import InsightsResponse

router = APIRouter(tags=["intelligence"])


@router.get("/intelligence/insights", response_model=InsightsResponse)
async def intelligence_insights(
    session: AsyncSession = Depends(get_session),
) -> InsightsResponse:
    """Global Energy Brain recommendations for the whole building.

    Evaluates the deterministic rules (useless AC, solar surplus, consumption
    peak) and returns them ordered by severity with a French briefing sentence
    for the Dashboard hero card.
    """
    result = await generate_insights(session)
    return InsightsResponse(
        generated_at=datetime.now(timezone.utc),
        insights=result["insights"],
        briefing=result["briefing"],
        critical_count=result["critical_count"],
        warning_count=result["warning_count"],
    )


@router.get("/optimization/recommendations")
async def optimization_recommendations(
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Explainable energy optimization recommendations."""
    recs = await generate_recommendations(session)
    return {"generated_at": datetime.now(timezone.utc).isoformat(), "recommendations": recs}
