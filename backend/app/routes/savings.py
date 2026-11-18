"""Savings endpoints: record energy savings and summarize them."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database import get_session
from app.models import Alert, Saving
from app.schemas import SavingsCreate, SavingsItem, SavingsSummary

router = APIRouter(tags=["savings"])


def _as_utc(value: datetime | None, default: datetime) -> datetime:
    """Return ``value`` as UTC, falling back to ``default`` when ``None``."""
    if value is None:
        return default
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


@router.post("/savings", response_model=SavingsItem)
async def create_savings(
    payload: SavingsCreate,
    session: AsyncSession = Depends(get_session),
) -> Saving:
    """Record energy savings for an alert.

    Args:
        payload: Savings create payload.
        session: Injected async database session.

    Raises:
        HTTPException: 404 when ``alert_id`` does not exist.
    """
    alert = await session.get(Alert, payload.alert_id)
    if alert is None:
        raise HTTPException(status_code=404, detail="Alert not found")

    saved_kwh = round(payload.baseline_kwh - payload.actual_kwh, 6)
    saved_percent = (
        round(saved_kwh / payload.baseline_kwh * 100.0, 4)
        if payload.baseline_kwh > 0
        else 0.0
    )

    row = Saving(
        alert_id=payload.alert_id,
        device_id=payload.device_id,
        timestamp=datetime.now(timezone.utc),
        action_applied=payload.action_applied,
        baseline_kwh=payload.baseline_kwh,
        actual_kwh=payload.actual_kwh,
        saved_kwh=saved_kwh,
        saved_percent=saved_percent,
        confidence=None,
    )
    session.add(row)
    await session.commit()
    await session.refresh(row)
    return row


@router.get("/savings/summary", response_model=SavingsSummary)
async def savings_summary(
    device_id: str | None = Query(default=None, max_length=50),
    from_: datetime | None = Query(default=None, alias="from"),
    to: datetime | None = Query(default=None, alias="to"),
    session: AsyncSession = Depends(get_session),
) -> SavingsSummary:
    """Return aggregated savings over a period (default: last 30 days).

    Args:
        device_id: Optional device filter.
        from_: Inclusive period start (ISO 8601).
        to: Exclusive period end (ISO 8601).
        session: Injected async database session.
    """
    settings = get_settings()
    now = datetime.now(timezone.utc)
    period_from = _as_utc(from_, now - timedelta(days=30))
    period_to = _as_utc(to, now)

    if period_from >= period_to:
        raise HTTPException(
            status_code=400, detail="'from' must be strictly before 'to'"
        )

    statement = select(Saving).where(
        Saving.timestamp >= period_from, Saving.timestamp < period_to
    )
    if device_id is not None:
        statement = statement.where(Saving.device_id == device_id)
    statement = statement.order_by(Saving.timestamp.desc(), Saving.id.desc())

    rows = list((await session.scalars(statement)).all())

    total_kwh = sum(float(row.saved_kwh or 0.0) for row in rows)
    items = [SavingsItem.model_validate(row) for row in rows]

    return SavingsSummary(
        status="ok",
        device_id=device_id,
        period_from=period_from,
        period_to=period_to,
        total_saved_kwh=round(total_kwh, 6),
        total_saved_dzd=round(total_kwh * settings.dzd_per_kwh, 6),
        count=len(items),
        items=items,
    )