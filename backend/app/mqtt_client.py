"""MQTT ingestion service and Phase 1 rule-based waste detection."""

from __future__ import annotations

import asyncio
import json
import logging
from asyncio import AbstractEventLoop
from datetime import datetime, timedelta, timezone
from typing import Any

import paho.mqtt.client as mqtt
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.ai.pv_detector import calculate_expected_power, compute_inverter_efficiency, detect_and_persist
from app.config import Settings, get_settings
from app.database import SessionLocal
from app.models import Alert, PVReading, Reading, SystemSetting
from app.schemas import ReadingIngest, SolarIngest

logger = logging.getLogger(__name__)


def detect_waste(reading: ReadingIngest) -> list[dict[str, Any]]:
    """Apply the Phase 1 rule set to a single reading.

    Args:
        reading: Validated sensor reading.

    Returns:
        A list of alert dictionaries ready to be persisted in ``alerts``.
        The list is empty when nothing suspicious is detected.
    """
    alerts: list[dict[str, Any]] = []

    # Rule 1: fan running without occupancy.
    if (
        reading.fan_current is not None
        and reading.fan_current > 0.1
        and reading.occupancy == 0
    ):
        alerts.append(
            {
                "type": "FAN_NO_OCCUPANCY",
                "severity": "HIGH",
                "message": "Ventilateur allumé sans occupation",
                "cause": "PIR = 0 et courant ventilateur > 0.1 A",
                "confidence": 0.95,
            }
        )

    # Rule 2: high power without occupancy.
    if (
        reading.power is not None
        and reading.power > 100
        and reading.occupancy == 0
    ):
        alerts.append(
            {
                "type": "HIGH_POWER_NO_OCCUPANCY",
                "severity": "HIGH",
                "message": f"Consommation {reading.power:.0f} W sans occupation",
                "cause": "PIR = 0 et puissance > 100 W",
                "confidence": 0.90,
            }
        )

    # Rule 3 (Phase 1 placeholder): lighting candidate for manual review.
    if (
        reading.lux is not None
        and reading.lux > 500
        and reading.power is not None
        and reading.power > 40
    ):
        alerts.append(
            {
                "type": "LIGHTING_CANDIDATE",
                "severity": "MEDIUM",
                "message": "Éclairage possiblement inutile (lux élevé + consommation)",
                "cause": "lux > 500 et puissance > 40 W — à confirmer en Phase 2",
                "confidence": 0.60,
            }
        )

    return alerts


class MQTTIngestor:
    """Background MQTT consumer that persists readings and generated alerts.

    The paho client runs its network loop in a separate thread. Callbacks are
    handed back to the application event loop with
    :func:`asyncio.run_coroutine_threadsafe`, so all database work stays async
    and bound to the main loop.
    """

    def __init__(
        self,
        settings: Settings | None = None,
        session_factory: async_sessionmaker[AsyncSession] | None = None,
    ) -> None:
        """Initialise the ingestor without opening any connection.

        Args:
            settings: Optional settings override (useful for tests).
            session_factory: Optional async session factory override.
        """
        self.settings = settings or get_settings()
        self._session_factory = session_factory or SessionLocal
        self._client: mqtt.Client | None = None
        self._loop: AbstractEventLoop | None = None
        self._connected = False
        self._last_message_at: datetime | None = None
        self._background_tasks: set[asyncio.Task[Any]] = set()

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------
    def start(self, loop: AbstractEventLoop) -> None:
        """Create the paho client and start its background network loop.

        ``connect_async`` + ``loop_start`` makes startup resilient: if the
        broker is not ready yet, paho retries automatically instead of
        crashing the application.

        Args:
            loop: The running asyncio event loop used for DB coroutines.
        """
        self._loop = loop
        client = mqtt.Client(
            callback_api_version=mqtt.CallbackAPIVersion.VERSION2,
            client_id="wattwise-dz-backend",
            clean_session=True,
        )
        client.reconnect_delay_set(min_delay=1, max_delay=30)
        client.on_connect = self._on_connect
        client.on_disconnect = self._on_disconnect
        client.on_message = self._on_message

        self._client = client
        client.connect_async(
            self.settings.mqtt_broker_host,
            self.settings.mqtt_broker_port,
            keepalive=self.settings.mqtt_keepalive,
        )
        client.loop_start()
        logger.info(
            "MQTT client starting broker=%s:%s topic=%s",
            self.settings.mqtt_broker_host,
            self.settings.mqtt_broker_port,
            self.settings.mqtt_topic,
        )

    def stop(self) -> None:
        """Stop the MQTT network loop and disconnect cleanly."""
        for task in list(self._background_tasks):
            task.cancel()
        self._background_tasks.clear()
        client = self._client
        if client is None:
            return
        try:
            client.disconnect()
            client.loop_stop()
        except Exception:  # pragma: no cover - best-effort shutdown
            logger.exception("Error while stopping MQTT client")
        finally:
            for task in list(self._background_tasks):
                task.cancel()
            self._background_tasks.clear()
            self._connected = False
            self._client = None
            logger.info("MQTT client stopped")

    # ------------------------------------------------------------------
    # Status
    # ------------------------------------------------------------------
    def is_connected(self) -> bool:
        """Return whether the backend currently holds a broker connection."""
        client = self._client
        if client is not None and client.is_connected():
            return True
        return self._connected

    @property
    def last_message_at(self) -> datetime | None:
        """UTC timestamp of the last successfully processed MQTT message."""
        return self._last_message_at

    # ------------------------------------------------------------------
    # paho callbacks (network thread)
    # ------------------------------------------------------------------
    def _on_connect(
        self,
        client: mqtt.Client,
        userdata: Any,
        flags: Any,
        reason_code: Any,
        properties: Any = None,
    ) -> None:
        """Subscribe to the configured topic once connected."""
        if reason_code == 0:
            self._connected = True
            client.subscribe(self.settings.mqtt_topic, qos=0)
            solar_topic = getattr(self.settings, "mqtt_solar_topic", "wattwise/+/solar")
            if solar_topic and solar_topic != self.settings.mqtt_topic:
                client.subscribe(solar_topic, qos=0)
            logger.info(
                "MQTT connected, subscribed to %s and %s",
                self.settings.mqtt_topic,
                solar_topic,
            )
        else:
            self._connected = False
            logger.error("MQTT connection refused: %s", reason_code)

    def _on_disconnect(
        self,
        client: mqtt.Client,
        userdata: Any,
        flags: Any,
        reason_code: Any,
        properties: Any = None,
    ) -> None:
        """Record disconnections without terminating the application."""
        self._connected = False
        logger.warning("MQTT disconnected (reason=%s); auto-reconnect enabled", reason_code)

    def _on_message(
        self, client: mqtt.Client, userdata: Any, msg: mqtt.MQTTMessage
    ) -> None:
        """Hand a raw message to the application event loop."""
        loop = self._loop
        if loop is None or loop.is_closed():
            logger.warning("MQTT message received but event loop unavailable")
            return
        solar_topic = getattr(self.settings, "mqtt_solar_topic", "wattwise/+/solar")
        topic = getattr(msg, "topic", "") or ""
        is_solar = bool(topic) and (
            topic == solar_topic or topic.endswith("/solar")
        )
        coro = (
            self.process_pv_payload(msg.payload)
            if is_solar
            else self.process_payload(msg.payload)
        )
        future = asyncio.run_coroutine_threadsafe(coro, loop)
        future.add_done_callback(self._log_future_error)

    @staticmethod
    def _log_future_error(future: Any) -> None:
        """Log exceptions raised while processing a message."""
        try:
            future.result()
        except Exception:  # pragma: no cover - defensive logging only
            logger.exception("Unhandled error while processing MQTT message")

    # ------------------------------------------------------------------
    # Ingestion
    # ------------------------------------------------------------------
    async def process_payload(self, payload: bytes) -> Reading | None:
        """Validate and persist one MQTT payload, then run detection.

        Invalid JSON or schema violations are logged and ignored; the method
        never raises for bad input.

        Args:
            payload: Raw UTF-8 JSON bytes received from the broker.

        Returns:
            The persisted :class:`Reading`, or ``None`` if it was discarded.
        """
        try:
            decoded = payload.decode("utf-8")
            data = json.loads(decoded)
        except (UnicodeDecodeError, json.JSONDecodeError):
            logger.warning("Dropped MQTT message: invalid UTF-8 JSON")
            return None

        if not isinstance(data, dict):
            logger.warning("Dropped MQTT message: payload is not a JSON object")
            return None

        try:
            reading = ReadingIngest.model_validate(data)
        except ValidationError as exc:
            logger.warning("Dropped MQTT message: schema validation failed: %s", exc.errors())
            return None

        now = datetime.now(timezone.utc)
        values = {
            "device_id": reading.device_id,
            "timestamp": now,
            "voltage": reading.voltage,
            "current": reading.current,
            "power": reading.power,
            "energy_kwh": reading.energy_kwh,
            "fan_current": reading.fan_current,
            "temperature": reading.temperature,
            "humidity": reading.humidity,
            "lux": reading.lux,
            "occupancy": reading.occupancy,
        }

        try:
            async with self._session_factory() as session:
                predicted_power: float | None = None
                try:
                    # Lazy imports keep Phase 1 importable even when the
                    # optional ML dependencies or artifacts are absent.
                    from app.ai.forecaster import predict_power_for_reading

                    predicted_power = await predict_power_for_reading(
                        session, reading, now
                    )
                except Exception as exc:
                    logger.debug(
                        "Forecast unavailable for device=%s: %s",
                        reading.device_id,
                        exc,
                    )

                row = Reading(**values)
                session.add(row)
                await session.flush()

                # Hybrid detection: Phase 1 rules + Isolation Forest + residual.
                from app.ai.detector import WasteDetector
                from app.ai.explainer import explain_alert

                residual = (
                    reading.power - predicted_power
                    if reading.power is not None and predicted_power is not None
                    else None
                )
                context = {
                    "power": reading.power,
                    "fan_current": reading.fan_current,
                    "occupancy": reading.occupancy,
                    "temperature": reading.temperature,
                    "humidity": reading.humidity,
                    "lux": reading.lux,
                    "residual": residual,
                }

                alerts = WasteDetector().detect(reading, predicted_power)

                # Check if Eco Mode is active
                eco_stmt = select(SystemSetting.value).where(SystemSetting.key == "eco_mode")
                eco_val = await session.scalar(eco_stmt)
                is_eco_mode = str(eco_val).lower() in ("true", "1", "yes")

                if is_eco_mode and reading.power and reading.power > 100 and (now.hour in (18, 19, 20)):
                    alerts.append({
                        "type": "PEAK_ALERT",
                        "severity": "CRITICAL",
                        "message": f"Pic de consommation détecté en période de pointe ({reading.power:.0f} W)",
                        "confidence": 0.95,
                    })

                # Vacation Mode: intrusion / early return detection.
                # When vacation mode is ON and occupancy=1 persists for >2 hours,
                # raise an "Intrusion ou retour anticipé" alert.
                vac_stmt = select(SystemSetting.value).where(SystemSetting.key == "vacation_mode")
                vac_val = await session.scalar(vac_stmt)
                is_vacation_mode = str(vac_val).lower() in ("true", "1", "yes")
                if is_vacation_mode and reading.occupancy == 1:
                    since_vacation = now - timedelta(hours=2)
                    occ_stmt = select(Reading).where(
                        Reading.device_id == reading.device_id,
                        Reading.timestamp >= since_vacation,
                        Reading.occupancy == 1,
                    ).order_by(Reading.timestamp.desc())
                    recent_occ = list((await session.scalars(occ_stmt)).all())
                    if len(recent_occ) >= 8:  # ~2 hours at 15-min intervals
                        vac_existing_stmt = select(Alert).where(
                            Alert.device_id == reading.device_id,
                            Alert.type == "VACATION_INTRUSION",
                            Alert.resolved.is_(False),
                            Alert.timestamp >= now - timedelta(hours=1),
                        )
                        vac_existing = (await session.scalars(vac_existing_stmt)).first()
                        if vac_existing is None:
                            session.add(
                                Alert(
                                    device_id=reading.device_id,
                                    timestamp=now,
                                    type="VACATION_INTRUSION",
                                    severity="HIGH",
                                    message="Intrusion ou retour anticipé : présence détectée pendant le Mode Vacances",
                                    cause="occupancy=1 sur plus de 2 heures en Mode Vacances",
                                    confidence=0.90,
                                    resolved=False,
                                )
                            )

                for alert_data in alerts:
                    enriched = dict(alert_data)
                    if is_eco_mode and enriched.get("type") in ("HIGH_POWER_NO_OCCUPANCY", "OVERCONSUMPTION_VS_FORECAST", "PEAK_ALERT"):
                        enriched["severity"] = "CRITICAL"
                    enriched["cause"] = json.dumps(
                        explain_alert(enriched, context=context),
                        ensure_ascii=False,
                    )
                    alert_type = enriched.get("type")
                    # Deduplicate: if an unresolved alert of the same type exists
                    # for this device within the last hour, refresh it instead of
                    # creating a duplicate.
                    dedup_window = now - timedelta(hours=1)
                    existing_stmt = select(Alert).where(
                        Alert.device_id == reading.device_id,
                        Alert.type == alert_type,
                        Alert.resolved.is_(False),
                        Alert.timestamp >= dedup_window,
                    )
                    existing = (await session.scalars(existing_stmt)).first()
                    if existing is not None:
                        existing.timestamp = now
                        existing.severity = enriched.get("severity", existing.severity)
                        existing.confidence = enriched.get("confidence", existing.confidence)
                        existing.message = enriched.get("message", existing.message)
                        existing.cause = enriched["cause"]
                    else:
                        session.add(
                            Alert(
                                device_id=reading.device_id,
                                timestamp=now,
                                **enriched,
                            )
                        )
                await session.commit()
        except Exception:
            logger.exception(
                "Failed to store reading device=%s", reading.device_id
            )
            return None

        self._last_message_at = now
        logger.info(
            "stored reading id=%s device=%s power=%s predicted=%s",
            row.id,
            reading.device_id,
            reading.power,
            predicted_power,
        )
        return row

    # ------------------------------------------------------------------
    # Advanced PV ingestion (optional topic ``wattwise/+/solar``)
    # ------------------------------------------------------------------
    async def process_pv_payload(self, payload: bytes) -> PVReading | None:
        """Validate, enrich and persist one advanced photovoltaic payload.

        Expected power, actual power and inverter efficiency are computed from
        the raw measurements. Diagnostics run in a background task so the MQTT
        ingestion loop and the API remain non-blocking.

        Args:
            payload: Raw UTF-8 JSON bytes received on the solar topic.

        Returns:
            The persisted :class:`PVReading`, or ``None`` when discarded.
        """
        try:
            data = json.loads(payload.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            logger.warning("Dropped solar MQTT message: invalid UTF-8 JSON")
            return None

        if not isinstance(data, dict):
            logger.warning("Dropped solar MQTT message: payload is not a JSON object")
            return None

        try:
            reading = SolarIngest.model_validate(data)
        except ValidationError as exc:
            logger.warning(
                "Dropped solar MQTT message: schema validation failed: %s", exc.errors()
            )
            return None

        now = datetime.now(timezone.utc)
        area = reading.panel_area or self.settings.pv_panel_area_m2
        efficiency = reading.panel_efficiency or self.settings.pv_panel_efficiency

        expected_power = calculate_expected_power(
            reading.irradiance,
            area,
            efficiency,
            panel_temperature_c=reading.panel_temperature,
            ambient_temperature_c=reading.ambient_temperature,
            temp_coefficient_per_c=self.settings.pv_temp_coefficient_per_c,
            stc_temperature_c=self.settings.pv_stc_temperature_c,
            noct_c=self.settings.pv_noct_c,
        )

        actual_power = (
            reading.ac_power if reading.ac_power is not None else reading.dc_power
        )
        dc_input = (
            reading.inverter_dc_input_power
            if reading.inverter_dc_input_power is not None
            else reading.dc_power
        )
        ac_output = (
            reading.inverter_ac_output_power
            if reading.inverter_ac_output_power is not None
            else reading.ac_power
        )
        inverter_efficiency = reading.inverter_efficiency
        if inverter_efficiency is None:
            inverter_efficiency = compute_inverter_efficiency(dc_input, ac_output)

        try:
            async with self._session_factory() as session:
                row = PVReading(
                    device_id=reading.device_id,
                    timestamp=now,
                    dc_voltage=reading.dc_voltage,
                    dc_current=reading.dc_current,
                    dc_power=reading.dc_power,
                    ac_power=reading.ac_power,
                    irradiance=reading.irradiance,
                    panel_temperature=reading.panel_temperature,
                    ambient_temperature=reading.ambient_temperature,
                    expected_power=expected_power,
                    actual_power=actual_power,
                    panel_area=area,
                    panel_efficiency=efficiency,
                    inverter_efficiency=inverter_efficiency,
                    inverter_temperature=reading.inverter_temperature,
                    inverter_status=reading.inverter_status,
                    inverter_dc_input_power=dc_input,
                    inverter_ac_output_power=ac_output,
                    data_source=reading.data_source or "mqtt",
                )
                session.add(row)
                await session.commit()
        except Exception:
            logger.exception(
                "Failed to store PV reading device=%s", reading.device_id
            )
            return None

        self._last_message_at = now
        logger.info(
            "stored PV reading id=%s device=%s actual=%s expected=%s source=%s",
            row.id,
            reading.device_id,
            actual_power,
            expected_power,
            row.data_source,
        )
        self._schedule_pv_detection(reading.device_id)
        return row

    def _schedule_pv_detection(self, device_id: str) -> None:
        """Run PV diagnostics in the background without blocking ingestion."""
        try:
            task = asyncio.create_task(self._run_pv_detection(device_id))
        except RuntimeError:  # pragma: no cover - no running loop (tests)
            logger.debug("No running loop: PV diagnostics skipped for %s", device_id)
            return
        self._background_tasks.add(task)
        task.add_done_callback(self._on_pv_task_done)

    def _on_pv_task_done(self, task: asyncio.Task[Any]) -> None:
        """Discard finished background tasks and log unexpected failures."""
        self._background_tasks.discard(task)
        try:
            task.result()
        except Exception:  # pragma: no cover - defensive logging only
            logger.exception("Background PV diagnostics failed")

    async def _run_pv_detection(self, device_id: str) -> None:
        """Load recent PV rows and persist diagnostics with suppression."""
        limit = max(50, self.settings.pv_consecutive_readings * 20)
        async with self._session_factory() as session:
            rows = list(
                (
                    await session.scalars(
                        select(PVReading)
                        .where(PVReading.device_id == device_id)
                        .order_by(PVReading.timestamp.desc(), PVReading.id.desc())
                        .limit(limit)
                    )
                ).all()
            )
            rows.reverse()
            if not rows:
                return
            await detect_and_persist(session, rows, device_id, settings=self.settings)
