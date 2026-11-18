"""MQTT ingestion handler tests (no broker required)."""

from __future__ import annotations

import asyncio
import json
from dataclasses import dataclass

from sqlalchemy import func, select

from app.database import SessionLocal
from app.models import Alert, Reading
from app.mqtt_client import MQTTIngestor, detect_waste
from app.schemas import ReadingIngest


@dataclass
class FakeMessage:
    """Minimal stand-in for ``paho.mqtt.client.MQTTMessage``."""

    payload: bytes


async def _counts() -> tuple[int, list[str]]:
    """Return the reading count and all alert types currently stored."""
    async with SessionLocal() as session:
        reading_count = await session.scalar(
            select(func.count()).select_from(Reading)
        )
        alert_types = list(
            (await session.scalars(select(Alert.type))).all()
        )
    return int(reading_count or 0), alert_types


async def test_on_message_inserts_reading_and_fan_alert() -> None:
    """The on_message handler stores a reading and a FAN_NO_OCCUPANCY alert."""
    ingestor = MQTTIngestor()
    ingestor._loop = asyncio.get_running_loop()

    payload = json.dumps(
        {
            "device_id": "SALLE1",
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
    ).encode("utf-8")

    ingestor._on_message(None, None, FakeMessage(payload=payload))  # type: ignore[arg-type]

    for _ in range(100):
        reading_count, alert_types = await _counts()
        if reading_count == 1 and alert_types:
            break
        await asyncio.sleep(0.05)

    reading_count, alert_types = await _counts()
    assert reading_count == 1
    assert "FAN_NO_OCCUPANCY" in alert_types
    assert "LIGHTING_CANDIDATE" in alert_types


async def test_invalid_json_is_ignored() -> None:
    """Malformed JSON must be logged and dropped without an exception."""
    ingestor = MQTTIngestor()

    result = await ingestor.process_payload(b"{not valid json")

    assert result is None
    assert await _counts() == (0, [])


async def test_invalid_schema_is_ignored() -> None:
    """A payload missing device_id fails validation and is not stored."""
    ingestor = MQTTIngestor()

    result = await ingestor.process_payload(
        json.dumps({"power": 10.0, "occupancy": 0}).encode("utf-8")
    )

    assert result is None
    assert await _counts() == (0, [])


def test_detect_waste_high_power_rule() -> None:
    """Rule 2 fires for high power while unoccupied."""
    reading = ReadingIngest(
        device_id="SALLE1", power=250.0, fan_current=0.0, occupancy=0
    )

    alerts = detect_waste(reading)

    assert [alert["type"] for alert in alerts] == ["HIGH_POWER_NO_OCCUPANCY"]
