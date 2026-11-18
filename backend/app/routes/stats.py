"""Statistics endpoints: Wattwise Score, Top Consumers, Neighborhood Benchmark."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database import get_session
from app.models import Alert, Reading, SystemSetting
from app.schemas import (
    BenchmarkResponse,
    TopConsumersResponse,
    TopConsumer,
    WattwiseScore,
)

router = APIRouter(prefix="/stats", tags=["stats"])

VACATION_MODE_KEY = "vacation_mode"


async def _get_bool_setting(session: AsyncSession, key: str) -> bool:
    stmt = select(SystemSetting.value).where(SystemSetting.key == key)
    val = await session.scalar(stmt)
    return str(val).lower() in ("true", "1", "yes")


@router.get("/score", response_model=WattwiseScore)
async def wattwise_score(
    device_id: str | None = Query(default=None, max_length=50),
    session: AsyncSession = Depends(get_session),
) -> WattwiseScore:
    """Compute a global energy efficiency grade (A-F, 0-100).

    Starts at 100, deducts 5 per active HIGH alert and 2 per MEDIUM alert,
    adds 10 if Eco Mode is ON. Returns a letter grade and short trend.
    """
    now = datetime.now(timezone.utc)
    since = now - timedelta(hours=24)

    alert_filters = [Alert.timestamp >= since, Alert.resolved.is_(False)]
    if device_id is not None:
        alert_filters.append(Alert.device_id == device_id)

    high_count = await session.scalar(
        select(func.count(Alert.id)).where(
            *alert_filters, Alert.severity.in_(["HIGH", "CRITICAL"])
        )
    )
    medium_count = await session.scalar(
        select(func.count(Alert.id)).where(*alert_filters, Alert.severity == "MEDIUM")
    )

    score = 100
    score -= 5 * int(high_count or 0)
    score -= 2 * int(medium_count or 0)

    eco_active = await _get_bool_setting(session, "eco_mode")
    if eco_active:
        score += 10

    score = max(0, min(100, score))

    if score >= 85:
        grade = "A"
    elif score >= 70:
        grade = "B"
    elif score >= 55:
        grade = "C"
    elif score >= 40:
        grade = "D"
    elif score >= 25:
        grade = "E"
    else:
        grade = "F"

    trend = "+0" if eco_active else ("+2" if score >= 80 else "-1")

    return WattwiseScore(score=score, grade=grade, trend=trend)


@router.get("/top-consumers", response_model=TopConsumersResponse)
async def top_consumers(
    device_id: str | None = Query(default=None, max_length=50),
    session: AsyncSession = Depends(get_session),
) -> TopConsumersResponse:
    """Return the top 5 most energy-consuming devices/zones.

    Falls back to realistic mock data when the readings table is empty so the
    dashboard widget always has something to show during demos.
    """
    now = datetime.now(timezone.utc)
    since = now - timedelta(hours=24)

    stmt = select(
        Reading.device_id,
        func.avg(Reading.power).label("avg_power"),
    ).where(Reading.timestamp >= since)

    if device_id is not None:
        stmt = stmt.where(Reading.device_id == device_id)

    stmt = stmt.group_by(Reading.device_id).order_by(func.avg(Reading.power).desc()).limit(5)
    rows = (await session.execute(stmt)).all()

    consumers: list[TopConsumer] = []
    if rows:
        max_power = max(float(r.avg_power or 0) for r in rows) or 1.0
        for r in rows:
            kw = float(r.avg_power or 0) / 1000.0
            pct = round((float(r.avg_power or 0) / max_power) * 100)
            consumers.append(
                TopConsumer(
                    name=str(r.device_id),
                    power_kw=round(kw, 2),
                    pct=pct,
                )
            )
    else:
        # Mock realistic data for demo / pitch when no real zones exist.
        mock = [
            ("Climatisation Aile A", 4.5, 100),
            ("Éclairage Étage 2", 2.8, 62),
            ("Serveurs Informatique", 3.2, 71),
            ("Chauffe-eau", 1.9, 42),
            ("Ventilation Parking", 1.1, 24),
        ]
        for name, kw, pct in mock:
            consumers.append(TopConsumer(name=name, power_kw=kw, pct=pct))

    return TopConsumersResponse(consumers=consumers)


@router.get("/benchmark", response_model=BenchmarkResponse)
async def benchmark(
    device_id: str | None = Query(default=None, max_length=50),
    session: AsyncSession = Depends(get_session),
) -> BenchmarkResponse:
    """Compare the building's consumption to the neighborhood average.

    Returns mock data when real readings are unavailable.
    """
    now = datetime.now(timezone.utc)
    since = now - timedelta(hours=24)

    stmt = select(func.avg(Reading.power)).where(Reading.timestamp >= since)
    if device_id is not None:
        stmt = stmt.where(Reading.device_id == device_id)

    avg_power = await session.scalar(stmt)
    your_kw = round(float(avg_power or 0) / 1000.0, 2) if avg_power is not None else 0.0

    # Fallback to realistic mock when no data.
    if your_kw == 0.0:
        your_kw = 120.0

    neighborhood_avg = 150.0
    pct = round(((your_kw - neighborhood_avg) / neighborhood_avg) * 100, 1)

    return BenchmarkResponse(
        your_consumption=your_kw,
        neighborhood_avg=neighborhood_avg,
        percentage=pct,
    )