"""Tests for advanced PV monitoring, diagnostics and energy optimization."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest
from pydantic import ValidationError

from app.ai.energy_optimizer import (
    OptimizationInputs,
    TimeOfUseTariff,
    optimize,
)
from app.ai.pv_detector import (
    FAULT_INVERTER_DEGRADATION,
    FAULT_PANEL_OVERHEAT,
    FAULT_UNDERPERFORMANCE,
    PVFaultDetector,
    calculate_expected_power,
    compute_health_score,
    compute_inverter_efficiency,
    estimate_cell_temperature,
)
from app.routes.solar import _hourly_profile, _integrate_kwh


def _reading(
    index: int = 0,
    *,
    device_id: str = "PV1",
    **overrides,
) -> SimpleNamespace:
    """Build a lightweight reading object accepted by the detector."""
    base = {
        "device_id": device_id,
        "timestamp": datetime.now(timezone.utc) - timedelta(minutes=30 - index * 5),
        "dc_voltage": 380.0,
        "dc_current": 2.0,
        "dc_power": 760.0,
        "ac_power": 730.0,
        "irradiance": 800.0,
        "panel_temperature": 40.0,
        "ambient_temperature": 28.0,
        "expected_power": 1000.0,
        "actual_power": 950.0,
        "panel_area": 34.0,
        "panel_efficiency": 0.195,
        "inverter_efficiency": 96.0,
        "inverter_temperature": 40.0,
        "inverter_status": "RUNNING",
        "inverter_dc_input_power": 760.0,
        "inverter_ac_output_power": 730.0,
        "data_source": "simulator",
    }
    base.update(overrides)
    return SimpleNamespace(**base)


# ---------------------------------------------------------------------------
# Physical calculations
# ---------------------------------------------------------------------------
def test_expected_power_formula_at_stc() -> None:
    """G × A × η at 25 °C equals 400 W for the reference case."""
    assert (
        calculate_expected_power(
            1000.0, 2.0, 0.20, panel_temperature_c=25.0
        )
        == pytest.approx(400.0)
    )


def test_expected_power_temperature_derating() -> None:
    """A hot module produces less than at STC with γ = -0.4 %/°C."""
    hot = calculate_expected_power(
        1000.0, 2.0, 0.20, panel_temperature_c=45.0
    )
    assert hot == pytest.approx(400.0 * (1 - 0.004 * 20.0))
    assert hot < 400.0


def test_expected_power_missing_inputs_returns_none() -> None:
    """Missing measurements are not fabricated."""
    assert calculate_expected_power(None, 2.0, 0.20) is None
    assert calculate_expected_power(1000.0, 0.0, 0.20) is None
    assert calculate_expected_power(1000.0, 2.0, None) is None


def test_estimate_cell_temperature_requires_ambient() -> None:
    """The NOCT model needs ambient temperature; otherwise unavailable."""
    assert estimate_cell_temperature(800.0, None) is None
    assert estimate_cell_temperature(800.0, 25.0) == pytest.approx(
        25.0 + (45.0 - 20.0) / 800.0 * 800.0
    )


def test_inverter_efficiency_and_zero_handling() -> None:
    """Efficiency is AC/DC × 100 and invalid DC returns ``None``."""
    assert compute_inverter_efficiency(1000.0, 950.0) == pytest.approx(95.0)
    assert compute_inverter_efficiency(0.0, 0.0) is None
    assert compute_inverter_efficiency(None, 900.0) is None
    assert compute_inverter_efficiency(1000.0, -10.0) is None


# ---------------------------------------------------------------------------
# Detection rules
# ---------------------------------------------------------------------------
def test_underperformance_requires_consecutive_readings() -> None:
    """Two low readings do not fire; three consecutive ones do."""
    two = [
        _reading(index, expected_power=1000.0, actual_power=600.0)
        for index in range(2)
    ]
    assert not any(
        d.fault_type == FAULT_UNDERPERFORMANCE for d in PVFaultDetector().detect(two)
    )

    three = [
        _reading(index, expected_power=1000.0, actual_power=600.0)
        for index in range(3)
    ]
    diagnostics = PVFaultDetector().detect(three)
    fault = next(d for d in diagnostics if d.fault_type == FAULT_UNDERPERFORMANCE)
    assert fault.severity == "WARNING"
    assert "salissure ou ombrage possible" in fault.message
    assert fault.is_confirmed is False
    assert "confirm" not in fault.explanation.lower() or "n'est confirmée" in fault.explanation


def test_underperformance_ignored_at_low_irradiance() -> None:
    """Low production at night/low irradiance is normal, not a fault."""
    rows = [
        _reading(index, irradiance=120.0, expected_power=40.0, actual_power=10.0)
        for index in range(4)
    ]
    assert not any(
        d.fault_type == FAULT_UNDERPERFORMANCE for d in PVFaultDetector().detect(rows)
    )


def test_panel_overheat_requires_two_readings() -> None:
    """A single hot sample is ignored; two consecutive ones raise a warning."""
    single = [_reading(0, panel_temperature=78.0)]
    assert not any(
        d.fault_type == FAULT_PANEL_OVERHEAT for d in PVFaultDetector().detect(single)
    )

    rows = [_reading(i, panel_temperature=78.0) for i in range(2)]
    diagnostics = PVFaultDetector().detect(rows)
    fault = next(d for d in diagnostics if d.fault_type == FAULT_PANEL_OVERHEAT)
    assert "inspection recommandée" in fault.message
    assert fault.is_confirmed is False


def test_inverter_degradation_requires_three_readings() -> None:
    """Persistent efficiency below 90 % over 3 valid readings is flagged."""
    rows = [
        _reading(
            index,
            inverter_efficiency=None,
            dc_power=1000.0,
            ac_power=850.0,
            inverter_dc_input_power=1000.0,
            inverter_ac_output_power=850.0,
            expected_power=1200.0,
            actual_power=850.0,
        )
        for index in range(3)
    ]
    diagnostics = PVFaultDetector().detect(rows)
    fault = next(d for d in diagnostics if d.fault_type == FAULT_INVERTER_DEGRADATION)
    assert fault.severity == "WARNING"
    assert "onduleur dégradé" in fault.message.lower()
    assert fault.confidence is not None


def test_inverter_degradation_not_triggered_with_two_readings() -> None:
    """Two readings are insufficient for a persistent inverter fault."""
    rows = [
        _reading(
            index,
            inverter_efficiency=None,
            dc_power=1000.0,
            ac_power=800.0,
            inverter_dc_input_power=1000.0,
            inverter_ac_output_power=800.0,
            expected_power=1200.0,
            actual_power=800.0,
        )
        for index in range(2)
    ]
    assert not any(
        d.fault_type == FAULT_INVERTER_DEGRADATION
        for d in PVFaultDetector().detect(rows)
    )


def test_sensor_inconsistency_detected() -> None:
    """AC power above DC power is physically impossible and flagged."""
    rows = [
        _reading(0, dc_power=100.0, ac_power=100.0),
        _reading(1, dc_power=100.0, ac_power=200.0),
    ]
    diagnostics = PVFaultDetector().detect(rows)
    assert any(d.fault_type == "PV_SENSOR_INCONSISTENCY" for d in diagnostics)


# ---------------------------------------------------------------------------
# Health score
# ---------------------------------------------------------------------------
def test_health_score_from_active_faults() -> None:
    """Score is deterministic and penalty-based, not random."""
    assert compute_health_score([])["score"] == 100

    warning = SimpleNamespace(status="ACTIVE", severity="WARNING", occurrences=1)
    assert compute_health_score([warning])["score"] == 92

    critical = SimpleNamespace(status="ACTIVE", severity="CRITICAL", occurrences=1)
    assert compute_health_score([critical])["score"] == 80
    assert compute_health_score([critical])["status"] == "warning"

    persistent = SimpleNamespace(status="ACTIVE", severity="CRITICAL", occurrences=9)
    result = compute_health_score([persistent] * 5)
    assert result["score"] == 0
    assert result["status"] == "critical"

    resolved = SimpleNamespace(status="RESOLVED", severity="CRITICAL", occurrences=3)
    assert compute_health_score([resolved])["score"] == 100


# ---------------------------------------------------------------------------
# Energy optimizer
# ---------------------------------------------------------------------------
def test_hourly_profile_converts_watts_to_kwh() -> None:
    """Hourly profile slots must be kWh/hour, not average watts."""
    start = datetime(2026, 3, 1, 10, 0, tzinfo=timezone.utc)
    profile = _hourly_profile(
        [
            (start, 4000.0),
            (start + timedelta(minutes=15), 2000.0),
        ]
    )
    assert len(profile) == 24
    assert profile[10] == pytest.approx(3.0)  # (4000 + 2000) / 2 W = 3 kWh
    assert sum(profile) == pytest.approx(3.0)


def test_integrate_kwh_skips_missing_long_gaps() -> None:
    """Missing telemetry is not interpolated, so no phantom energy is added."""
    start = datetime(2026, 3, 1, 10, 0, tzinfo=timezone.utc)
    energy = _integrate_kwh(
        [
            (start, 1000.0),
            (start + timedelta(minutes=10), 1000.0),
            # A two-hour gap must be ignored rather than integrated.
            (start + timedelta(minutes=130), 1000.0),
        ]
    )
    assert energy == pytest.approx(10 / 60.0)


def test_optimizer_rejects_negative_energy() -> None:
    """Negative energies are rejected by validation."""
    with pytest.raises(ValidationError):
        OptimizationInputs(solar_kwh=-1.0, consumption_kwh=10.0)


def test_optimizer_rejects_invalid_soc_range() -> None:
    """Minimum SoC must stay below the maximum and the current level."""
    with pytest.raises(ValidationError):
        OptimizationInputs(
            battery_min_soc_percent=80.0,
            battery_max_soc_percent=50.0,
            battery_soc_percent=60.0,
        )
    with pytest.raises(ValidationError):
        OptimizationInputs(battery_soc_percent=10.0, battery_min_soc_percent=20.0)


def test_optimizer_surplus_charges_battery_before_unused() -> None:
    """Excess solar charges the battery; only the remainder is unused."""
    result = optimize(
        OptimizationInputs(
            solar_kwh=20.0,
            consumption_kwh=10.0,
            battery_capacity_kwh=10.0,
            battery_soc_percent=50.0,
            battery_min_soc_percent=20.0,
            battery_max_soc_percent=95.0,
            battery_charge_limit_kw=3.0,
            battery_discharge_limit_kw=3.0,
            battery_round_trip_efficiency=0.9,
            grid_tariff_dzd_per_kwh=5.5,
        )
    )
    assert result["solar_used_kwh"] == pytest.approx(10.0)
    assert result["grid_used_kwh"] == 0.0
    assert result["battery_used_kwh"] == 0.0
    assert result["battery_charge_kwh"] > 0.0
    assert result["battery_charge_kwh"] + result["unused_solar_kwh"] == pytest.approx(10.0, abs=0.01)
    assert result["estimated_daily_savings_dzd"] == pytest.approx(55.0, abs=0.01)
    assert result["estimated_savings_percent"] == pytest.approx(100.0)


def test_optimizer_low_battery_avoids_discharge() -> None:
    """At the minimum reserve the grid supplies the deficit."""
    result = optimize(
        OptimizationInputs(
            solar_kwh=2.0,
            consumption_kwh=10.0,
            battery_soc_percent=20.0,
            battery_min_soc_percent=20.0,
            grid_tariff_dzd_per_kwh=5.5,
        )
    )
    assert result["battery_used_kwh"] == 0.0
    assert result["grid_used_kwh"] == pytest.approx(8.0)
    assert result["strategy"] == "low_battery"
    assert result["estimated_daily_savings_dzd"] == pytest.approx(11.0)


def test_optimizer_deficit_discharges_within_reserve() -> None:
    """Battery discharge never exceeds available energy or the reserve."""
    result = optimize(
        OptimizationInputs(
            solar_kwh=2.0,
            consumption_kwh=10.0,
            battery_capacity_kwh=10.0,
            battery_soc_percent=80.0,
            battery_min_soc_percent=20.0,
            battery_discharge_limit_kw=3.0,
            battery_round_trip_efficiency=0.9,
            horizon_hours=24.0,
        )
    )
    stored = 10.0 * (80.0 - 20.0) / 100.0
    max_deliverable = stored * (0.9 ** 0.5)
    assert result["battery_used_kwh"] <= max_deliverable + 1e-6
    assert result["solar_used_kwh"] + result["battery_used_kwh"] + result["grid_used_kwh"] == pytest.approx(10.0, abs=0.01)
    assert result["battery_level_percent"] >= 20.0


def test_optimizer_export_only_when_enabled() -> None:
    """Surplus is exported only if the grid export is explicitly enabled."""
    common = dict(
        solar_kwh=20.0,
        consumption_kwh=5.0,
        battery_capacity_kwh=1.0,
        battery_soc_percent=95.0,
        battery_max_soc_percent=95.0,
        battery_min_soc_percent=20.0,
    )
    without = optimize(OptimizationInputs(**common))
    with_export = optimize(
        OptimizationInputs(
            **common,
            grid_export_enabled=True,
            grid_export_tariff_dzd_per_kwh=3.0,
        )
    )
    assert without["exported_kwh"] == 0.0
    assert without["unused_solar_kwh"] > 0.0
    assert with_export["exported_kwh"] > 0.0
    assert with_export["unused_solar_kwh"] == pytest.approx(0.0)


def test_optimizer_hourly_forecast_balances_energy() -> None:
    """Hourly simulation conserves energy and produces non-negative savings."""
    solar = [0.0] * 8 + [1.2] * 8 + [0.0] * 8
    consumption = [0.5] * 24
    result = optimize(
        OptimizationInputs(
            solar_kwh=sum(solar),
            consumption_kwh=sum(consumption),
            solar_forecast_kwh=solar,
            consumption_forecast_kwh=consumption,
            battery_capacity_kwh=10.0,
            battery_soc_percent=50.0,
            time_of_use_tariffs=[
                TimeOfUseTariff(start_hour=17, end_hour=21, tariff_dzd_per_kwh=8.0)
            ],
        )
    )
    assert result["forecast_used"] is True
    allocated = (
        result["solar_used_kwh"]
        + result["battery_used_kwh"]
        + result["grid_used_kwh"]
    )
    assert allocated == pytest.approx(sum(consumption), abs=0.05)
    assert result["estimated_daily_savings_dzd"] >= 0.0
    assert 0.0 <= result["battery_level_percent"] <= 100.0
    assert result["optimization_status"] == "ok"


def test_time_of_use_tariff_lookup() -> None:
    """Configured time-of-use windows override the flat tariff."""
    inputs = OptimizationInputs(
        time_of_use_tariffs=[
            TimeOfUseTariff(start_hour=17, end_hour=21, tariff_dzd_per_kwh=8.0)
        ],
        grid_tariff_dzd_per_kwh=5.5,
    )
    assert inputs.tariff_for_hour(18) == 8.0
    assert inputs.tariff_for_hour(10) == 5.5


# ---------------------------------------------------------------------------
# API endpoints
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_pv_endpoints_respond_with_valid_schemas(client) -> None:
    """All new endpoints return the documented schema with seeded telemetry."""
    from app.database import SessionLocal
    from app.models import PVReading

    now = datetime.now(timezone.utc)
    async with SessionLocal() as session:
        for index in range(5):
            session.add(
                PVReading(
                    device_id="PV1",
                    timestamp=now - timedelta(minutes=40 - index * 5),
                    dc_voltage=380.0,
                    dc_current=2.0,
                    dc_power=760.0,
                    ac_power=730.0,
                    irradiance=800.0,
                    panel_temperature=42.0,
                    ambient_temperature=28.0,
                    expected_power=1000.0,
                    actual_power=600.0,
                    panel_area=34.0,
                    panel_efficiency=0.195,
                    inverter_efficiency=None,
                    inverter_temperature=41.0,
                    inverter_status="RUNNING",
                    inverter_dc_input_power=760.0,
                    inverter_ac_output_power=646.0,
                    data_source="simulator",
                )
            )
        await session.commit()

    detailed = await client.get("/api/solar/detailed?device_id=PV1&hours=24")
    assert detailed.status_code == 200
    body = detailed.json()
    assert body["data_available"] is True
    assert body["latest"]["data_source"] == "simulator"
    assert len(body["history"]) == 5
    assert body["deviation_percent"] is not None and body["deviation_percent"] < 0

    faults = await client.get("/api/solar/faults?device_id=PV1")
    assert faults.status_code == 200
    fault_body = faults.json()
    assert fault_body["health_score"] is not None
    assert fault_body["health_score"] < 100
    types = {fault["fault_type"] for fault in fault_body["active_faults"]}
    assert "PV_UNDERPERFORMANCE" in types
    assert "INVERTER_DEGRADATION" in types

    # A second call must not duplicate the same persistent faults.
    again = await client.get("/api/solar/faults?device_id=PV1")
    assert again.status_code == 200
    assert len(again.json()["active_faults"]) == len(fault_body["active_faults"])

    inverter = await client.get("/api/solar/inverter-status?device_id=PV1")
    assert inverter.status_code == 200
    inverter_body = inverter.json()
    assert inverter_body["data_available"] is True
    assert inverter_body["efficiency_percent"] == pytest.approx(
        646.0 / 760.0 * 100.0, abs=0.01
    )
    assert inverter_body["degraded"] is True

    optimization = await client.get(
        "/api/solar/optimization?solar_kwh=20&consumption_kwh=10"
    )
    assert optimization.status_code == 200
    opt = optimization.json()
    assert set(
        [
            "solar_used_kwh",
            "battery_used_kwh",
            "grid_used_kwh",
            "unused_solar_kwh",
            "battery_level_percent",
            "estimated_daily_savings_dzd",
            "estimated_savings_percent",
            "baseline_cost_dzd",
            "optimized_cost_dzd",
            "recommendation_text",
            "optimization_status",
        ]
    ).issubset(opt)
    assert opt["solar_used_kwh"] == pytest.approx(10.0)
    assert opt["battery_simulated"] is True


@pytest.mark.asyncio
async def test_pv_endpoints_without_telemetry_are_explicit(client) -> None:
    """Missing telemetry is reported, never replaced by fabricated values."""
    detailed = await client.get("/api/solar/detailed?device_id=PV_EMPTY")
    assert detailed.status_code == 200
    assert detailed.json()["data_available"] is False
    assert detailed.json()["latest"] is None

    faults = await client.get("/api/solar/faults?device_id=PV_EMPTY")
    assert faults.status_code == 200
    body = faults.json()
    assert body["health_status"] == "unknown"
    assert body["health_score"] is None
    assert body["active_faults"] == []

    inverter = await client.get("/api/solar/inverter-status?device_id=PV_EMPTY")
    assert inverter.status_code == 200
    assert inverter.json()["data_available"] is False
    assert "indisponible" in inverter.json()["data_availability_message"].lower()

    optimization = await client.get("/api/solar/optimization?solar_kwh=0&consumption_kwh=0")
    assert optimization.status_code == 200
    assert optimization.json()["optimization_status"] == "no_data"
