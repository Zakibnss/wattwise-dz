"""Jury demo mode (V3 Étape 7): inject a controlled anomaly and reset it.

``POST /api/demo/trigger`` sets ``Climatiseur S102`` to an anomalous state
(5.0 kW, health 25, status ``alert``) and creates a DETECTED alert bound to
that equipment, flagged ``is_demo``. ``POST /api/demo/reset`` resolves every
demo alert and restores the equipment. If the building hierarchy has not been
seeded yet, seeding runs automatically so the demo always works.
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.models import Alert, Equipment, Zone
from app.schemas import (
    DemoResetResponse,
    DemoStatusResponse,
    DemoTriggerResponse,
    EquipmentRead,
)

logger = logging.getLogger(__name__)

router = APIRouter(tags=["demo"])

DEMO_EQUIPMENT_NAME = "Climatiseur S102"
DEMO_POWER_KW = 5.0
DEMO_HEALTH = 25
DEMO_NOMINAL_KW = 2.5


async def _find_demo_equipment(session: AsyncSession) -> Equipment:
    """Find the demo equipment, auto-seeding the building when necessary."""
    from scripts.seed_building import BUILDING_NAME, seed

    stmt = select(Equipment).where(Equipment.name == DEMO_EQUIPMENT_NAME)
    equipment = (await session.scalars(stmt)).first()
    if equipment is not None:
        return equipment

    # Auto-seed once if the hierarchy is empty (keeps the jury demo reliable).
    building_count = len(
        list((await session.scalars(select(Zone))).all())
    )
    if building_count == 0:
        logger.info("Hierarchy empty — auto-seeding %s for demo mode", BUILDING_NAME)
        await seed()
        equipment = (await session.scalars(stmt)).first()

    if equipment is None:
        raise HTTPException(
            status_code=404,
            detail=(
                f"Équipement « {DEMO_EQUIPMENT_NAME} » introuvable. "
                "Lancez `python -m scripts.seed_building`."
            ),
        )
    return equipment


@router.post("/demo/trigger", response_model=DemoTriggerResponse)
async def demo_trigger(
    session: AsyncSession = Depends(get_session),
) -> DemoTriggerResponse:
    """Inject the jury-demo anomaly on Climatiseur S102.

    Sets the equipment to 5.0 kW / health 25 / status ``alert`` and creates a
    DETECTED demo alert bound to it.
    """
    equipment = await _find_demo_equipment(session)
    zone = (await session.scalars(
        select(Zone).where(Zone.id == equipment.zone_id)
    )).first()

    equipment.current_power_kw = DEMO_POWER_KW
    equipment.health_score = DEMO_HEALTH
    equipment.status = "alert"

    alert = Alert(
        device_id=(zone.device_id if zone else None) or f"EQ{equipment.id}",
        timestamp=datetime.now(timezone.utc),
        type="EQUIPMENT_MALFUNCTION",
        severity="CRITICAL",
        message=(
            f"[DÉMO] {equipment.name} consomme {DEMO_POWER_KW:.1f} kW "
            f"pour une puissance nominale de {equipment.nominal_power_kw:.1f} kW — "
            "surconsommation critique détectée."
        ),
        cause=json.dumps(
            {
                "reason": "Surconsommation critique injectée en mode démo.",
                "evidence": {
                    "current_power_kw": DEMO_POWER_KW,
                    "nominal_power_kw": float(equipment.nominal_power_kw),
                    "health_score": DEMO_HEALTH,
                },
                "recommended_action": "Analyser avec WATTY puis suivre le workflow d'action.",
                "estimated_savings_kwh_per_day": 24.0 * (DEMO_POWER_KW - DEMO_NOMINAL_KW),
            },
            ensure_ascii=False,
        ),
        confidence=0.98,
        stage="DETECTED",
        is_demo=True,
        equipment_id=equipment.id,
    )
    session.add(alert)
    await session.commit()
    await session.refresh(alert)

    return DemoTriggerResponse(
        message=(
            "Anomalie injectée : Climatiseur S102 en surconsommation. "
            "Une action critique a été créée dans le Centre d'Actions."
        ),
        alert_id=alert.id,
        equipment=EquipmentRead.model_validate(equipment),
    )


@router.post("/demo/reset", response_model=DemoResetResponse)
async def demo_reset(
    session: AsyncSession = Depends(get_session),
) -> DemoResetResponse:
    """Resolve demo alerts and restore the demo equipment to normal."""
    demo_alerts = list(
        (await session.scalars(select(Alert).where(Alert.is_demo.is_(True)))).all()
    )
    for alert in demo_alerts:
        alert.resolved = True

    reset_count = 0
    equipment = (
        await session.scalars(
            select(Equipment).where(Equipment.name == DEMO_EQUIPMENT_NAME)
        )
    ).first()
    if equipment is not None:
        equipment.status = "online"
        equipment.health_score = 95
        equipment.current_power_kw = float(equipment.nominal_power_kw)
        reset_count = 1

    await session.commit()
    return DemoResetResponse(
        message="Mode démo réinitialisé : équipement restauré et alertes de démo résolues.",
        resolved_alerts=len(demo_alerts),
        reset_equipment=reset_count,
    )


@router.get("/demo/status", response_model=DemoStatusResponse)
async def demo_status(
    session: AsyncSession = Depends(get_session),
) -> DemoStatusResponse:
    """Whether a demo alert is currently active, and where."""
    active_demo = list(
        (
            await session.scalars(
                select(Alert).where(
                    Alert.is_demo.is_(True), Alert.resolved.is_(False)
                )
            )
        ).all()
    )
    equipment = (
        await session.scalars(
            select(Equipment).where(Equipment.name == DEMO_EQUIPMENT_NAME)
        )
    ).first()
    return DemoStatusResponse(
        active=len(active_demo) > 0,
        alert_ids=[a.id for a in active_demo],
        equipment_id=equipment.id if equipment else None,
    )
