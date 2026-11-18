"""WATTWISE DZ — advanced photovoltaic simulator.

Generates physically consistent PV telemetry (irradiance → DC → AC, module
temperature, inverter efficiency) and stores it in ``pv_readings`` with
``data_source = "simulator"``.

The simulator never writes to the MQTT topic by default: it satisfies the
optional ``wattwise/+/solar`` ingestion path indirectly, but every generated
row is explicitly labelled as simulated.

Examples
--------
Normal day, 15-minute samples::

    docker compose exec backend python -m scripts.simulate_advanced_solar \
        --duration-hours 24 --interval-minutes 15 --mode normal

Inject sustained soiling losses::

    docker compose exec backend python -m scripts.simulate_advanced_solar --mode dust

Degraded inverter (efficiency < 90 % for 3+ consecutive readings)::

    docker compose exec backend python -m scripts.simulate_advanced_solar \
        --mode inverter_degradation --duration-hours 8
"""

from __future__ import annotations

import argparse
import asyncio
import math
import random
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import select

from app.ai.pv_detector import calculate_expected_power, detect_and_persist
from app.config import get_settings
from app.database import SessionLocal, init_db
from app.models import PVFault, PVReading

SCENARIOS = (
    "normal",
    "partial_shading",
    "dust",
    "overheat",
    "inverter_degradation",
)

#: Fraction of expected DC power actually delivered, per scenario.
SCENARIO_FACTORS = {
    "normal": 1.0,
    "partial_shading": 0.62,
    "dust": 0.72,
    "overheat": 0.97,
    "inverter_degradation": 1.0,
}

#: Extra module temperature (°C) injected by scenario.
SCENARIO_TEMP_EXTRA = {
    "normal": 0.0,
    "partial_shading": 0.0,
    "dust": 3.0,
    "overheat": 32.0,
    "inverter_degradation": 2.0,
}

#: Scenario-dependent inverter efficiency (fraction).
SCENARIO_INVERTER_EFFICIENCY = {
    "normal": 0.965,
    "partial_shading": 0.960,
    "dust": 0.958,
    "overheat": 0.955,
    "inverter_degradation": 0.845,
}

#: Extra inverter temperature (°C) injected by scenario.
SCENARIO_INVERTER_TEMP_EXTRA = {
    "normal": 0.0,
    "partial_shading": 0.0,
    "dust": 3.0,
    "overheat": 6.0,
    "inverter_degradation": 14.0,
}


def clear_sky_irradiance(moment: datetime, rng: random.Random) -> float:
    """Return a plausible plane-of-array irradiance in W/m².

    * zero outside 06:00-18:00,
    * bell curve peaking at solar noon,
    * small, slowly varying cloud modulation (no unrelated noise).
    """
    hour = moment.hour + moment.minute / 60.0 + moment.second / 3600.0
    if hour < 6.0 or hour > 18.0:
        return 0.0
    base = 1000.0 * math.sin((hour - 6.0) / 12.0 * math.pi)
    cloud = 0.94 + 0.05 * math.sin(hour * 1.7) + rng.uniform(-0.015, 0.015)
    return max(0.0, base * cloud)


def ambient_temperature(moment: datetime) -> float:
    """Diurnal ambient temperature: minimum near 05:00, peak near 15:00."""
    hour = moment.hour + moment.minute / 60.0
    return 19.0 + 9.0 * math.sin((hour - 9.0) / 24.0 * 2.0 * math.pi)


def build_sample(
    moment: datetime,
    *,
    scenario: str,
    rng: random.Random,
    panel_area: float,
    panel_efficiency: float,
    noct_c: float,
    temp_coefficient_per_c: float,
    stc_temperature_c: float,
) -> dict[str, Any]:
    """Build one physically consistent PV sample for the given scenario."""
    factor = SCENARIO_FACTORS[scenario]
    irradiance = clear_sky_irradiance(moment, rng)
    ambient = ambient_temperature(moment)

    # Local shading only affects production in the afternoon window.
    if scenario == "partial_shading":
        hour = moment.hour + moment.minute / 60.0
        if not (12.5 <= hour <= 17.0):
            factor = 1.0

    panel_temperature = (
        ambient
        + (noct_c - 20.0) / 800.0 * irradiance
        + SCENARIO_TEMP_EXTRA[scenario]
    )

    expected_power = calculate_expected_power(
        irradiance,
        panel_area,
        panel_efficiency,
        panel_temperature_c=panel_temperature,
        temp_coefficient_per_c=temp_coefficient_per_c,
        stc_temperature_c=stc_temperature_c,
    ) or 0.0

    dc_power = max(0.0, expected_power * factor * rng.uniform(0.985, 1.015))

    # String voltage rises quickly with irradiance then saturates; current is
    # derived from power, keeping P = U × I consistent.
    if irradiance > 5:
        dc_voltage = max(
            120.0,
            380.0 - 60.0 * math.exp(-irradiance / 180.0) + rng.uniform(-2.0, 2.0),
        )
        dc_current = dc_power / dc_voltage if dc_voltage > 0 else 0.0
        inverter_efficiency = SCENARIO_INVERTER_EFFICIENCY[scenario] * rng.uniform(
            0.995, 1.005
        )
        inverter_efficiency = max(0.0, min(1.0, inverter_efficiency))
        ac_power = dc_power * inverter_efficiency
        inverter_temperature = (
            28.0
            + 0.005 * dc_power
            + SCENARIO_INVERTER_TEMP_EXTRA[scenario]
            + rng.uniform(-0.4, 0.4)
        )
        inverter_status = (
            "RUNNING" if scenario != "inverter_degradation" else "DERATED"
        )
    else:
        dc_voltage = 0.0
        dc_current = 0.0
        inverter_efficiency = None
        ac_power = 0.0
        inverter_temperature = ambient + rng.uniform(-0.5, 0.5)
        inverter_status = "STANDBY"

    return {
        "timestamp": moment,
        "dc_voltage": round(dc_voltage, 2),
        "dc_current": round(dc_current, 2),
        "dc_power": round(dc_power, 1),
        "ac_power": round(ac_power, 1),
        "irradiance": round(irradiance, 1),
        "panel_temperature": round(panel_temperature, 1),
        "ambient_temperature": round(ambient, 1),
        "expected_power": round(expected_power, 1),
        "actual_power": round(ac_power, 1),
        "panel_area": panel_area,
        "panel_efficiency": panel_efficiency,
        "inverter_efficiency": (
            round(inverter_efficiency * 100.0, 2)
            if inverter_efficiency is not None
            else None
        ),
        "inverter_temperature": round(inverter_temperature, 1),
        "inverter_status": inverter_status,
        "inverter_dc_input_power": round(dc_power, 1),
        "inverter_ac_output_power": round(ac_power, 1),
        "data_source": "simulator",
    }


def generate_series(
    *,
    start: datetime,
    duration_hours: float,
    interval_minutes: float,
    scenario: str,
    seed: int | None = None,
    device_id: str = "PV1",
) -> list[PVReading]:
    """Generate a reproducible series of :class:`PVReading` rows."""
    settings = get_settings()
    rng = random.Random(seed)
    interval = timedelta(minutes=interval_minutes)
    if interval.total_seconds() <= 0:
        raise ValueError("interval_minutes must be positive")

    samples: list[PVReading] = []
    moment = start
    end = start + timedelta(hours=duration_hours)
    while moment <= end:
        payload = build_sample(
            moment,
            scenario=scenario,
            rng=rng,
            panel_area=settings.pv_panel_area_m2,
            panel_efficiency=settings.pv_panel_efficiency,
            noct_c=settings.pv_noct_c,
            temp_coefficient_per_c=settings.pv_temp_coefficient_per_c,
            stc_temperature_c=settings.pv_stc_temperature_c,
        )
        samples.append(PVReading(device_id=device_id, **payload))
        moment += interval
    return samples


async def run_simulation(
    *,
    duration_hours: float,
    interval_minutes: float,
    scenario: str,
    start: datetime | None = None,
    seed: int | None = None,
    device_id: str = "PV1",
    dry_run: bool = False,
    run_diagnostics: bool = True,
) -> tuple[int, list[dict[str, Any]]]:
    """Generate and persist a simulated PV series.

    Returns:
        ``(inserted_count, diagnostics)`` where diagnostics is empty when
        diagnostics were skipped or no fault was detected.
    """
    settings = get_settings()
    end = datetime.now(timezone.utc)
    begin = start or (end - timedelta(hours=duration_hours))
    rows = generate_series(
        start=begin,
        duration_hours=duration_hours,
        interval_minutes=interval_minutes,
        scenario=scenario,
        seed=seed,
        device_id=device_id,
    )

    if dry_run:
        sample = rows[len(rows) // 2] if rows else None
        preview = (
            {
                "timestamp": sample.timestamp.isoformat() if sample else None,
                "irradiance": sample.irradiance if sample else None,
                "expected_power": sample.expected_power if sample else None,
                "actual_power": sample.actual_power if sample else None,
                "panel_temperature": sample.panel_temperature if sample else None,
                "inverter_efficiency": sample.inverter_efficiency if sample else None,
            }
            if sample
            else {}
        )
        return 0, [preview]

    await init_db()
    async with SessionLocal() as session:
        session.add_all(rows)
        await session.commit()

        diagnostics: list[dict[str, Any]] = []
        if run_diagnostics:
            recent = list(
                (
                    await session.scalars(
                        select(PVReading)
                        .where(PVReading.device_id == device_id)
                        .order_by(PVReading.timestamp.desc())
                        .limit(max(50, settings.pv_consecutive_readings * 20))
                    )
                ).all()
            )
            recent.reverse()
            await detect_and_persist(session, recent, device_id)
            diagnostics = [
                {
                    "fault_type": fault.fault_type,
                    "severity": fault.severity,
                    "message": fault.message,
                    "occurrences": fault.occurrences,
                }
                for fault in (
                    await session.scalars(
                        select(PVFault).where(
                            PVFault.device_id == device_id,
                            PVFault.status == "ACTIVE",
                        )
                    )
                ).all()
            ]

    return len(rows), diagnostics


async def main() -> None:
    """Command-line entry point."""
    parser = argparse.ArgumentParser(
        description="WATTWISE DZ advanced solar simulator"
    )
    parser.add_argument("--duration-hours", type=float, default=24.0)
    parser.add_argument("--interval-minutes", type=float, default=15.0)
    parser.add_argument("--mode", choices=SCENARIOS, default="normal")
    parser.add_argument("--device-id", default=get_settings().pv_device_id)
    parser.add_argument(
        "--start",
        type=str,
        default=None,
        help="ISO-8601 start timestamp (default: now − duration)",
    )
    parser.add_argument("--seed", type=int, default=42, help="Reproducible seed")
    parser.add_argument("--dry-run", action="store_true", help="Print one sample only")
    parser.add_argument(
        "--skip-diagnostics",
        action="store_true",
        help="Do not run the fault detector after insertion",
    )
    args = parser.parse_args()

    start = None
    if args.start:
        start = datetime.fromisoformat(args.start)
        if start.tzinfo is None:
            start = start.replace(tzinfo=timezone.utc)

    inserted, diagnostics = await run_simulation(
        duration_hours=args.duration_hours,
        interval_minutes=args.interval_minutes,
        scenario=args.mode,
        start=start,
        seed=args.seed,
        device_id=args.device_id,
        dry_run=args.dry_run,
        run_diagnostics=not args.skip_diagnostics,
    )

    if args.dry_run:
        print("Dry run sample:", diagnostics[0] if diagnostics else {})
        return

    print(
        f"Inserted {inserted} simulated PV readings "
        f"(mode={args.mode}, device={args.device_id}, source=simulator)."
    )
    if diagnostics:
        print(f"Active diagnostics ({len(diagnostics)}):")
        for item in diagnostics:
            print(
                f"  - [{item['severity']}] {item['fault_type']} "
                f"(x{item['occurrences']}): {item['message']}"
            )
    else:
        print("No active photovoltaic fault detected.")


if __name__ == "__main__":
    asyncio.run(main())
