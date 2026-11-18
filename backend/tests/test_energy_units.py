"""Energy unit and aggregation consistency tests."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from httpx import AsyncClient

from app.database import SessionLocal
from app.models import Reading


async def _insert_energy_readings() -> None:
    now = datetime.now(timezone.utc)
    async with SessionLocal() as session:
        readings = [
            Reading(
                device_id="UNITTEST",
                timestamp=now - timedelta(hours=1),
                power=1000.0,  # W
                energy_kwh=1.0,
            ),
            Reading(
                device_id="UNITTEST",
                timestamp=now - timedelta(minutes=30),
                power=2000.0,  # W
                energy_kwh=3.0,
            ),
        ]
        session.add_all(readings)
        await session.commit()


async def test_stats_summary_energy_is_meter_delta(client: AsyncClient) -> None:
    await _insert_energy_readings()

    response = await client.get(
        "/api/stats/summary", params={"device_id": "UNITTEST", "hours": 2}
    )
    assert response.status_code == 200
    body = response.json()
    # energy_kwh = max - min = 3.0 - 1.0 = 2.0 kWh (meter delta, not summed power)
    assert body["total_energy_kwh"] == 2.0
    # avg_power in W
    assert body["avg_power_w"] == 1500.0
    assert body["max_power_w"] == 2000.0


async def test_stats_summary_power_is_watts_not_kw(client: AsyncClient) -> None:
    await _insert_energy_readings()
    response = await client.get(
        "/api/stats/summary", params={"device_id": "UNITTEST", "hours": 2}
    )
    body = response.json()
    # Values must be in W (>= 1000), not kW (1.0/2.0)
    assert body["avg_power_w"] >= 1000
    assert body["max_power_w"] >= 1000