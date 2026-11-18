"""Reading endpoint tests."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from httpx import AsyncClient

from app.database import SessionLocal
from app.models import Reading


async def _insert_readings() -> list[int]:
    """Insert three readings for SALLE1 and return them oldest first."""
    now = datetime.now(timezone.utc)
    async with SessionLocal() as session:
        readings = [
            Reading(
                device_id="SALLE1",
                timestamp=now - timedelta(minutes=3),
                power=10.0,
                occupancy=0,
            ),
            Reading(
                device_id="SALLE1",
                timestamp=now - timedelta(minutes=2),
                power=20.0,
                occupancy=1,
            ),
            Reading(
                device_id="SALLE1",
                timestamp=now - timedelta(minutes=1),
                power=30.0,
                occupancy=1,
            ),
        ]
        session.add_all(readings)
        await session.commit()
        return [reading.id for reading in readings]


async def test_latest_returns_newest_first_with_limit(client: AsyncClient) -> None:
    """GET /api/readings/latest honours limit and sorts newest first."""
    await _insert_readings()

    response = await client.get(
        "/api/readings/latest", params={"limit": 2, "device_id": "SALLE1"}
    )

    assert response.status_code == 200
    body = response.json()
    assert len(body) == 2
    assert [row["power"] for row in body] == [30.0, 20.0]
    assert body[0]["id"] > body[1]["id"]


async def test_range_rejects_inverted_bounds(client: AsyncClient) -> None:
    """GET /api/readings/range returns 400 when from >= to."""
    now = datetime.now(timezone.utc)

    response = await client.get(
        "/api/readings/range",
        params={
            "from": (now - timedelta(hours=1)).isoformat(),
            "to": (now - timedelta(hours=2)).isoformat(),
        },
    )

    assert response.status_code == 400
    assert "from" in response.json()["detail"]


async def test_range_filters_by_device(client: AsyncClient) -> None:
    """GET /api/readings/range returns paginated readings for one device."""
    await _insert_readings()

    now = datetime.now(timezone.utc)
    response = await client.get(
        "/api/readings/range",
        params={
            "from": (now - timedelta(hours=1)).isoformat(),
            "to": (now + timedelta(hours=1)).isoformat(),
            "device_id": "SALLE1",
            "limit": 10,
        },
    )

    assert response.status_code == 200
    assert len(response.json()) == 3
