"""WATTWISE DZ — Solar production simulator.

Generates realistic photovoltaic generation data following a bell curve peaking at noon.
Can be executed as a script to populate historical solar data or run in a live loop.
"""

from __future__ import annotations

import argparse
import asyncio
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import SessionLocal, init_db
from app.models import SolarProduction
from app.solar import calculate_solar_power_kw


async def seed_solar_history(
    hours: int = 24,
    interval_minutes: int = 15,
    peak_kw: float = 6.5,
) -> int:
    """Generate and store historical solar production records in the database.

    Args:
        hours: Number of past hours to generate.
        interval_minutes: Interval between samples in minutes.
        peak_kw: Peak capacity in kW.

    Returns:
        Count of inserted rows.
    """
    now = datetime.now(timezone.utc)
    start_time = now - timedelta(hours=hours)

    rows: list[SolarProduction] = []
    current = start_time

    while current <= now:
        kw = calculate_solar_power_kw(current, peak_kw=peak_kw)
        rows.append(SolarProduction(timestamp=current, power_kw=kw))
        current += timedelta(minutes=interval_minutes)

    async with SessionLocal() as session:
        session.add_all(rows)
        await session.commit()

    return len(rows)


async def main() -> None:
    parser = argparse.ArgumentParser(description="WATTWISE DZ Solar Production Simulator")
    parser.add_argument("--hours", type=int, default=24, help="Historical hours to generate")
    parser.add_argument("--interval", type=int, default=15, help="Sample interval in minutes")
    parser.add_argument("--peak", type=float, default=6.5, help="Peak capacity in kW")
    args = parser.parse_args()

    print(f"Initializing database and generating {args.hours}h of solar production...")
    await init_db()
    count = await seed_solar_history(
        hours=args.hours,
        interval_minutes=args.interval,
        peak_kw=args.peak,
    )
    current_kw = calculate_solar_power_kw(datetime.now(timezone.utc), peak_kw=args.peak)
    print(f"Successfully generated {count} solar records. Current production: {current_kw} kW")


if __name__ == "__main__":
    asyncio.run(main())
