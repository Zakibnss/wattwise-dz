"""XGBoost inference for 24-hour power forecasts and residual detection.

The trained estimator is stored as a plain ``XGBRegressor`` in
``backend/models/forecaster.pkl``. Training metrics live in a sidecar JSON file
because the estimator itself does not carry MAE. Keeping the artifact a bare
estimator makes it easy to inspect with joblib and keeps the contract in
Phase 2 B.2 unchanged.
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Mapping, Sequence

import joblib
import pandas as pd
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.features import FEATURE_COLUMNS
from app.models import Reading
from app.schemas import ReadingIngest

logger = logging.getLogger(__name__)

# ``app/ai/forecaster.py`` -> ``backend/models``.
MODELS_DIR = Path(__file__).resolve().parents[2] / "models"
MODEL_PATH = MODELS_DIR / "forecaster.pkl"
METRICS_PATH = MODELS_DIR / "forecaster_metrics.json"

#: Number of 15-minute steps aggregated into one hourly API prediction.
STEPS_PER_HOUR = 4
#: Number of 15-minute steps in the requested 24-hour horizon.
FORECAST_STEPS = 24 * STEPS_PER_HOUR
#: Confidence interval half-width, expressed in multiples of training MAE.
CONFIDENCE_MAE_FACTOR = 1.5

_MODEL: Any | None = None


def load_model(force_reload: bool = False) -> Any:
    """Load and cache the XGBoost forecaster.

    Args:
        force_reload: Discard the cached estimator and read the artifact again.

    Returns:
        The fitted ``XGBRegressor``.

    Raises:
        RuntimeError: If the model artifact has not been trained yet or cannot
            be deserialised.
    """
    global _MODEL
    if _MODEL is not None and not force_reload:
        return _MODEL
    if not MODEL_PATH.is_file():
        raise RuntimeError(
            f"Forecaster model not found at {MODEL_PATH}. "
            "Train it first with: python -m app.ai.train_forecaster"
        )
    try:
        _MODEL = joblib.load(MODEL_PATH)
    except Exception as exc:  # pragma: no cover - corrupted artifact
        raise RuntimeError(
            f"Unable to load forecaster model at {MODEL_PATH}: {exc}"
        ) from exc
    logger.info("Loaded forecaster model from %s", MODEL_PATH)
    return _MODEL


def is_model_available() -> bool:
    """Return whether the forecaster artifact exists on disk."""
    return MODEL_PATH.is_file()


def load_metrics() -> dict[str, Any] | None:
    """Return the sidecar training metrics, or ``None`` when unavailable."""
    if not METRICS_PATH.is_file():
        return None
    try:
        return json.loads(METRICS_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):  # pragma: no cover - defensive
        logger.exception("Unable to read forecaster metrics from %s", METRICS_PATH)
        return None


def _confidence_half_width() -> float:
    """Return ``1.5 × training MAE`` (0.0 when metrics are unavailable)."""
    metrics = load_metrics() or {}
    try:
        mae = float(metrics.get("mae", 0.0))
    except (TypeError, ValueError):  # pragma: no cover - malformed sidecar
        mae = 0.0
    return CONFIDENCE_MAE_FACTOR * max(0.0, mae)


def predict_single(features: Mapping[str, float]) -> float:
    """Predict the power (W) of one 15-minute feature row.

    Args:
        features: Mapping containing every column in
            :data:`app.ai.features.FEATURE_COLUMNS`. Missing keys default to 0.

    Returns:
        The predicted power in watts, clamped to ``0`` or above.
    """
    model = load_model()
    row = {column: float(features.get(column, 0.0)) for column in FEATURE_COLUMNS}
    frame = pd.DataFrame([row], columns=list(FEATURE_COLUMNS))
    prediction = float(model.predict(frame)[0])
    return max(0.0, prediction)


def _as_utc(value: datetime) -> datetime:
    """Attach UTC to naive datetimes and normalise aware ones."""
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _get(reading: Reading | Mapping[str, Any], key: str) -> Any:
    """Read an attribute from either an ORM row or a mapping."""
    if isinstance(reading, Mapping):
        return reading.get(key)
    return getattr(reading, key, None)


def _lag(series: Sequence[float], steps: int, fallback: float) -> float:
    """Return a lagged value, tolerating histories shorter than the lag."""
    if not series:
        return fallback
    if len(series) >= steps:
        return float(series[-steps])
    return float(series[0])


def _hourly_predictions(
    last_readings: Sequence[Reading | Mapping[str, Any]],
) -> list[dict[str, float | int]]:
    """Run 96 fifteen-minute predictions and aggregate them into 24 hours.

    Args:
        last_readings: Chronologically ordered recent readings. The list may be
            empty, short or contain missing sensor values.

    Returns:
        Twenty-four dictionaries with ``hour_offset``, ``predicted_power``,
        ``predicted_energy_kwh``, ``confidence_lower`` and
        ``confidence_upper``.
    """
    ordered = sorted(
        last_readings,
        key=lambda row: _as_utc(_get(row, "timestamp") or datetime.now(timezone.utc)),
    )

    now = datetime.now(timezone.utc)
    last_timestamp = (
        _as_utc(_get(ordered[-1], "timestamp")) if ordered else now
    )

    powers = [
        float(value)
        for value in (_get(row, "power") for row in ordered)
        if value is not None
    ]
    temperatures = [
        float(value)
        for value in (_get(row, "temperature") for row in ordered)
        if value is not None
    ]
    humidities = [
        float(value)
        for value in (_get(row, "humidity") for row in ordered)
        if value is not None
    ]
    occupancies = [
        int(value)
        for value in (_get(row, "occupancy") for row in ordered)
        if value is not None
    ]

    fallback_power = powers[-1] if powers else 0.0
    fallback_temperature = temperatures[-1] if temperatures else 22.0
    fallback_humidity = humidities[-1] if humidities else 50.0
    fallback_occupancy = occupancies[-1] if occupancies else 0

    power_history = list(powers)
    temperature_history = list(temperatures)

    step_predictions: list[tuple[datetime, float]] = []
    for step in range(1, FORECAST_STEPS + 1):
        timestamp = last_timestamp + timedelta(minutes=15 * step)
        features = {
            "hour": float(timestamp.hour),
            "dayofweek": float(timestamp.weekday()),
            "is_weekend": float(timestamp.weekday() >= 5),
            "temperature": fallback_temperature,
            "humidity": fallback_humidity,
            "occupancy": float(fallback_occupancy),
            "power_lag1": _lag(power_history, 1, fallback_power),
            "power_lag6": _lag(power_history, 6, fallback_power),
            "power_lag144": _lag(power_history, 144, fallback_power),
            "temp_lag1": _lag(temperature_history, 1, fallback_temperature),
        }
        predicted = predict_single(features)
        power_history.append(predicted)
        temperature_history.append(fallback_temperature)
        step_predictions.append((timestamp, predicted))

    half_width = _confidence_half_width()
    predictions: list[dict[str, float | int]] = []
    for hour_index in range(24):
        chunk = step_predictions[
            hour_index * STEPS_PER_HOUR : (hour_index + 1) * STEPS_PER_HOUR
        ]
        mean_power = sum(value for _, value in chunk) / len(chunk)
        energy_kwh = sum(value * 0.25 for _, value in chunk) / 1000.0
        predictions.append(
            {
                "hour_offset": hour_index + 1,
                "predicted_power": round(mean_power, 3),
                "predicted_energy_kwh": round(energy_kwh, 6),
                "confidence_lower": round(max(0.0, mean_power - half_width), 3),
                "confidence_upper": round(mean_power + half_width, 3),
            }
        )
    return predictions


def predict_next_24h(
    last_readings: Sequence[Reading | Mapping[str, Any]],
) -> list[dict[str, float | int]]:
    """Forecast the next 24 hours from recent 15-minute readings.

    The estimator was trained on 15-minute bins. To honour the API contract of
    24 hourly items, 96 fifteen-minute predictions are generated and averaged
    per hour; hourly energy is the sum of the four 15-minute energies.

    Args:
        last_readings: Chronologically ordered recent readings (ideally one
            day, at least one value). An empty list yields a persistence-style
            forecast anchored on zero power and default weather.

    Returns:
        A list of exactly 24 prediction dictionaries.

    Raises:
        RuntimeError: If the model artifact is missing.
    """
    load_model()
    return _hourly_predictions(last_readings)


def _feature_row(
    history: Sequence[Reading],
    current: ReadingIngest,
    observed_at: datetime,
) -> dict[str, float]:
    """Build one inference feature row for an incoming reading."""
    ordered = sorted(history, key=lambda row: _as_utc(row.timestamp))
    powers = [float(row.power) for row in ordered if row.power is not None]
    temperatures = [
        float(row.temperature) for row in ordered if row.temperature is not None
    ]

    current_power = float(current.power) if current.power is not None else None
    fallback_power = (
        current_power
        if current_power is not None
        else (powers[-1] if powers else 0.0)
    )
    temperature = (
        float(current.temperature)
        if current.temperature is not None
        else (temperatures[-1] if temperatures else 22.0)
    )
    humidity = float(current.humidity) if current.humidity is not None else 50.0
    occupancy = int(current.occupancy) if current.occupancy is not None else 0

    return {
        "hour": float(observed_at.hour),
        "dayofweek": float(observed_at.weekday()),
        "is_weekend": float(observed_at.weekday() >= 5),
        "temperature": temperature,
        "humidity": humidity,
        "occupancy": float(occupancy),
        "power_lag1": _lag(powers, 1, fallback_power),
        "power_lag6": _lag(powers, 6, fallback_power),
        "power_lag144": _lag(powers, 144, fallback_power),
        "temp_lag1": _lag(temperatures, 1, temperature),
    }


async def predict_power_for_reading(
    session: AsyncSession,
    reading: ReadingIngest,
    observed_at: datetime | None = None,
) -> float | None:
    """Predict the current reading's expected power for residual detection.

    Args:
        session: Async database session used to fetch recent history.
        reading: The incoming validated reading.
        observed_at: Timestamp assigned to the reading (defaults to now UTC).

    Returns:
        The expected power in watts, or ``None`` when no model is available.
    """
    if not is_model_available():
        return None

    moment = _as_utc(observed_at or datetime.now(timezone.utc))
    statement = (
        select(Reading)
        .where(Reading.device_id == reading.device_id)
        .order_by(Reading.timestamp.desc(), Reading.id.desc())
        .limit(160)
    )
    rows = list((await session.scalars(statement)).all())
    history = list(reversed(rows))
    return predict_single(_feature_row(history, reading, moment))
