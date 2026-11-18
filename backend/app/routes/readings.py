"""Reading, alert and statistics endpoints."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.models import Alert, Reading
from app.schemas import AlertRead, ReadingRead, StatsSummary

router = APIRouter(tags=["data"])


def _as_utc(value: datetime) -> datetime:
    """Attach UTC to naive datetimes and normalise aware ones.

    Args:
        value: User-supplied datetime.

    Returns:
        A timezone-aware datetime in UTC.
    """
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


@router.get("/readings/latest", response_model=list[ReadingRead])
async def latest_readings(
    limit: int = Query(default=100, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
    device_id: str | None = Query(default=None, max_length=50),
    session: AsyncSession = Depends(get_session),
) -> list[Reading]:
    """Return the most recent readings, newest first.

    Args:
        limit: Page size (1-1000).
        offset: Number of rows to skip.
        device_id: Optional device filter.
        session: Injected async database session.
    """
    statement = select(Reading)
    if device_id is not None:
        statement = statement.where(Reading.device_id == device_id)
    statement = (
        statement.order_by(Reading.timestamp.desc(), Reading.id.desc())
        .limit(limit)
        .offset(offset)
    )
    result = await session.scalars(statement)
    return list(result)


@router.get("/readings/range", response_model=list[ReadingRead])
async def readings_range(
    from_: datetime | None = Query(default=None, alias="from"),
    to: datetime | None = Query(default=None),
    device_id: str | None = Query(default=None, max_length=50),
    limit: int = Query(default=100, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
    session: AsyncSession = Depends(get_session),
) -> list[Reading]:
    """Return readings inside a time range (defaults to the last 24 hours).

    Args:
        from_: Inclusive range start (ISO 8601).
        to: Exclusive range end (ISO 8601).
        device_id: Optional device filter.
        limit: Page size (1-1000).
        offset: Number of rows to skip.
        session: Injected async database session.

    Raises:
        HTTPException: 400 when ``from`` is not strictly before ``to``.
    """
    end = _as_utc(to) if to is not None else datetime.now(timezone.utc)
    start = _as_utc(from_) if from_ is not None else end - timedelta(hours=24)

    if start >= end:
        raise HTTPException(
            status_code=400, detail="'from' must be strictly before 'to'"
        )

    statement = select(Reading).where(
        Reading.timestamp >= start, Reading.timestamp < end
    )
    if device_id is not None:
        statement = statement.where(Reading.device_id == device_id)
    statement = (
        statement.order_by(Reading.timestamp.desc(), Reading.id.desc())
        .limit(limit)
        .offset(offset)
    )
    result = await session.scalars(statement)
    return list(result)


@router.get("/alerts/active", response_model=list[AlertRead])
async def active_alerts(
    device_id: str | None = Query(default=None, max_length=50),
    limit: int = Query(default=100, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
    session: AsyncSession = Depends(get_session),
) -> list[Alert]:
    """Return unresolved alerts, newest first.

    Args:
        device_id: Optional device filter.
        limit: Page size (1-1000).
        offset: Number of rows to skip.
        session: Injected async database session.
    """
    statement = select(Alert).where(Alert.resolved.is_(False))
    if device_id is not None:
        statement = statement.where(Alert.device_id == device_id)
    statement = (
        statement.order_by(Alert.timestamp.desc(), Alert.id.desc())
        .limit(limit)
        .offset(offset)
    )
    result = await session.scalars(statement)
    return list(result)


@router.get("/alerts", response_model=list[AlertRead])
async def list_alerts(
    device_id: str | None = Query(default=None, max_length=50),
    resolved: bool | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
    session: AsyncSession = Depends(get_session),
) -> list[Alert]:
    """Return alerts, optionally filtered by device and resolution state.

    Args:
        device_id: Optional device filter.
        resolved: Optional resolution filter (true = resolved, false = active).
        limit: Page size (1-1000).
        offset: Number of rows to skip.
        session: Injected async database session.
    """
    statement = select(Alert)
    if device_id is not None:
        statement = statement.where(Alert.device_id == device_id)
    if resolved is not None:
        statement = statement.where(Alert.resolved.is_(resolved))
    statement = (
        statement.order_by(Alert.timestamp.desc(), Alert.id.desc())
        .limit(limit)
        .offset(offset)
    )
    result = await session.scalars(statement)
    return list(result)


@router.post("/alerts/{alert_id}/resolve", response_model=AlertRead)
async def resolve_alert(
    alert_id: int,
    session: AsyncSession = Depends(get_session),
) -> Alert:
    """Mark an alert as resolved.

    Args:
        alert_id: Primary key of the alert.
        session: Injected async database session.

    Raises:
        HTTPException: 404 when the alert does not exist.
    """
    alert = await session.get(Alert, alert_id)
    if alert is None:
        raise HTTPException(status_code=404, detail="Alert not found")

    alert.resolved = True
    await session.commit()
    await session.refresh(alert)
    return alert


class ResolveAllRequest(BaseModel):
    device_id: str = "SALLE1"


@router.post("/alerts/resolve-all")
async def resolve_all_alerts(
    payload: ResolveAllRequest | None = None,
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Mark all unresolved alerts for a device as resolved.

    Args:
        payload: Optional body with device_id to scope the resolution.
        session: Injected async database session.
    """
    device_id = payload.device_id if payload else "SALLE1"
    statement = select(Alert).where(
        Alert.resolved.is_(False),
        Alert.device_id == device_id,
    )
    alerts_to_resolve = list((await session.scalars(statement)).all())
    for alert in alerts_to_resolve:
        alert.resolved = True
    await session.commit()
    count = len(alerts_to_resolve)
    return {
        "resolved": count,
        "message": f"{count} alerte(s) résolue(s) avec succès",
    }


@router.get("/stats/summary", response_model=StatsSummary)
async def stats_summary(
    device_id: str | None = Query(default=None, max_length=50),
    hours: int = Query(default=24, ge=1, le=720),
    session: AsyncSession = Depends(get_session),
) -> StatsSummary:
    """Compute power, energy, alert and occupancy KPIs for a time window.

    ``total_energy_kwh`` is derived from the cumulative ``energy_kwh`` counter
    (max minus min inside the window), which avoids summing a monotonic meter.

    Args:
        device_id: Optional device filter.
        hours: Rolling window size in hours (1-720).
        session: Injected async database session.
    """
    since = datetime.now(timezone.utc) - timedelta(hours=hours)

    reading_filters = [Reading.timestamp >= since]
    alert_filters = [Alert.timestamp >= since]
    if device_id is not None:
        reading_filters.append(Reading.device_id == device_id)
        alert_filters.append(Alert.device_id == device_id)

    aggregate = await session.execute(
        select(
            func.avg(Reading.power),
            func.max(Reading.power),
            func.min(Reading.energy_kwh),
            func.max(Reading.energy_kwh),
            func.avg(Reading.occupancy),
        ).where(*reading_filters)
    )
    avg_power, max_power, min_energy, max_energy, occupancy_ratio = aggregate.one()

    alert_count = await session.scalar(
        select(func.count(Alert.id)).where(*alert_filters)
    )

    total_energy = 0.0
    if min_energy is not None and max_energy is not None and max_energy >= min_energy:
        total_energy = round(float(max_energy) - float(min_energy), 4)

    return StatsSummary(
        device_id=device_id,
        period_hours=hours,
        avg_power_w=round(float(avg_power), 3) if avg_power is not None else None,
        max_power_w=round(float(max_power), 3) if max_power is not None else None,
        total_energy_kwh=total_energy,
        alert_count=int(alert_count or 0),
        occupancy_ratio=(
            round(float(occupancy_ratio), 4)
            if occupancy_ratio is not None
            else None
        ),
    )
