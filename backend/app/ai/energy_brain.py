"""Energy Brain — global rule-based recommendations for the whole building.

Three deterministic rules feed the Dashboard "Briefing Intelligent":

1. ``USELESS_AC``      — zone unoccupied while an AC still runs.
2. ``SOLAR_SURPLUS``   — solar production exceeds consumption (self-consumption win).
3. ``CONSUMPTION_PEAK`` — current consumption above 80% of the 24h maximum.

Every insight is explicit about the data it used; nothing is invented.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    Equipment,
    PVReading,
    Reading,
    Zone,
)

logger = logging.getLogger(__name__)

AC_RUNNING_THRESHOLD_KW = 0.15
CONSUMPTION_PEAK_RATIO = 0.80


async def _latest_reading_per_device(
    session: AsyncSession, device_ids: list[str]
) -> dict[str, Reading]:
    """Latest reading for each device id (single query)."""
    if not device_ids:
        return {}
    stmt = (
        select(Reading)
        .where(Reading.device_id.in_(device_ids))
        .order_by(Reading.device_id, Reading.timestamp.desc(), Reading.id.desc())
    )
    rows = (await session.scalars(stmt)).all()
    latest: dict[str, Reading] = {}
    for row in rows:
        latest.setdefault(row.device_id, row)
    return latest


async def generate_insights(session: AsyncSession) -> dict[str, Any]:
    """Evaluate the three Energy Brain rules.

    Args:
        session: Injected async database session.

    Returns:
        Dict with ``insights`` (list of Insight-compatible dicts), a French
        ``briefing`` sentence for the most critical insight, and counts.
    """
    insights: list[dict[str, Any]] = []

    # --- Load zones + equipment once -------------------------------------
    zones = list((await session.scalars(select(Zone))).all())
    equipment_rows = list((await session.scalars(select(Equipment))).all())
    equipment_by_zone: dict[int, list[Equipment]] = {}
    for eq in equipment_rows:
        equipment_by_zone.setdefault(eq.zone_id, []).append(eq)

    device_ids = [z.device_id for z in zones if z.device_id]
    latest_by_device = await _latest_reading_per_device(session, device_ids)

    # --- Rule 1: occupancy = 0 AND AC running -----------------------------
    for zone in zones:
        reading = latest_by_device.get(zone.device_id) if zone.device_id else None
        if reading is None or reading.occupancy != 0:
            continue
        for eq in equipment_by_zone.get(zone.id, []):
            if eq.type != "AC" or eq.status == "offline":
                continue
            if (eq.current_power_kw or 0.0) < AC_RUNNING_THRESHOLD_KW:
                continue
            insights.append(
                {
                    "rule_id": "USELESS_AC",
                    "title": "Climatisation inutile",
                    "description": (
                        f"Le {eq.name} de « {zone.name} » fonctionne "
                        f"({eq.current_power_kw:.1f} kW) alors que la salle "
                        "est inoccupée."
                    ),
                    "severity": "warning",
                    "confidence": 90,
                    "category": "confort",
                    "recommended_action": (
                        f"Éteindre ou régler le {eq.name} dans le Centre d'Actions."
                    ),
                    "zone_id": zone.id,
                    "equipment_id": eq.id,
                    "data": {
                        "zone_name": zone.name,
                        "equipment_name": eq.name,
                        "current_power_kw": eq.current_power_kw,
                        "occupancy": 0,
                    },
                }
            )

    # --- Rule 2: solar > consumption --------------------------------------
    pv_latest = (
        await session.scalars(
            select(PVReading)
            .order_by(PVReading.timestamp.desc(), PVReading.id.desc())
            .limit(1)
        )
    ).first()
    total_current_kw = sum(float(eq.current_power_kw or 0.0) for eq in equipment_rows)
    if pv_latest is not None and total_current_kw > 0:
        actual = (
            pv_latest.actual_power
            if pv_latest.actual_power is not None
            else pv_latest.ac_power
        )
        if actual is not None:
            solar_kw = float(actual) / 1000.0
            if solar_kw > total_current_kw:
                insights.append(
                    {
                        "rule_id": "SOLAR_SURPLUS",
                        "title": "Autoconsommation optimale",
                        "description": (
                            f"La production solaire ({solar_kw:.1f} kW) dépasse "
                            f"la consommation du bâtiment ({total_current_kw:.1f} kW) : "
                            "tout l'usage courant est couvert par le solaire."
                        ),
                        "severity": "info",
                        "confidence": 85,
                        "category": "solaire",
                        "recommended_action": (
                            "Profiter du surplus pour charger la batterie (simulée) "
                            "ou lancer les tâches énergivores."
                        ),
                        "data": {
                            "solar_kw": round(solar_kw, 2),
                            "consumption_kw": round(total_current_kw, 2),
                        },
                    }
                )

    # --- Rule 3: consumption > 80% of 24h max ------------------------------
    since = datetime.now(timezone.utc) - timedelta(hours=24)
    max_power = await session.scalar(
        select(func.max(Reading.power)).where(Reading.timestamp >= since)
    )
    latest_salle1 = latest_by_device.get("SALLE1")
    if max_power and latest_salle1 is not None and latest_salle1.power is not None:
        current_w = float(latest_salle1.power)
        max_w = float(max_power)
        if max_w > 0 and current_w > CONSUMPTION_PEAK_RATIO * max_w:
            insights.append(
                {
                    "rule_id": "CONSUMPTION_PEAK",
                    "title": "Pic de consommation",
                    "description": (
                        f"La puissance actuelle ({current_w / 1000:.1f} kW) dépasse "
                        f"{int(CONSUMPTION_PEAK_RATIO * 100)} % du maximum des "
                        f"24 dernières heures ({max_w / 1000:.1f} kW)."
                    ),
                    "severity": "critical",
                    "confidence": 95,
                    "category": "pic",
                    "recommended_action": (
                        "Activer le Mode Éco ou décaler les charges non essentielles."
                    ),
                    "data": {
                        "current_power_w": round(current_w, 1),
                        "max_power_w_24h": round(max_w, 1),
                        "ratio": round(current_w / max_w, 2),
                    },
                }
            )

    # --- Summary / briefing ------------------------------------------------
    severity_order = {"critical": 0, "warning": 1, "info": 2}
    insights.sort(key=lambda item: severity_order.get(item["severity"], 3))
    critical_count = sum(1 for i in insights if i["severity"] == "critical")
    warning_count = sum(1 for i in insights if i["severity"] == "warning")

    if insights:
        top = insights[0]
        briefing = (
            f"{top['title']} — {top['description']} "
            f"Action recommandée : {top['recommended_action']}"
        )
    else:
        briefing = (
            "Aucune anomalie détectée : la consommation est conforme, "
            "les zones occupées sont correctement climatisées et le solaire "
            "est utilisé au mieux."
        )

    return {
        "insights": insights,
        "briefing": briefing,
        "critical_count": critical_count,
        "warning_count": warning_count,
    }
