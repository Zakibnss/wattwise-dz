"""Seed (or repair) the V3 building hierarchy with the ESI-SBA demo building.

Creates: 1 building, 2 floors, 3 zones (Salle 101, Salle 102, Bureau) and
7 pieces of equipment. ``Climatiseur S102`` is intentionally seeded in
``alert`` status to simulate a problem, with a matching DETECTED alert so the
Action Center has content immediately after seeding.

The script is idempotent and also *repairs* a hierarchy seeded by the older,
removed 0005-era migration: it backfills missing columns (device_id, 2D plan
coordinates, building description) and normalises equipment types
(``Lighting`` -> ``Light``).

Usage::

    # Inside the backend container (or with DATABASE_URL set on the host):
    python -m scripts.seed_building
"""

from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime, timezone

from sqlalchemy import select

from app.database import SessionLocal, init_db
from app.models import (
    Alert,
    Building,
    Equipment,
    Floor,
    Zone,
)

logger = logging.getLogger(__name__)

BUILDING_NAME = "ESI-SBA"
DEMO_EQUIPMENT_NAME = "Climatiseur S102"

ZONE_PLAN: dict[str, dict] = {
    "Salle 101": {"device_id": "SALLE1", "plan_x": 0, "plan_y": 0, "plan_w": 2, "plan_h": 1},
    "Salle 102": {"device_id": "SALLE2", "plan_x": 2, "plan_y": 0, "plan_w": 2, "plan_h": 1},
    "Bureau Admin": {"device_id": "BUREAU1", "plan_x": 0, "plan_y": 1, "plan_w": 4, "plan_h": 1},
    "Bureau Direction": {"device_id": "BUREAU1", "plan_x": 0, "plan_y": 1, "plan_w": 4, "plan_h": 1},
}


async def _backfill_legacy(session) -> None:
    """Repair a hierarchy created by the older removed migration."""
    building = (
        await session.scalars(select(Building).where(Building.name == BUILDING_NAME))
    ).first()
    if building is None:
        return

    if not building.city:
        building.city = "Sidi Bel Abbès"
    if not building.country:
        building.country = "Algérie"
    if not building.description:
        building.description = (
            "École Supérieure en Informatique de Sidi Bel Abbès — "
            "campus pilote du projet WATTWISE DZ."
        )

    zones = list((await session.scalars(select(Zone))).all())
    for zone in zones:
        plan = ZONE_PLAN.get(zone.name)
        if plan is None:
            continue
        if not zone.device_id:
            zone.device_id = plan["device_id"]
        zone.plan_x = plan["plan_x"]
        zone.plan_y = plan["plan_y"]
        zone.plan_w = plan["plan_w"]
        zone.plan_h = plan["plan_h"]

    equipment_rows = list((await session.scalars(select(Equipment))).all())
    for eq in equipment_rows:
        if eq.type == "Lighting":
            eq.type = "Light"

    faulty = next(
        (eq for eq in equipment_rows if eq.name == DEMO_EQUIPMENT_NAME), None
    )
    if faulty is not None and faulty.status != "alert":
        faulty.status = "alert"
        faulty.health_score = min(faulty.health_score, 30)

    # Ensure at least one unresolved DETECTED alert for the faulty equipment.
    existing_alert = (
        await session.scalars(
            select(Alert)
            .where(Alert.equipment_id == faulty.id, Alert.resolved.is_(False))
            if faulty is not None
            else select(Alert).where(False)
        )
    ).first()
    if faulty is not None and existing_alert is None:
        zone = (
            await session.scalars(select(Zone).where(Zone.id == faulty.zone_id))
        ).first()
        session.add(
            Alert(
                device_id=(zone.device_id if zone else None) or f"EQ{faulty.id}",
                timestamp=datetime.now(timezone.utc),
                type="EQUIPMENT_MALFUNCTION",
                severity="HIGH",
                message=(
                    f"{faulty.name} : consommation {faulty.current_power_kw:.1f} kW "
                    f"pour une puissance nominale de {faulty.nominal_power_kw:.1f} kW "
                    "— surconsommation anormale détectée."
                ),
                cause=json.dumps(
                    {
                        "reason": "Surconsommation anormale du climatiseur.",
                        "evidence": {
                            "current_power_kw": faulty.current_power_kw,
                            "nominal_power_kw": faulty.nominal_power_kw,
                            "health_score": faulty.health_score,
                        },
                        "recommended_action": (
                            "Enquêter avec WATTY puis planifier une inspection."
                        ),
                        "estimated_savings_kwh_per_day": 24.0
                        * max(0.0, float(faulty.current_power_kw) - float(faulty.nominal_power_kw)),
                    },
                    ensure_ascii=False,
                ),
                confidence=0.92,
                stage="DETECTED",
                equipment_id=faulty.id,
            )
        )

    await session.commit()
    logger.info("Legacy hierarchy backfilled for %s", BUILDING_NAME)


async def seed() -> dict:
    """Seed the ESI-SBA building hierarchy if not present, else repair it.

    Returns:
        A dict with the ids of the created (or found) rows.
    """
    await init_db()
    async with SessionLocal() as session:
        existing = (
            await session.scalars(
                select(Building).where(Building.name == BUILDING_NAME)
            )
        ).first()
        if existing is not None:
            await _backfill_legacy(session)
            return {"building_id": existing.id, "created": False}

        building = Building(
            name=BUILDING_NAME,
            address="Route de Ain El Hadjar",
            city="Sidi Bel Abbès",
            country="Algérie",
            description=(
                "École Supérieure en Informatique de Sidi Bel Abbès — "
                "campus pilote du projet WATTWISE DZ."
            ),
        )
        session.add(building)
        await session.flush()

        floor_rdc = Floor(building_id=building.id, name="Rez-de-chaussée", level=0)
        floor_etage = Floor(building_id=building.id, name="1er Étage", level=1)
        session.add_all([floor_rdc, floor_etage])
        await session.flush()

        zone_s101 = Zone(
            floor_id=floor_rdc.id,
            name="Salle 101",
            device_id="SALLE1",
            plan_x=0,
            plan_y=0,
            plan_w=2,
            plan_h=1,
        )
        zone_s102 = Zone(
            floor_id=floor_rdc.id,
            name="Salle 102",
            device_id="SALLE2",
            plan_x=2,
            plan_y=0,
            plan_w=2,
            plan_h=1,
        )
        zone_bureau = Zone(
            floor_id=floor_etage.id,
            name="Bureau Admin",
            device_id="BUREAU1",
            plan_x=0,
            plan_y=1,
            plan_w=4,
            plan_h=1,
        )
        session.add_all([zone_s101, zone_s102, zone_bureau])
        await session.flush()

        equipment_rows = [
            # Salle 101
            Equipment(
                zone_id=zone_s101.id,
                name="Climatiseur S101",
                type="AC",
                nominal_power_kw=2.5,
                current_power_kw=1.4,
                status="online",
                health_score=92,
                icon="AirVent",
            ),
            Equipment(
                zone_id=zone_s101.id,
                name="Éclairage S101",
                type="Light",
                nominal_power_kw=0.4,
                current_power_kw=0.3,
                status="online",
                health_score=98,
                icon="Lightbulb",
            ),
            Equipment(
                zone_id=zone_s101.id,
                name="Ordinateurs S101",
                type="Computer",
                nominal_power_kw=0.6,
                current_power_kw=0.5,
                status="online",
                health_score=95,
                icon="Monitor",
            ),
            # Salle 102 — the injected problem (Étape 1.3).
            Equipment(
                zone_id=zone_s102.id,
                name=DEMO_EQUIPMENT_NAME,
                type="AC",
                nominal_power_kw=2.5,
                current_power_kw=4.7,
                status="alert",
                health_score=30,
                icon="AirVent",
            ),
            Equipment(
                zone_id=zone_s102.id,
                name="Éclairage S102",
                type="Light",
                nominal_power_kw=0.4,
                current_power_kw=0.2,
                status="online",
                health_score=97,
                icon="Lightbulb",
            ),
            # Bureau
            Equipment(
                zone_id=zone_bureau.id,
                name="Climatiseur Bureau",
                type="AC",
                nominal_power_kw=1.8,
                current_power_kw=0.9,
                status="online",
                health_score=90,
                icon="AirVent",
            ),
            Equipment(
                zone_id=zone_bureau.id,
                name="PC Direction",
                type="Computer",
                nominal_power_kw=0.35,
                current_power_kw=0.28,
                status="online",
                health_score=96,
                icon="Monitor",
            ),
        ]
        session.add_all(equipment_rows)
        await session.flush()

        faulty = next(
            row for row in equipment_rows if row.name == DEMO_EQUIPMENT_NAME
        )
        alert = Alert(
            device_id=zone_s102.device_id or "SALLE102",
            timestamp=datetime.now(timezone.utc),
            type="EQUIPMENT_MALFUNCTION",
            severity="HIGH",
            message=(
                "Climatiseur S102 : consommation 4.7 kW pour une puissance "
                "nominale de 2.5 kW — surconsommation anormale détectée."
            ),
            cause=json.dumps(
                {
                    "reason": "Surconsommation anormale du climatiseur.",
                    "evidence": {
                        "current_power_kw": 4.7,
                        "nominal_power_kw": 2.5,
                        "health_score": 30,
                    },
                    "recommended_action": "Enquêter avec WATTY puis planifier une inspection.",
                    "estimated_savings_kwh_per_day": 33.6,
                },
                ensure_ascii=False,
            ),
            confidence=0.92,
            stage="DETECTED",
            equipment_id=faulty.id,
        )
        session.add(alert)

        await session.commit()
        logger.info(
            "Seeded building id=%s with 2 floors, 3 zones, %d equipment",
            building.id,
            len(equipment_rows),
        )
        return {
            "building_id": building.id,
            "created": True,
            "equipment_count": len(equipment_rows),
        }


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    asyncio.run(seed())
