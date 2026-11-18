"""Model training persistence and /api/models tests."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import numpy as np
import pandas as pd
from httpx import AsyncClient
from sqlalchemy import func, select

from app.ai.features import FEATURE_COLUMNS, TARGET_COLUMN
from app.ai.train_forecaster import persist_model_run, train_model
from app.database import SessionLocal
from app.models import ModelRun


def _feature_frame(rows: int = 300) -> pd.DataFrame:
    """Build a synthetic feature table with a learnable daily pattern."""
    start = datetime(2024, 1, 1, tzinfo=timezone.utc)
    hours = np.arange(rows) % 24
    power = 80.0 + 40.0 * np.sin(hours / 24.0 * 2.0 * np.pi)
    frame = pd.DataFrame(
        {
            "timestamp": [start + timedelta(minutes=15 * i) for i in range(rows)],
            "hour": hours,
            "dayofweek": (np.arange(rows) // 96) % 7,
            "is_weekend": 0,
            "temperature": 22.0,
            "humidity": 50.0,
            "occupancy": (hours >= 8).astype(int) & (hours <= 17).astype(int),
            "power_lag1": np.roll(power, 1),
            "power_lag6": np.roll(power, 6),
            "power_lag144": np.roll(power, 144),
            "temp_lag1": 22.0,
            TARGET_COLUMN: power,
        }
    )
    return frame.loc[:, ["timestamp", *FEATURE_COLUMNS, TARGET_COLUMN]]


def test_train_model_produces_finite_metrics() -> None:
    """Training returns a fitted estimator and valid MAE/RMSE/R² values."""
    model, metrics = train_model(_feature_frame(), test_size=0.2)

    assert model is not None
    assert metrics["mae"] >= 0
    assert metrics["rmse"] >= 0
    assert -1.0 <= metrics["r2"] <= 1.0


async def test_persist_model_run_inserts_one_valid_row() -> None:
    """Metrics are persisted once with the expected numeric values."""
    metrics = {
        "mae": 12.5,
        "rmse": 18.2,
        "r2": 0.91,
        "n_samples": 1000,
        "trained_at": datetime.now(timezone.utc).isoformat(),
    }

    run_id = await persist_model_run(metrics, notes="pytest")
    await persist_model_run(metrics, notes="pytest-second")

    async with SessionLocal() as session:
        count = await session.scalar(select(func.count()).select_from(ModelRun))
        row = await session.get(ModelRun, run_id)
        assert count == 2
        assert row is not None
        assert row.model_name == "forecaster_v1"
        assert row.mae == 12.5
        assert row.rmse == 18.2
        assert row.r2 == 0.91
        assert row.n_samples == 1000
        assert row.notes == "pytest"


async def test_models_route_reports_both_models(client: AsyncClient) -> None:
    """GET /api/models exposes forecaster/detector status and last run."""
    await persist_model_run(
        {"mae": 10.0, "rmse": 15.0, "r2": 0.9, "n_samples": 500}
    )

    response = await client.get("/api/models")

    assert response.status_code == 200
    body = response.json()
    assert set(body["models"]) == {"forecaster", "detector"}
    assert body["models"]["forecaster"]["name"] == "forecaster_v1"
    assert body["last_training_run"]["mae"] == 10.0
    assert body["last_training_run"]["n_samples"] == 500
