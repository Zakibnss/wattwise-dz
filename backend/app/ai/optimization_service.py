"""Explainable energy optimization recommendations.

This module turns existing platform data (alerts, equipment power, recent
readings) into structured, auditable recommendations. It never invents
measurements: every recommendation references the data it used and is
classified as MEASURED / ESTIMATED / PREDICTED / SIMULATED / UNAVAILABLE.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Alert, Equipment, Reading, Zone

logger = logging.getLogger(__name__)

AC_RUNNING_THRESHOLD_KW = 0.15


async def generate_recommendations(session: AsyncSession) -> list[dict[str, Any]]:
    """Build a list of optimization recommendations from current data."""
    recs: list[dict[str, Any]] = []
    now = datetime.now(timezone.utc)

    # Zones + equipment
    zones = list((await session.scalars(select(Zone))).all())
    equipment_rows = list((await session.scalars(select(Equipment))).all())
    eq_by_zone: dict[int, list[Equipment]] = {}
    for eq in equipment_rows:
        eq_by_zone.setdefault(eq.zone_id, []).append(eq)

    # Latest reading per device
    device_ids = [z.device_id for z in zones if z.device_id]
    latest_by_device: dict[str, Reading] = {}
    if device_ids:
        rows = (await session.scalars(
            select(Reading)
            .where(Reading.device_id.in_(device_ids))
            .order_by(Reading.device_id, Reading.timestamp.desc(), Reading.id.desc())
        )).all()
        for r in rows:
            latest_by_device.setdefault(r.device_id, r)

    # Rule 1: AC running while unoccupied
    for zone in zones:
        reading = latest_by_device.get(zone.device_id) if zone.device_id else None
        if reading is None or reading.occupancy != 0:
            continue
        for eq in eq_by_zone.get(zone.id, []):
            if eq.type != "AC" or eq.status == "offline":
                continue
            if (eq.current_power_kw or 0.0) < AC_RUNNING_THRESHOLD_KW:
                continue
            recs.append({
                "id": f"rec-ac-{zone.id}-{eq.id}",
                "title": "Éteindre la climatisation inutile",
                "description": (
                    f"{eq.name} dans « {zone.name} » consomme "
                    f"{eq.current_power_kw:.1f} kW alors que la salle est inoccupée."
                ),
                "building": None,
                "zone_id": zone.id,
                "zone_name": zone.name,
                "equipment_id": eq.id,
                "equipment_name": eq.name,
                "problem": "Consommation inutile (MEASURED)",
                "recommended_action": f"Éteindre ou régler {eq.name}.",
                "expected_energy_impact_kwh": round(
                    (eq.current_power_kw or 0.0) * 8.0, 3
                ),
                "estimated_financial_impact_dzd": None,
                "priority": "high",
                "confidence": 90,
                "data_classification": "MEASURED",
                "methodology": "Règle déterministe: occupancy=0 ET puissance AC >= 0.15 kW.",
                "assumptions": ["8 h/jour d'inoccupation supposée."],
                "limitations": ["Occupancy basée sur PIR, pas de preuve d'absence continue."],
                "status": "pending",
                "created_at": now.isoformat(),
            })

    # Rule 2: open unresolved alerts -> recommendation
    unresolved = (await session.scalars(
        select(Alert).where(Alert.resolved.is_(False))
    )).all()
    for alert in unresolved:
        recs.append({
            "id": f"rec-alert-{alert.id}",
            "title": f"Traiter l'alerte {alert.type}",
            "description": alert.message or "Anomalie détectée.",
            "building": None,
            "zone_id": None,
            "zone_name": None,
            "equipment_id": alert.equipment_id,
            "equipment_name": None,
            "problem": f"Alerte active (MEASURED)",
            "recommended_action": "Analyser et corriger l'anomalie dans le Centre d'Actions.",
            "expected_energy_impact_kwh": None,
            "estimated_financial_impact_dzd": None,
            "priority": "critical" if alert.severity == "CRITICAL" else "medium",
            "confidence": None,
            "data_classification": "MEASURED",
            "methodology": "Alerte non résolue issue du détecteur.",
            "assumptions": [],
            "limitations": ["Impact énergétique non calculé."],
            "status": "pending",
            "created_at": now.isoformat(),
        })

    return recs