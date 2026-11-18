"""Building hierarchy endpoints (V3 Étape 1.4)."""

from __future__ import annotations

import logging
import random

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_session
from app.models import Building, Equipment, Floor, Zone
from app.schemas import (
    BuildingRead,
    BuildingTree,
    BuildingsResponse,
    EquipmentRead,
    EquipmentSimulateResponse,
)

logger = logging.getLogger(__name__)

router = APIRouter(tags=["buildings"])


@router.get("/buildings", response_model=BuildingsResponse)
async def list_buildings(
    session: AsyncSession = Depends(get_session),
) -> BuildingsResponse:
    """List every monitored building.

    Args:
        session: Injected async database session.
    """
    result = await session.scalars(select(Building).order_by(Building.id))
    return BuildingsResponse(buildings=list(result))


@router.get("/buildings/{building_id}/tree", response_model=BuildingTree)
async def building_tree(
    building_id: int,
    session: AsyncSession = Depends(get_session),
) -> BuildingTree:
    """Return the full nested hierarchy of one building.

    Args:
        building_id: Primary key of the building.
        session: Injected async database session.

    Raises:
        HTTPException: 404 when the building does not exist.
    """
    stmt = (
        select(Building)
        .where(Building.id == building_id)
        .options(
            selectinload(Building.floors).selectinload(Floor.zones).selectinload(Zone.equipment)
        )
    )
    building = (await session.scalars(stmt)).first()
    if building is None:
        raise HTTPException(status_code=404, detail="Building not found")
    return building


@router.get("/equipment", response_model=list[EquipmentRead])
async def list_equipment(
    zone_id: int | None = None,
    status: str | None = None,
    session: AsyncSession = Depends(get_session),
) -> list[Equipment]:
    """List equipment, optionally filtered by zone or status."""
    stmt = select(Equipment).order_by(Equipment.id)
    if zone_id is not None:
        stmt = stmt.where(Equipment.zone_id == zone_id)
    if status is not None:
        stmt = stmt.where(Equipment.status == status)
    return list((await session.scalars(stmt)).all())


_STATUS_WEIGHTS = {
    "online": 0.72,
    "warning": 0.15,
    "alert": 0.08,
    "offline": 0.05,
}


def _random_status(rng: random.Random) -> str:
    """Weighted random status draw."""
    statuses = list(_STATUS_WEIGHTS)
    weights = [_STATUS_WEIGHTS[s] for s in statuses]
    return rng.choices(statuses, weights=weights, k=1)[0]


def _health_for_status(rng: random.Random, status: str) -> int:
    """Health score consistent with a status."""
    ranges = {"online": (80, 100), "warning": (55, 79), "alert": (15, 54), "offline": (0, 20)}
    low, high = ranges[status]
    return rng.randint(low, high)


@router.post("/equipment/simulate", response_model=EquipmentSimulateResponse)
async def simulate_equipment(
    session: AsyncSession = Depends(get_session),
) -> EquipmentSimulateResponse:
    """Randomly nudge power / health / status of every equipment (demo).

    The nominal power anchors the simulation: ``current_power_kw`` oscillates
    between 30 % and 130 % of the nominal value. Status transitions are
    weighted so the fleet stays mostly healthy.

    Args:
        session: Injected async database session.
    """
    equipment_rows = list((await session.scalars(select(Equipment))).all())
    if not equipment_rows:
        raise HTTPException(
            status_code=404,
            detail="Aucun équipement à simuler. Lancez le script seed_building.",
        )

    rng = random.Random()
    for eq in equipment_rows:
        nominal = float(eq.nominal_power_kw or 0.0)
        status = _random_status(rng)
        if status == "offline":
            current = 0.0
        else:
            factor = rng.uniform(0.3, 1.3)
            current = round(max(0.0, nominal * factor), 2)
        eq.status = status
        eq.current_power_kw = current
        eq.health_score = _health_for_status(rng, status)

    await session.commit()
    updated = [EquipmentRead.model_validate(eq) for eq in equipment_rows]
    return EquipmentSimulateResponse(updated=len(updated), equipment=updated)
