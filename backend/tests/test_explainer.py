"""Explainer template and explanation-endpoint tests."""

from __future__ import annotations

import json
from datetime import datetime, timezone

import pytest
from httpx import AsyncClient

from app.ai.explainer import explain_alert
from app.database import SessionLocal
from app.models import Alert

ALERT_TYPES = (
    "FAN_NO_OCCUPANCY",
    "HIGH_POWER_NO_OCCUPANCY",
    "LIGHTING_WASTE",
    "LIGHTING_CANDIDATE",
    "OVERCONSUMPTION_VS_FORECAST",
    "ISOLATION_FOREST_ANOMALY",
)


@pytest.mark.parametrize("alert_type", ALERT_TYPES)
def test_explain_alert_returns_all_four_keys(alert_type: str) -> None:
    """Every supported type yields reason/evidence/action/savings."""
    alert = {
        "type": alert_type,
        "severity": "MEDIUM",
        "message": "demo",
        "confidence": 0.9,
        "device_id": "SALLE1",
        "timestamp": datetime.now(timezone.utc),
    }
    context = {
        "power": 300.0,
        "fan_current": 0.4,
        "occupancy": 0,
        "lux": 650.0,
        "residual": 200.0,
    }

    explanation = explain_alert(alert, context=context)

    assert set(explanation) == {
        "reason",
        "evidence",
        "recommended_action",
        "estimated_savings_kwh_per_day",
    }
    assert isinstance(explanation["reason"], str) and explanation["reason"]
    assert isinstance(explanation["evidence"], dict)
    assert isinstance(explanation["recommended_action"], str)
    assert (
        explanation["estimated_savings_kwh_per_day"] is None
        or explanation["estimated_savings_kwh_per_day"] >= 0
    )


def test_fan_savings_follow_the_documented_formula() -> None:
    """FAN savings = fan_current × 220 V × hours / 1000."""
    explanation = explain_alert(
        {"type": "FAN_NO_OCCUPANCY", "device_id": "SALLE1"},
        context={"fan_current": 0.5},
    )

    # Default 8 h: 0.5 * 220 * 8 / 1000 = 0.88 kWh/day
    assert explanation["estimated_savings_kwh_per_day"] == pytest.approx(0.88)


def test_stored_explanation_is_returned_unchanged() -> None:
    """A cause column already holding explanation JSON is not re-templated."""
    stored = {
        "reason": "already stored",
        "evidence": {"a": 1},
        "recommended_action": "none",
        "estimated_savings_kwh_per_day": None,
    }
    alert = {"type": "FAN_NO_OCCUPANCY", "cause": json.dumps(stored)}

    assert explain_alert(alert) == stored


async def test_explanation_endpoint_returns_payload(client: AsyncClient) -> None:
    """GET /api/alerts/{id}/explanation serialises the explainer output."""
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
        alert_id = alert.id

    response = await client.get(f"/api/alerts/{alert_id}/explanation")

    assert response.status_code == 200
    body = response.json()
    assert body["reason"] == "Ventilateur allumé sans occupant"
    assert body["recommended_action"] == "Relier au capteur de présence"
    assert "evidence" in body
    assert "estimated_savings_kwh_per_day" in body


async def test_explanation_endpoint_returns_404(client: AsyncClient) -> None:
    """Unknown alert ids return a 404."""
    response = await client.get("/api/alerts/999999/explanation")

    assert response.status_code == 404
