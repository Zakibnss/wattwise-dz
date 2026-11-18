"""Alert deduplication tests for MQTT ingestion."""

from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone

from sqlalchemy import select

from app.database import SessionLocal
from app.models import Alert
from app.mqtt_client import MQTTIngestor

FAN_PAYLOAD = {
    "device_id": "DEDUP1",
    "voltage": 220.5,
    "current": 0.45,
    "power": 99.2,
    "energy_kwh": 102.34,
    "fan_current": 0.42,
    "temperature": 26.3,
    "humidity": 48.1,
    "lux": 620.0,
    "occupancy": 0,
}


async def _alert_types(device_id: str) -> list[str]:
    async with SessionLocal() as session:
        rows = await session.scalars(
            select(Alert.type).where(Alert.device_id == device_id)
        )
        return list(rows.all())


async def _alerts(device_id: str) -> list[Alert]:
    async with SessionLocal() as session:
        rows = await session.scalars(
            select(Alert).where(Alert.device_id == device_id)
        )
        return list(rows.all())


async def test_dedup_same_type_refreshes_existing() -> None:
    ingestor = MQTTIngestor()
    await ingestor.process_payload(json.dumps(FAN_PAYLOAD).encode())
    await ingestor.process_payload(json.dumps(FAN_PAYLOAD).encode())

    alerts = await _alerts("DEDUP1")
    fan_alerts = [a for a in alerts if a.type == "FAN_NO_OCCUPANCY"]
    assert len(fan_alerts) == 1


async def test_dedup_different_type_creates_distinct() -> None:
    ingestor = MQTTIngestor()
    payload2 = dict(FAN_PAYLOAD)
    payload2["device_id"] = "DEDUP2"
    payload2["power"] = 250.0  # triggers HIGH_POWER_NO_OCCUPANCY
    payload2["fan_current"] = 0.0
    await ingestor.process_payload(json.dumps(FAN_PAYLOAD | {"device_id": "DEDUP2"}).encode())
    await ingestor.process_payload(json.dumps(payload2).encode())

    types = await _alert_types("DEDUP2")
    assert "FAN_NO_OCCUPANCY" in types
    assert "HIGH_POWER_NO_OCCUPANCY" in types


async def test_dedup_different_device_creates_distinct() -> None:
    ingestor = MQTTIngestor()
    await ingestor.process_payload(json.dumps(FAN_PAYLOAD).encode())
    await ingestor.process_payload(
        json.dumps({**FAN_PAYLOAD, "device_id": "DEDUP3"}).encode()
    )

    a1 = await _alerts("DEDUP1")
    a3 = await _alerts("DEDUP3")
    assert len([a for a in a1 if a.type == "FAN_NO_OCCUPANCY"]) == 1
    assert len([a for a in a3 if a.type == "FAN_NO_OCCUPANCY"]) == 1


async def test_dedup_resolved_not_reused() -> None:
    ingestor = MQTTIngestor()
    await ingestor.process_payload(json.dumps(FAN_PAYLOAD).encode())

    # Resolve the existing alert
    async with SessionLocal() as session:
        alert = (await session.scalars(
            select(Alert).where(
                Alert.device_id == "DEDUP1", Alert.type == "FAN_NO_OCCUPANCY"
            )
        )).first()
        assert alert is not None
        alert.resolved = True
        await session.commit()

    await ingestor.process_payload(json.dumps(FAN_PAYLOAD).encode())

    alerts = await _alerts("DEDUP1")
    fan_alerts = [a for a in alerts if a.type == "FAN_NO_OCCUPANCY"]
    assert len(fan_alerts) == 2
    assert any(a.resolved for a in fan_alerts)
    assert any(not a.resolved for a in fan_alerts)


async def test_dedup_refresh_updates_fields() -> None:
    ingestor = MQTTIngestor()
    await ingestor.process_payload(json.dumps(FAN_PAYLOAD).encode())

    async with SessionLocal() as session:
        alert = (await session.scalars(
            select(Alert).where(
                Alert.device_id == "DEDUP1", Alert.type == "FAN_NO_OCCUPANCY"
            )
        )).first()
        assert alert is not None
        old_ts = alert.timestamp

    # second detection refreshes
    await ingestor.process_payload(json.dumps(FAN_PAYLOAD).encode())

    async with SessionLocal() as session:
        alert = (await session.scalars(
            select(Alert).where(
                Alert.device_id == "DEDUP1", Alert.type == "FAN_NO_OCCUPANCY",
                Alert.resolved.is_(False),
            )
        )).first()
        assert alert is not None
        assert alert.timestamp >= old_ts