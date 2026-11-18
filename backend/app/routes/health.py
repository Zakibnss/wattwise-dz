"""Health probe endpoint."""

from __future__ import annotations

import logging

from fastapi import APIRouter, Request
from sqlalchemy import text

from app.database import engine
from app.schemas import HealthResponse

logger = logging.getLogger(__name__)

router = APIRouter(tags=["health"])


@router.get("/health", response_model=HealthResponse)
async def health(request: Request) -> HealthResponse:
    """Report application, database and MQTT connectivity status.

    The endpoint always answers HTTP 200 so orchestrators can distinguish an
    unhealthy dependency from a crashed process.
    """
    database_status = "ok"
    try:
        async with engine.connect() as connection:
            await connection.execute(text("SELECT 1"))
    except Exception:
        logger.exception("Database health check failed")
        database_status = "error"

    ingestor = getattr(request.app.state, "mqtt", None)
    mqtt_status = "ok" if ingestor is not None and ingestor.is_connected() else "error"

    return HealthResponse(status="ok", database=database_status, mqtt=mqtt_status)
