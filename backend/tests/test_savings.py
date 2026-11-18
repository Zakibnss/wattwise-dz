"""Savings endpoint tests."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from httpx import AsyncClient, ASGITransport

from app.database import SessionLocal
from app.main import app
from app.models import Alert, Saving


async def _insert_alert() -> int:
    """Insert an unresolved alert and return its id."""
    async with SessionLocal() as session:
        alert = Alert(
            device_id="SALLE1",
            timestamp=datetime.now(timezone.utc),
            type="FAN_NO_OCCUPANCY",
            severity="HIGH",
            message="Ventilateur allumé sans occupation",
            cause="PIR = 0 et courant ventilateur > 0.1 A",
            confidence=0.95,
        )
        session.add(alert)
        await session.commit()
        await session.refresh(alert)
        return int(alert.id)


async def _insert_savings_row() -> None:
    """Insert one savings row linked to a fresh alert."""
    alert_id = await _insert_alert()
    async with SessionLocal() as session:
        row = Saving(
            alert_id=alert_id,
            device_id="SALLE1",
            timestamp=datetime.now(timezone.utc),
            action_applied="Ventilateur éteint",
            baseline_kwh=10.0,
            actual_kwh=4.0,
            saved_kwh=6.0,
            saved_percent=60.0,
            confidence=None,
        )
        session.add(row)
        await session.commit()


async def _get_client() -> AsyncClient:
    transport = ASGITransport(app=app)
    return AsyncClient(transport=transport, base_url="http://test")


async def test_create_savings_valid() -> None:
    """POST /api/savings with valid alert_id returns 200 and correct savings."""
    alert_id = await _insert_alert()
    async with await _get_client() as client:
        response = await client.post(
            "/api/savings",
            json={
                "alert_id": alert_id,
                "device_id": "SALLE1",
                "action_applied": "Ventilateur éteint",
                "baseline_kwh": 10.0,
                "actual_kwh": 4.0,
            },
        )
    assert response.status_code == 200
    body = response.json()
    assert body["alert_id"] == alert_id
    assert body["device_id"] == "SALLE1"
    assert body["action_applied"] == "Ventilateur éteint"
    assert body["baseline_kwh"] == 10.0
    assert body["actual_kwh"] == 4.0
    assert body["saved_kwh"] == 6.0
    assert body["saved_percent"] == 60.0


async def test_create_savings_invalid_alert_returns_404() -> None:
    """POST /api/savings with unknown alert_id returns 404."""
    async with await _get_client() as client:
        response = await client.post(
            "/api/savings",
            json={
                "alert_id": 999999,
                "device_id": "SALLE1",
                "action_applied": "Ventilateur éteint",
                "baseline_kwh": 10.0,
                "actual_kwh": 4.0,
            },
        )
    assert response.status_code == 404


async def test_savings_summary_empty() -> None:
    """GET /api/savings/summary with no data returns zero totals."""
    async with await _get_client() as client:
        response = await client.get("/api/savings/summary")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["total_saved_kwh"] == 0.0
    assert body["total_saved_dzd"] == 0.0
    assert body["count"] == 0
    assert body["items"] == []


async def test_savings_summary_aggregates() -> None:
    """GET /api/savings/summary aggregates kwh and converts to DZD."""
    await _insert_savings_row()
    await _insert_savings_row()
    async with await _get_client() as client:
        response = await client.get("/api/savings/summary")
    assert response.status_code == 200
    body = response.json()
    assert body["count"] == 2
    assert body["total_saved_kwh"] == 12.0
    assert body["total_saved_dzd"] == 66.0
    assert len(body["items"]) == 2


async def test_savings_summary_currency_conversion() -> None:
    """total_saved_dzd = total_saved_kwh * DZD_PER_KWH (5.5)."""
    await _insert_savings_row()
    async with await _get_client() as client:
        response = await client.get("/api/savings/summary")
    assert response.status_code == 200
    body = response.json()
    assert body["total_saved_dzd"] == body["total_saved_kwh"] * 5.5
