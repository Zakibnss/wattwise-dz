from __future__ import annotations

from httpx import AsyncClient

from app.database import SessionLocal
from app.models import Alert, Building, Equipment, Floor, Zone


async def _seed() -> None:
    async with SessionLocal() as session:
        building = Building(name="B1")
        session.add(building)
        await session.flush()
        floor = Floor(building_id=building.id, name="RDC", level=0)
        session.add(floor)
        await session.flush()
        zone = Zone(floor_id=floor.id, name="Z1", device_id="SALLE1", plan_x=0, plan_y=0, plan_w=1, plan_h=1)
        session.add(zone)
        await session.flush()
        eq = Equipment(zone_id=zone.id, name="AC1", type="AC", nominal_power_kw=2.5, current_power_kw=1.0, status="online", health_score=90, icon="AirVent")
        session.add(eq)
        from datetime import datetime, timezone
        alert = Alert(device_id="SALLE1", timestamp=datetime.now(timezone.utc), type="HIGH_POWER_NO_OCCUPANCY", severity="HIGH", message="test", resolved=False)
        session.add(alert)
        await session.commit()


async def test_optimization_recommendations_endpoint(client: AsyncClient) -> None:
    await _seed()
    response = await client.get("/api/optimization/recommendations")
    assert response.status_code == 200
    body = response.json()
    assert "recommendations" in body
    assert len(body["recommendations"]) >= 1