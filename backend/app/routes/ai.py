"""Phase 2 AI endpoints: 24h forecast, alert explanation and model status."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai import detector, forecaster
from app.ai.explainer import explain_alert
from app.database import get_session
from app.models import Alert, ModelRun, Reading
from app.schemas import (
    AlertExplanation,
    ForecastResponse,
    ModelRunRead,
    ModelsResponse,
    ModelStatus,
)

router = APIRouter(tags=["ai"])

#: Number of recent readings used as lag context for the forecast.
FORECAST_HISTORY_ROWS = 200


def _read_json(path: Path) -> dict[str, Any] | None:
    """Read a metrics sidecar, returning ``None`` when absent or invalid."""
    if not path.is_file():
        return None
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):  # pragma: no cover - defensive
        return None
    return payload if isinstance(payload, dict) else None


@router.get("/forecast/next24h", response_model=ForecastResponse)
async def forecast_next_24h(
    device_id: str = Query(default="SALLE1", max_length=50),
    session: AsyncSession = Depends(get_session),
) -> ForecastResponse:
    """Return 24 hourly power and energy predictions with confidence bounds.

    Args:
        device_id: Device whose recent history seeds the lag features.
        session: Injected async database session.

    Raises:
        HTTPException: 503 when the forecaster has not been trained yet.
    """
    statement = (
        select(Reading)
        .where(Reading.device_id == device_id)
        .order_by(Reading.timestamp.desc(), Reading.id.desc())
        .limit(FORECAST_HISTORY_ROWS)
    )
    rows = list((await session.scalars(statement)).all())
    history = list(reversed(rows))

    try:
        predictions = forecaster.predict_next_24h(history)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    return ForecastResponse(
        status="ok",
        device_id=device_id,
        generated_at=datetime.now(timezone.utc),
        predictions=predictions,
    )


@router.get("/alerts/{alert_id}/explanation", response_model=AlertExplanation)
async def alert_explanation(
    alert_id: int,
    session: AsyncSession = Depends(get_session),
) -> AlertExplanation:
    """Return the deterministic explanation stored for one alert.

    Args:
        alert_id: Primary key of the alert.
        session: Injected async database session.

    Raises:
        HTTPException: 404 when the alert does not exist.
    """
    alert = await session.get(Alert, alert_id)
    if alert is None:
        raise HTTPException(status_code=404, detail="Alert not found")
    return AlertExplanation(**explain_alert(alert))


@router.get("/models", response_model=ModelsResponse)
async def list_models(
    session: AsyncSession = Depends(get_session),
) -> ModelsResponse:
    """Report model availability, sidecar metrics and the last training run.

    Args:
        session: Injected async database session.
    """
    forecaster_metrics = forecaster.load_metrics()
    detector_metrics = _read_json(
        Path(detector.MODELS_DIR) / "detector_metrics.json"
    )

    last_run = await session.scalar(
        select(ModelRun).order_by(ModelRun.trained_at.desc(), ModelRun.id.desc()).limit(1)
    )

    return ModelsResponse(
        models={
            "forecaster": ModelStatus(
                name="forecaster_v1",
                loaded=forecaster.is_model_available(),
                path=str(forecaster.MODEL_PATH),
                metrics=forecaster_metrics,
            ),
            "detector": ModelStatus(
                name="detector_v1",
                loaded=detector.is_detector_available(),
                path=str(detector.DETECTOR_PATH),
                metrics=detector_metrics,
            ),
        },
        last_training_run=ModelRunRead.model_validate(last_run) if last_run else None,
    )
