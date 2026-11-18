"""System configuration and operational mode endpoints (Demand Response / Mode Éco)."""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.models import Alert, SystemSetting

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/system", tags=["system"])

ECO_MODE_KEY = "eco_mode"


class EcoModeRequest(BaseModel):
    enabled: bool | None = None


async def get_eco_mode_status(session: AsyncSession) -> bool:
    """Read the current Eco Mode state from the database."""
    stmt = select(SystemSetting).where(SystemSetting.key == ECO_MODE_KEY)
    setting = (await session.scalars(stmt)).first()
    if setting is None:
        return False
    return setting.value.lower() in ("true", "1", "yes")


async def set_eco_mode_status(session: AsyncSession, enabled: bool) -> bool:
    """Save the Eco Mode state in the database."""
    stmt = select(SystemSetting).where(SystemSetting.key == ECO_MODE_KEY)
    setting = (await session.scalars(stmt)).first()
    if setting is None:
        setting = SystemSetting(key=ECO_MODE_KEY, value=str(enabled).lower())
        session.add(setting)
    else:
        setting.value = str(enabled).lower()

    await session.commit()
    return enabled


@router.get("/eco-mode")
async def get_eco_mode(
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    """Get the current Eco Mode (Demand Response) state."""
    enabled = await get_eco_mode_status(session)
    return {
        "eco_mode": enabled,
        "status": "active" if enabled else "inactive",
        "peak_hours": "18h - 20h",
    }


@router.post("/eco-mode")
async def toggle_eco_mode(
    payload: EcoModeRequest | None = None,
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    """Toggle or set the system Eco Mode state.

    If Eco Mode is switched ON, high-consumption alerts are upgraded to CRITICAL
    severity, and a Peak Demand alert is registered for the building.
    """
    current_status = await get_eco_mode_status(session)
    new_status = not current_status if (payload is None or payload.enabled is None) else payload.enabled

    await set_eco_mode_status(session, new_status)

    if new_status:
        # 1. Upgrade any active high-power or overconsumption alerts to CRITICAL
        high_power_types = ["HIGH_POWER_NO_OCCUPANCY", "OVERCONSUMPTION_VS_FORECAST", "PEAK_ALERT"]
        stmt = (
            select(Alert)
            .where(Alert.resolved.is_(False), Alert.type.in_(high_power_types))
        )
        active_alerts = list((await session.scalars(stmt)).all())
        for alert in active_alerts:
            alert.severity = "CRITICAL"

        # 2. Emit a Peak Alert for the dashboard
        peak_alert = Alert(
            device_id="SALLE1",
            timestamp=datetime.now(timezone.utc),
            type="PEAK_ALERT",
            severity="CRITICAL",
            message="Alerte Pic de Consommation : Mode Éco activé, réduction immédiate requise",
            cause="Mode Éco enclenché (période de pointe ou contrainte réseau)",
            confidence=1.0,
            resolved=False,
        )
        session.add(peak_alert)
        await session.commit()
        logger.info("Mode Éco activé — alertes critiques et Peak Alert générées.")
    else:
        logger.info("Mode Éco désactivé.")

    return {
        "eco_mode": new_status,
        "message": "Mode Éco activé" if new_status else "Mode Éco désactivé",
        "peak_hours": "18h - 20h",
    }


VACATION_MODE_KEY = "vacation_mode"


class VacationModeRequest(BaseModel):
    enabled: bool | None = None


async def get_vacation_mode_status(session: AsyncSession) -> bool:
    """Read the current Vacation Mode state from the database."""
    stmt = select(SystemSetting.value).where(SystemSetting.key == VACATION_MODE_KEY)
    setting = (await session.scalars(stmt)).first()
    if setting is None:
        return False
    return str(setting).lower() in ("true", "1", "yes")


async def set_vacation_mode_status(session: AsyncSession, enabled: bool) -> bool:
    """Save the Vacation Mode state in the database."""
    stmt = select(SystemSetting).where(SystemSetting.key == VACATION_MODE_KEY)
    setting = (await session.scalars(stmt)).first()
    if setting is None:
        setting = SystemSetting(key=VACATION_MODE_KEY, value=str(enabled).lower())
        session.add(setting)
    else:
        setting.value = str(enabled).lower()
    await session.commit()
    return enabled


@router.get("/vacation-mode", response_model=dict[str, Any])
async def get_vacation_mode(
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    """Get the current Vacation Mode state."""
    enabled = await get_vacation_mode_status(session)
    return {
        "vacation_mode": enabled,
        "message": "Mode Vacances actif" if enabled else "Mode Vacances inactif",
    }


@router.post("/vacation-mode", response_model=dict[str, Any])
async def toggle_vacation_mode(
    payload: VacationModeRequest | None = None,
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    """Toggle or set the system Vacation Mode state.

    When ON, the autonomous agent will cut heating and non-essential devices.
    If occupancy returns for more than 2 hours, an intrusion alert is raised.
    """
    current_status = await get_vacation_mode_status(session)
    new_status = not current_status if (payload is None or payload.enabled is None) else payload.enabled

    await set_vacation_mode_status(session, new_status)

    if new_status:
        logger.info("Mode Vacances activé — surveillance intrusion activée.")
        return {
            "vacation_mode": True,
            "message": "Mode Vacances activé : chauffage coupé, appareils non-essentiels éteints.",
        }
    logger.info("Mode Vacances désactivé.")
    return {
        "vacation_mode": False,
        "message": "Mode Vacances désactivé : fonctionnement normal rétabli.",
    }
