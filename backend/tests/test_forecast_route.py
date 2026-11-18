"""Forecast endpoint tests."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest
from httpx import AsyncClient

from app.ai import forecaster
from app.database import SessionLocal
from app.models import Reading


async def _insert_history(rows: int = 20) -> None:
    """Insert a short recent history for SALLE1."""
    now = datetime.now(timezone.utc)
    async with SessionLocal() as session:
        session.add_all(
            [
                Reading(
                    device_id="SALLE1",
                    timestamp=now - timedelta(minutes=15 * (rows - index)),
                    power=100.0 + index,
                    temperature=24.0,
                    humidity=50.0,
                    occupancy=1,
                )
                for index in range(rows)
            ]
        )
        await session.commit()


async def test_forecast_route_returns_24_predictions(client: AsyncClient) -> None:
    """GET /api/forecast/next24h returns 24 bounded hourly steps."""
    if not forecaster.MODEL_PATH.is_file():
        pytest.skip("forecaster.pkl not trained in this environment")
    await _insert_history()

    response = await client.get(
        "/api/forecast/next24h", params={"device_id": "SALLE1"}
    )

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["device_id"] == "SALLE1"
    assert len(body["predictions"]) == 24
    for item in body["predictions"]:
        assert item["confidence_lower"] <= item["predicted_power"]
        assert item["predicted_power"] <= item["confidence_upper"]
        assert item["predicted_energy_kwh"] >= 0


async def test_forecast_route_returns_503_without_model(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch, tmp_path
) -> None:
    """An untrained forecaster yields a clear 503 instead of a crash."""
    monkeypatch.setattr(forecaster, "MODEL_PATH", tmp_path / "missing.pkl")
    monkeypatch.setattr(forecaster, "_MODEL", None)
    await _insert_history(rows=1)

    response = await client.get("/api/forecast/next24h")

    assert response.status_code == 503
    assert "train_forecaster" in response.json()["detail"]
