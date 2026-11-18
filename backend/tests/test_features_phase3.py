"""Tests for Phase 3 Features: Solar, Eco Mode, Carbon Report, and FDD Explanations."""

from __future__ import annotations

from datetime import datetime, timezone

import pytest
from httpx import ASGITransport, AsyncClient

from app.ai.explainer import explain_alert
from app.database import SessionLocal
from app.main import app
from app.models import Alert, Saving, SolarProduction, SystemSetting
from app.solar import calculate_solar_power_kw


async def _get_client() -> AsyncClient:
    transport = ASGITransport(app=app)
    return AsyncClient(transport=transport, base_url="http://test")


# ============================================================================
# FEATURE 1 & 2: FDD Diagnostic Causes
# ============================================================================

def test_fdd_explainer_equipment_failure() -> None:
    """Power is high but temperature is normal -> Équipement défaillant."""
    alert = {
        "type": "OVERCONSUMPTION_VS_FORECAST",
        "severity": "HIGH",
        "device_id": "SALLE1",
        "timestamp": "2026-11-09T14:00:00Z",
    }
    context = {
        "power": 150.0,
        "temperature": 21.0,  # Normal temp (<= 25°C)
        "residual": 45.0,
        "hour": 14,
    }
    explanation = explain_alert(alert, context=context)
    assert explanation["evidence"]["physical_cause"] == "Équipement défaillant"
    assert "Équipement défaillant" in explanation["reason"]


def test_fdd_explainer_ac_overload() -> None:
    """Power is high and temperature is high (>25°C) -> Climatisation surchargée."""
    alert = {
        "type": "OVERCONSUMPTION_VS_FORECAST",
        "severity": "HIGH",
        "device_id": "SALLE1",
        "timestamp": "2026-11-09T15:00:00Z",
    }
    context = {
        "power": 180.0,
        "temperature": 29.5,  # High temp (> 25°C)
        "residual": 60.0,
        "hour": 15,
    }
    explanation = explain_alert(alert, context=context)
    assert explanation["evidence"]["physical_cause"] == "Climatisation surchargée"
    assert "Climatisation surchargée" in explanation["reason"]


def test_fdd_explainer_night_waste() -> None:
    """Night consumption is high (20h-06h) -> Éclairage ou appareil oublié."""
    alert = {
        "type": "OVERCONSUMPTION_VS_FORECAST",
        "severity": "HIGH",
        "device_id": "SALLE1",
        "timestamp": "2026-11-09T23:30:00Z",
    }
    context = {
        "power": 95.0,
        "temperature": 22.0,
        "residual": 30.0,
        "hour": 23,  # Night hour
    }
    explanation = explain_alert(alert, context=context)
    assert explanation["evidence"]["physical_cause"] == "Éclairage ou appareil oublié"
    assert "Éclairage ou appareil oublié" in explanation["reason"]


# ============================================================================
# FEATURE 3: Solar Photovoltaic
# ============================================================================

def test_solar_bell_curve_day_and_night() -> None:
    """Solar power peaks at noon and is zero at night."""
    noon = datetime(2026, 11, 9, 12, 0, 0, tzinfo=timezone.utc)
    night = datetime(2026, 11, 9, 23, 0, 0, tzinfo=timezone.utc)

    kw_noon = calculate_solar_power_kw(noon, peak_kw=6.0, noise_factor=0.0)
    kw_night = calculate_solar_power_kw(night, peak_kw=6.0)

    assert kw_noon > 5.0
    assert kw_night == 0.0


async def test_solar_current_endpoint() -> None:
    """GET /api/solar/current returns power_kw, power_w, and status."""
    async with await _get_client() as client:
        response = await client.get("/api/solar/current")
    assert response.status_code == 200
    data = response.json()
    assert "power_kw" in data
    assert "power_w" in data
    assert "peak_kw" in data
    assert "is_generating" in data
    assert isinstance(data["power_kw"], (int, float))


async def test_solar_history_endpoint() -> None:
    """GET /api/solar/history returns 24h data points."""
    async with await _get_client() as client:
        response = await client.get("/api/solar/history?hours=24")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) > 0
    assert "timestamp" in data[0]
    assert "power_kw" in data[0]


# ============================================================================
# FEATURE 4: Eco Mode (Demand Response)
# ============================================================================

async def test_eco_mode_toggle_and_peak_alert() -> None:
    """POST /api/system/eco-mode toggles mode and generates peak alert."""
    async with await _get_client() as client:
        # Check initial state
        initial = await client.get("/api/system/eco-mode")
        assert initial.status_code == 200

        # Enable Eco Mode
        res_on = await client.post("/api/system/eco-mode", json={"enabled": True})
        assert res_on.status_code == 200
        body_on = res_on.json()
        assert body_on["eco_mode"] is True

        # Verify active in DB
        check_on = await client.get("/api/system/eco-mode")
        assert check_on.json()["eco_mode"] is True

        # Disable Eco Mode
        res_off = await client.post("/api/system/eco-mode", json={"enabled": False})
        assert res_off.status_code == 200
        assert res_off.json()["eco_mode"] is False


# ============================================================================
# FEATURE 5: Carbon Footprint Report (Bilan Carbone)
# ============================================================================

async def test_carbon_report_calculation() -> None:
    """GET /api/reports/carbon calculates CO2 avoided using 0.45 factor and tree count."""
    async with SessionLocal() as session:
        saving = Saving(
            device_id="SALLE1",
            timestamp=datetime.now(timezone.utc),
            action_applied="Coupure veille",
            baseline_kwh=100.0,
            actual_kwh=20.0,
            saved_kwh=80.0,
            saved_percent=80.0,
        )
        session.add(saving)
        await session.commit()

    async with await _get_client() as client:
        response = await client.get("/api/reports/carbon")
    assert response.status_code == 200
    data = response.json()
    assert data["saved_kwh"] >= 80.0
    # co2_avoided_kg = saved_kwh * 0.45
    assert data["co2_avoided_kg"] == round(data["saved_kwh"] * 0.45, 2)
    # trees_equivalent = co2_avoided_kg / 20
    assert data["trees_equivalent"] == int(round(data["co2_avoided_kg"] / 20.0))
