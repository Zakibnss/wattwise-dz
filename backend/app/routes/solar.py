"""Solar Photovoltaic endpoints.

Existing Phase-2 endpoints (``/current`` and ``/history``) are preserved. The
advanced endpoints below expose detailed PV telemetry, rule-based diagnostics,
inverter monitoring and the deterministic energy-source optimizer.

Data-source policy: every payload carries ``data_source`` so the UI can label
simulated data (``simulator``) separately from physical telemetry (``mqtt``).
No endpoint fabricates sensor measurements: when telemetry is missing the
response explicitly reports ``data_available = false``.
"""

from __future__ import annotations

import logging
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Any, Iterable, Sequence

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.energy_optimizer import OptimizationInputs, optimize
from app.ai.pv_detector import (
    FAULT_INVERTER_DEGRADATION,
    FAULT_INVERTER_OVERHEAT,
    HEALTH_METHODOLOGY,
    PVFaultDetector,
    compute_health_score,
    compute_inverter_efficiency,
    detect_and_persist,
)
from app.config import get_settings
from app.database import get_session
from app.models import PVFault, PVReading, Reading, SolarProduction
from app.schemas import (
    InverterEfficiencyPoint,
    InverterStatusResponse,
    PvDetailedResponse,
    PvFaultRead,
    PvFaultsResponse,
    PvReadingPoint,
    SolarOptimizationResponse,
)
from app.solar import calculate_solar_power_kw

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/solar", tags=["solar"])

#: Numeric fields averaged when resampling PV history.
_RESAMPLE_FIELDS = (
    "dc_voltage",
    "dc_current",
    "dc_power",
    "ac_power",
    "irradiance",
    "panel_temperature",
    "ambient_temperature",
    "expected_power",
    "actual_power",
    "inverter_efficiency",
    "inverter_temperature",
    "inverter_dc_input_power",
    "inverter_ac_output_power",
)


# ---------------------------------------------------------------------------
# Existing endpoints (unchanged behaviour)
# ---------------------------------------------------------------------------
@router.get("/current")
async def get_current_solar(
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    """Return the current solar photovoltaic power generation.

    If a recent reading exists in the database within the last 15 minutes,
    its value is returned. Otherwise, solar power is dynamically computed
    from the current diurnal sun position.
    """
    now = datetime.now(timezone.utc)
    recent_threshold = now - timedelta(minutes=15)

    stmt = (
        select(SolarProduction)
        .where(SolarProduction.timestamp >= recent_threshold)
        .order_by(SolarProduction.timestamp.desc())
        .limit(1)
    )
    latest = (await session.scalars(stmt)).first()

    if latest is not None:
        power_kw = round(float(latest.power_kw), 3)
        ts = latest.timestamp
    else:
        power_kw = calculate_solar_power_kw(now)
        ts = now

    power_w = round(power_kw * 1000.0, 1)

    return {
        "timestamp": ts.isoformat() if hasattr(ts, "isoformat") else str(ts),
        "power_kw": power_kw,
        "power_w": power_w,
        "peak_kw": 6.5,
        "is_generating": power_kw > 0.05,
    }


@router.get("/history")
async def get_solar_history(
    hours: int = Query(default=24, ge=1, le=168),
    session: AsyncSession = Depends(get_session),
) -> list[dict[str, Any]]:
    """Return historical solar production data points for chart display.

    Args:
        hours: Number of past hours to retrieve (default: 24).
        session: Injected async database session.

    Returns:
        A list of data points with timestamp, power_kw, and power_w.
    """
    now = datetime.now(timezone.utc)
    start_time = now - timedelta(hours=hours)

    stmt = (
        select(SolarProduction)
        .where(SolarProduction.timestamp >= start_time)
        .order_by(SolarProduction.timestamp.asc())
    )
    rows = list((await session.scalars(stmt)).all())

    if rows:
        return [
            {
                "timestamp": row.timestamp.isoformat(),
                "power_kw": round(float(row.power_kw), 3),
                "power_w": round(float(row.power_kw) * 1000.0, 1),
            }
            for row in rows
        ]

    # If no stored rows, generate an hourly curve for smooth display
    synthetic: list[dict[str, Any]] = []
    current = start_time
    while current <= now:
        kw = calculate_solar_power_kw(current)
        synthetic.append(
            {
                "timestamp": current.isoformat(),
                "power_kw": kw,
                "power_w": round(kw * 1000.0, 1),
            }
        )
        current += timedelta(minutes=30)

    return synthetic


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _as_utc(value: datetime | None) -> datetime | None:
    """Attach UTC to naive datetimes coming from PostgreSQL drivers."""
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value


def _actual_power(row: PVReading) -> float | None:
    """Return the measured PV power, preferring the explicit actual value."""
    if row.actual_power is not None:
        return float(row.actual_power)
    if row.ac_power is not None:
        return float(row.ac_power)
    if row.dc_power is not None:
        return float(row.dc_power)
    return None


def _expected_power(row: PVReading) -> float | None:
    """Return the stored expected power or recompute it from raw measurements."""
    if row.expected_power is not None:
        return float(row.expected_power)
    settings = get_settings()
    return PVFaultDetector(settings=settings)._expected_power(row)  # noqa: SLF001


def _is_stale(timestamp: datetime | None) -> bool:
    """Return whether a measurement is older than the configured threshold."""
    ts = _as_utc(timestamp)
    if ts is None:
        return True
    settings = get_settings()
    return datetime.now(timezone.utc) - ts > timedelta(
        minutes=settings.pv_stale_after_minutes
    )


def _resample(
    rows: Sequence[PVReading], resolution_minutes: int
) -> list[dict[str, Any]]:
    """Average PV measurements into fixed time buckets for chart display."""
    if resolution_minutes <= 0:
        return [PvReadingPoint.model_validate(row).model_dump() for row in rows]

    bucket_seconds = resolution_minutes * 60
    groups: dict[int, list[PVReading]] = defaultdict(list)
    for row in rows:
        ts = _as_utc(row.timestamp)
        if ts is None:
            continue
        groups[int(ts.timestamp()) // bucket_seconds].append(row)

    output: list[dict[str, Any]] = []
    for key in sorted(groups):
        bucket = groups[key]
        last = bucket[-1]
        payload: dict[str, Any] = {
            "id": last.id,
            "device_id": last.device_id,
            "timestamp": _as_utc(
                datetime.fromtimestamp(key * bucket_seconds, tz=timezone.utc)
            ),
            "data_source": last.data_source,
        }
        for field in _RESAMPLE_FIELDS:
            values = [
                getattr(item, field)
                for item in bucket
                if getattr(item, field) is not None
            ]
            payload[field] = (
                round(sum(float(v) for v in values) / len(values), 3)
                if values
                else None
            )
        payload["panel_area"] = last.panel_area
        payload["panel_efficiency"] = last.panel_efficiency
        payload["inverter_status"] = last.inverter_status
        output.append(payload)
    return output


def _integrate_kwh(
    points: Iterable[tuple[datetime, float | None]],
    *,
    max_gap_seconds: float = 30 * 60,
) -> float:
    """Trapezoidal integration of power samples (W) into energy (kWh).

    Gaps longer than ``max_gap_seconds`` are treated as missing telemetry and
    are **not** integrated. Interpolating across hours of missing data would
    fabricate energy (and amplify an isolated outlier into a huge total).
    """
    ordered = sorted(
        ((_as_utc(ts), value) for ts, value in points if ts is not None and value is not None),
        key=lambda item: item[0],
    )
    energy_wh = 0.0
    for (prev_ts, prev_power), (ts, power) in zip(ordered, ordered[1:]):
        assert prev_ts is not None and ts is not None
        gap = (ts - prev_ts).total_seconds()
        if gap <= 0 or gap > max_gap_seconds:
            continue
        energy_wh += (float(prev_power) + float(power)) / 2.0 * (gap / 3600.0)
    return max(0.0, energy_wh / 1000.0)


# ---------------------------------------------------------------------------
# Feature 1 — detailed PV monitoring
# ---------------------------------------------------------------------------
@router.get("/detailed", response_model=PvDetailedResponse)
async def get_detailed_pv(
    device_id: str | None = Query(default=None, max_length=50),
    hours: int = Query(default=24, ge=1, le=168),
    resolution_minutes: int = Query(default=0, ge=0, le=240),
    session: AsyncSession = Depends(get_session),
) -> PvDetailedResponse:
    """Return the latest PV measurements plus historical telemetry.

    Args:
        device_id: PV device identifier (defaults to ``PV_DEVICE_ID``).
        hours: History window in hours.
        resolution_minutes: Optional bucket size for down-sampling (0 = raw).
        session: Injected async database session.
    """
    settings = get_settings()
    target = device_id or settings.pv_device_id
    now = datetime.now(timezone.utc)
    start = now - timedelta(hours=hours)

    latest = (
        await session.scalars(
            select(PVReading)
            .where(PVReading.device_id == target)
            .order_by(PVReading.timestamp.desc(), PVReading.id.desc())
            .limit(1)
        )
    ).first()

    rows = list(
        (
            await session.scalars(
                select(PVReading)
                .where(PVReading.device_id == target, PVReading.timestamp >= start)
                .order_by(PVReading.timestamp.asc(), PVReading.id.asc())
            )
        ).all()
    )

    history = _resample(rows, resolution_minutes)
    expected = _expected_power(latest) if latest else None
    actual = _actual_power(latest) if latest else None
    deviation_w = (
        round(actual - expected, 1)
        if actual is not None and expected is not None
        else None
    )
    deviation_pct = (
        round(((actual - expected) / expected) * 100.0, 1)
        if actual is not None and expected is not None and expected > 0
        else None
    )

    return PvDetailedResponse(
        device_id=target,
        data_available=latest is not None,
        latest=PvReadingPoint.model_validate(latest) if latest else None,
        history=[PvReadingPoint.model_validate(point) for point in history],
        expected_power_w=round(expected, 1) if expected is not None else None,
        actual_power_w=round(actual, 1) if actual is not None else None,
        deviation_w=deviation_w,
        deviation_percent=deviation_pct,
        data_source=latest.data_source if latest else None,
        last_update=_as_utc(latest.timestamp) if latest else None,
        is_stale=_is_stale(latest.timestamp) if latest else True,
        resolution_minutes=resolution_minutes,
    )


# ---------------------------------------------------------------------------
# Feature 2 — PV fault detection and health score
# ---------------------------------------------------------------------------
@router.get("/faults", response_model=PvFaultsResponse)
async def get_pv_faults(
    device_id: str | None = Query(default=None, max_length=50),
    history_limit: int = Query(default=30, ge=1, le=200),
    session: AsyncSession = Depends(get_session),
) -> PvFaultsResponse:
    """Run the diagnostic engine and return active faults plus health score.

    Diagnostics are persisted with duplicate suppression: a persistent fault
    is updated in place instead of creating one row per reading. The endpoint
    also auto-resolves faults whose condition disappeared.
    """
    settings = get_settings()
    target = device_id or settings.pv_device_id

    rows = list(
        (
            await session.scalars(
                select(PVReading)
                .where(PVReading.device_id == target)
                .order_by(PVReading.timestamp.desc(), PVReading.id.desc())
                .limit(max(50, settings.pv_consecutive_readings * 20))
            )
        ).all()
    )
    rows.reverse()

    latest = rows[-1] if rows else None
    if rows:
        active = await detect_and_persist(session, rows, target)
    else:
        active = list(
            (
                await session.scalars(
                    select(PVFault).where(
                        PVFault.device_id == target, PVFault.status == "ACTIVE"
                    )
                )
            ).all()
        )

    history = list(
        (
            await session.scalars(
                select(PVFault)
                .where(PVFault.device_id == target)
                .order_by(PVFault.last_detected_at.desc())
                .limit(history_limit)
            )
        ).all()
    )

    if rows:
        health = compute_health_score(active)
        health_score: int | None = health["score"]
        health_status = health["status"]
        health_label = health["label"]
    else:
        health = compute_health_score([])
        health_score = None
        health_status = "unknown"
        health_label = "Aucune donnée photovoltaïque disponible"

    return PvFaultsResponse(
        device_id=target,
        data_available=latest is not None,
        health_score=health_score,
        health_status=health_status,
        health_label=health_label,
        active_faults=[PvFaultRead.model_validate(fault) for fault in active],
        history=[PvFaultRead.model_validate(fault) for fault in history],
        critical_count=health["critical_faults"],
        warning_count=health["warning_faults"],
        methodology=HEALTH_METHODOLOGY,
        last_update=_as_utc(latest.timestamp) if latest else None,
        is_stale=_is_stale(latest.timestamp) if latest else True,
    )


# ---------------------------------------------------------------------------
# Feature 3 — inverter monitoring
# ---------------------------------------------------------------------------
@router.get("/inverter-status", response_model=InverterStatusResponse)
async def get_inverter_status(
    device_id: str | None = Query(default=None, max_length=50),
    hours: int = Query(default=24, ge=1, le=168),
    session: AsyncSession = Depends(get_session),
) -> InverterStatusResponse:
    """Return inverter performance, efficiency history and maintenance advice.

    Telemetry is never invented: if DC/AC input-output values are absent the
    endpoint reports ``data_available = false`` with an explicit message.
    """
    settings = get_settings()
    target = device_id or settings.pv_device_id
    start = datetime.now(timezone.utc) - timedelta(hours=hours)

    rows = list(
        (
            await session.scalars(
                select(PVReading)
                .where(PVReading.device_id == target, PVReading.timestamp >= start)
                .order_by(PVReading.timestamp.asc(), PVReading.id.asc())
            )
        ).all()
    )

    efficiency_history: list[InverterEfficiencyPoint] = []
    for row in rows:
        dc = row.inverter_dc_input_power
        if dc is None:
            dc = row.dc_power
        ac = row.inverter_ac_output_power
        if ac is None:
            ac = row.ac_power
        efficiency = row.inverter_efficiency
        if efficiency is None:
            efficiency = compute_inverter_efficiency(dc, ac)
        if efficiency is not None:
            efficiency_history.append(
                InverterEfficiencyPoint(
                    timestamp=_as_utc(row.timestamp) or row.timestamp,
                    efficiency_percent=round(float(efficiency), 2),
                )
            )

    latest = rows[-1] if rows else None
    dc_latest = None
    ac_latest = None
    efficiency_latest = None
    if latest is not None:
        dc_latest = latest.inverter_dc_input_power
        if dc_latest is None:
            dc_latest = latest.dc_power
        ac_latest = latest.inverter_ac_output_power
        if ac_latest is None:
            ac_latest = latest.ac_power
        efficiency_latest = latest.inverter_efficiency
        if efficiency_latest is None:
            efficiency_latest = compute_inverter_efficiency(dc_latest, ac_latest)

    data_available = (
        latest is not None
        and dc_latest is not None
        and ac_latest is not None
        and efficiency_latest is not None
    )

    warnings = list(
        (
            await session.scalars(
                select(PVFault).where(
                    PVFault.device_id == target,
                    PVFault.status == "ACTIVE",
                    PVFault.fault_type.in_(
                        [FAULT_INVERTER_DEGRADATION, FAULT_INVERTER_OVERHEAT]
                    ),
                )
            )
        ).all()
    )

    average_efficiency = (
        sum(point.efficiency_percent for point in efficiency_history)
        / len(efficiency_history)
        if efficiency_history
        else None
    )
    degraded = bool(warnings) or (
        average_efficiency is not None
        and average_efficiency < settings.pv_inverter_min_efficiency_pct
    )

    recommendations: list[str] = []
    if warnings:
        recommendations.extend(
            sorted({w.recommended_action for w in warnings if w.recommended_action})
        )
    if not data_available:
        recommendations.append(
            "Télémétrie onduleur indisponible : vérifier la liaison de communication "
            "ou le protocole de l'onduleur avant toute conclusion sur son rendement."
        )
    elif degraded:
        recommendations.append(
            "Planifier une maintenance préventive : contrôle thermique, serrage des "
            "connexions DC/AC et mise à jour du firmware onduleur."
        )
    else:
        recommendations.append(
            "Rendement dans la plage attendue : poursuivre la surveillance périodique."
        )
    if not recommendations:
        recommendations.append("Poursuivre la surveillance périodique de l'onduleur.")

    availability_message = (
        "Télémétrie onduleur disponible."
        if data_available
        else "Télémétrie onduleur indisponible — aucune valeur n'est inventée."
    )

    return InverterStatusResponse(
        device_id=target,
        data_available=data_available,
        operating_status=latest.inverter_status if latest else None,
        efficiency_percent=(
            round(float(efficiency_latest), 2)
            if efficiency_latest is not None
            else None
        ),
        temperature_c=(
            float(latest.inverter_temperature)
            if latest is not None and latest.inverter_temperature is not None
            else None
        ),
        dc_input_power_w=(
            round(float(dc_latest), 1)
            if dc_latest is not None
            else None
        ),
        ac_output_power_w=(
            round(float(ac_latest), 1)
            if ac_latest is not None
            else None
        ),
        average_efficiency_percent=(
            round(average_efficiency, 2) if average_efficiency is not None else None
        ),
        degraded=degraded,
        efficiency_history=efficiency_history,
        warnings=[PvFaultRead.model_validate(fault) for fault in warnings],
        recommendations=recommendations,
        last_update=_as_utc(latest.timestamp) if latest else None,
        data_availability_message=availability_message,
    )


# ---------------------------------------------------------------------------
# Feature 4 — energy source optimization
# ---------------------------------------------------------------------------
def _hourly_profile(
    points: Iterable[tuple[datetime, float | None]],
) -> list[float]:
    """Build a 24-slot hourly energy profile expressed in **kWh per hour**.

    Each slot is the mean power observed during that hour-of-day, converted
    from watts to kWh for a one-hour slot (``P_W / 1000``). The optimizer
    expects energy per hour, not instantaneous power.
    """
    buckets: dict[int, list[float]] = defaultdict(list)
    for ts, value in points:
        ts = _as_utc(ts)
        if ts is None or value is None:
            continue
        buckets[ts.hour].append(float(value))
    return [
        (sum(buckets[hour]) / len(buckets[hour]) / 1000.0)
        if buckets.get(hour)
        else 0.0
        for hour in range(24)
    ]


@router.get("/optimization", response_model=SolarOptimizationResponse)
async def get_solar_optimization(
    device_id: str | None = Query(default=None, max_length=50),
    consumption_device_id: str = Query(default="SALLE1", max_length=50),
    battery_soc_percent: float | None = Query(default=None, ge=0, le=100),
    consumption_kwh: float | None = Query(default=None, ge=0),
    solar_kwh: float | None = Query(default=None, ge=0),
    hours: int = Query(default=24, ge=1, le=48),
    session: AsyncSession = Depends(get_session),
) -> SolarOptimizationResponse:
    """Recommend how to use solar, battery and grid energy.

    When ``solar_kwh`` or ``consumption_kwh`` are omitted, energy is integrated
    from the last ``hours`` of *measured* PV and building telemetry. If no
    telemetry exists the endpoint returns ``optimization_status = no_data``
    instead of fabricating consumption or production.

    The battery has no BMS integration yet, so its SoC is simulated
    (``battery_simulated = true``) and clearly labelled by the frontend.
    """
    settings = get_settings()
    target = device_id or settings.pv_device_id
    now = datetime.now(timezone.utc)
    start = now - timedelta(hours=hours)

    pv_rows = list(
        (
            await session.scalars(
                select(PVReading)
                .where(PVReading.device_id == target, PVReading.timestamp >= start)
                .order_by(PVReading.timestamp.asc())
            )
        ).all()
    )
    building_rows = list(
        (
            await session.scalars(
                select(Reading)
                .where(
                    Reading.device_id == consumption_device_id,
                    Reading.timestamp >= start,
                )
                .order_by(Reading.timestamp.asc())
            )
        ).all()
    )

    measured_solar_kwh = _integrate_kwh(
        (row.timestamp, _actual_power(row)) for row in pv_rows
    )
    measured_consumption_kwh = _integrate_kwh(
        (row.timestamp, row.power) for row in building_rows
    )

    solar_energy = solar_kwh if solar_kwh is not None else measured_solar_kwh
    consumption_energy = (
        consumption_kwh if consumption_kwh is not None else measured_consumption_kwh
    )

    soc = (
        battery_soc_percent
        if battery_soc_percent is not None
        else settings.battery_default_soc_percent
    )

    # Persistence forecast from the observed hourly profiles (documented in
    # the response assumptions). This is explicitly not a physical forecast.
    solar_profile = _hourly_profile((row.timestamp, _actual_power(row)) for row in pv_rows)
    consumption_profile = _hourly_profile(
        (row.timestamp, row.power) for row in building_rows
    )
    forecast_available = bool(pv_rows) and bool(building_rows)

    inputs = OptimizationInputs(
        solar_kwh=max(0.0, solar_energy),
        consumption_kwh=max(0.0, consumption_energy),
        battery_capacity_kwh=settings.battery_capacity_kwh,
        battery_soc_percent=min(
            settings.battery_max_soc_percent,
            max(settings.battery_min_soc_percent, soc),
        ),
        battery_min_soc_percent=settings.battery_min_soc_percent,
        battery_max_soc_percent=settings.battery_max_soc_percent,
        battery_charge_limit_kw=settings.battery_charge_limit_kw,
        battery_discharge_limit_kw=settings.battery_discharge_limit_kw,
        battery_round_trip_efficiency=settings.battery_round_trip_efficiency,
        grid_tariff_dzd_per_kwh=settings.grid_tariff_dzd_per_kwh,
        grid_export_enabled=settings.grid_export_enabled,
        grid_export_tariff_dzd_per_kwh=settings.grid_export_tariff_dzd_per_kwh,
        allow_grid_charging=settings.battery_allow_grid_charging,
        horizon_hours=float(hours),
        solar_forecast_kwh=solar_profile if forecast_available else None,
        consumption_forecast_kwh=consumption_profile if forecast_available else None,
    )

    try:
        result = optimize(inputs)
    except ValueError as exc:  # pragma: no cover - defensive: inputs are clamped
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    if forecast_available:
        result["assumptions"] = list(result.get("assumptions", [])) + [
            "Prévisions horaires par persistance du profil mesuré sur la fenêtre "
            "demandée — ce n'est pas un modèle prédictif physique.",
        ]

    return SolarOptimizationResponse(
        **result,
        battery_simulated=True,
        tariff_dzd_per_kwh=settings.grid_tariff_dzd_per_kwh,
    )
