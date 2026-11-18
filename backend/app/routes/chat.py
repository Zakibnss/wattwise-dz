"""WATTWISE DZ Chat endpoints — AI assistant WATTY."""

from __future__ import annotations

import logging
import os
import traceback
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.agent import chat_with_watty
from app.config import settings
from app.database import get_session
from app.models import Alert

logger = logging.getLogger(__name__)

router = APIRouter(tags=["ai"])


class ChatRequest(BaseModel):
    """Request body for the WATTY chat endpoint."""

    message: str
    device_id: str = "SALLE1"


@router.post("/chat")
async def chat(request: ChatRequest) -> dict[str, Any]:
    """Chat with WATTY, the AI energy assistant.

    Args:
        request: ChatRequest containing message and device_id.

    Returns:
        Dict with 'reply' (str) and optional 'action' (dict).
    """
    try:
        api_key = settings.groq_api_key or os.environ.get("GROQ_API_KEY", "")
        result = await chat_with_watty(
            message=request.message,
            device_id=request.device_id,
            groq_api_key=api_key,
        )
        return result
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Erreur WATTY chat: %s", exc, exc_info=True)
        traceback.print_exc()
        raise HTTPException(
            status_code=500,
            detail=f"Erreur interne lors du traitement par l'assistant WATTY: {exc}",
        ) from exc


@router.post("/alerts/resolve-all")
async def resolve_all_alerts(
    device_id: str = Query(default="SALLE1", max_length=50),
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    """Resolve all active alerts for a device.

    Args:
        device_id: Device identifier.
        session: Injected async database session.

    Returns:
        Dict with count of resolved alerts.
    """
    statement = select(Alert).where(
        Alert.device_id == device_id, Alert.resolved.is_(False)
    )
    alerts = (await session.scalars(statement)).all()

    count = len(alerts)
    for alert in alerts:
        alert.resolved = True

    await session.commit()

    return {"resolved": count, "message": f"{count} alerte(s) résolue(s)"}


@router.post("/readings/refresh")
async def refresh_readings() -> dict[str, Any]:
    """Refresh reading data (placeholder for manual trigger).

    Returns:
        Dict with success status.
    """
    return {"status": "ok", "message": "Readings refreshed"}
