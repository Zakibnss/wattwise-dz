"""SQLAlchemy ORM models for the WATTWISE DZ platform."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Identity,
    Index,
    Integer,
    String,
    Text,
    func,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Reading(Base):
    """A single sensor sample received from a building device."""

    __tablename__ = "readings"

    id: Mapped[int] = mapped_column(
        BigInteger, Identity(always=False), primary_key=True
    )
    device_id: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    timestamp: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, index=True
    )
    voltage: Mapped[float | None] = mapped_column(Float, nullable=True)
    current: Mapped[float | None] = mapped_column(Float, nullable=True)
    power: Mapped[float | None] = mapped_column(Float, nullable=True)
    energy_kwh: Mapped[float | None] = mapped_column(Float, nullable=True)
    fan_current: Mapped[float | None] = mapped_column(Float, nullable=True)
    temperature: Mapped[float | None] = mapped_column(Float, nullable=True)
    humidity: Mapped[float | None] = mapped_column(Float, nullable=True)
    lux: Mapped[float | None] = mapped_column(Float, nullable=True)
    occupancy: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class Alert(Base):
    """A rule-based waste detection alert.

    V3 adds a six-stage action workflow (``stage``) plus optional linkage to
    the equipment hierarchy and the WATTY investigation result (``analysis``).
    """

    __tablename__ = "alerts"

    id: Mapped[int] = mapped_column(
        BigInteger, Identity(always=False), primary_key=True
    )
    device_id: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    timestamp: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, index=True
    )
    type: Mapped[str | None] = mapped_column(String(50), nullable=True)
    severity: Mapped[str | None] = mapped_column(String(10), nullable=True)
    message: Mapped[str | None] = mapped_column(Text, nullable=True)
    cause: Mapped[str | None] = mapped_column(Text, nullable=True)
    confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    resolved: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=text("false")
    )

    # V3 action workflow: DETECTED -> ANALYSED -> PROPOSED -> APPROVED ->
    # EXECUTED -> VERIFIED.
    stage: Mapped[str] = mapped_column(
        String(20), nullable=False, default="DETECTED", server_default="DETECTED",
        index=True,
    )
    is_demo: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=text("false")
    )
    equipment_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("equipment.id", ondelete="SET NULL"), nullable=True
    )
    analysis: Mapped[str | None] = mapped_column(Text, nullable=True)
    proposed_action: Mapped[str | None] = mapped_column(Text, nullable=True)
    estimated_savings_kwh: Mapped[float | None] = mapped_column(Float, nullable=True)
    analyzed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    proposed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    approved_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    executed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    verified_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class ModelRun(Base):
    """Training metrics recorded for one executed ML training run."""

    __tablename__ = "model_runs"

    id: Mapped[int] = mapped_column(
        BigInteger, Identity(always=False), primary_key=True
    )
    model_name: Mapped[str] = mapped_column(String(50), nullable=False)
    trained_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    mae: Mapped[float | None] = mapped_column(Float, nullable=True)
    rmse: Mapped[float | None] = mapped_column(Float, nullable=True)
    r2: Mapped[float | None] = mapped_column(Float, nullable=True)
    n_samples: Mapped[int | None] = mapped_column(Integer, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)


class Saving(Base):
    """Energy (and money) saved after an alert was acted upon."""

    __tablename__ = "savings"

    id: Mapped[int] = mapped_column(
        BigInteger, Identity(always=False), primary_key=True
    )
    alert_id: Mapped[int | None] = mapped_column(
        BigInteger,
        ForeignKey("alerts.id", ondelete="SET NULL"),
        nullable=True,
    )
    device_id: Mapped[str | None] = mapped_column(String(50), nullable=True)
    timestamp: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    action_applied: Mapped[str | None] = mapped_column(Text, nullable=True)
    baseline_kwh: Mapped[float | None] = mapped_column(Float, nullable=True)
    actual_kwh: Mapped[float | None] = mapped_column(Float, nullable=True)
    saved_kwh: Mapped[float | None] = mapped_column(Float, nullable=True)
    saved_percent: Mapped[float | None] = mapped_column(Float, nullable=True)
    confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class SolarProduction(Base):
    """Solar photovoltaic generation data."""

    __tablename__ = "solar_production"

    id: Mapped[int] = mapped_column(
        BigInteger, Identity(always=False), primary_key=True
    )
    timestamp: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, index=True
    )
    power_kw: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)


class PVReading(Base):
    """One advanced photovoltaic sensor sample (DC/AC, irradiance, temperatures).

    ``data_source`` distinguishes simulated data (``simulator``) from real
    telemetry (``mqtt``) so the UI never presents simulation as physical
    measurements.
    """

    __tablename__ = "pv_readings"
    __table_args__ = (
        Index("ix_pv_readings_device_timestamp", "device_id", "timestamp"),
    )

    id: Mapped[int] = mapped_column(
        BigInteger, Identity(always=False), primary_key=True
    )
    device_id: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    timestamp: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, index=True
    )

    # Electrical measurements (DC side + AC output).
    dc_voltage: Mapped[float | None] = mapped_column(Float, nullable=True)
    dc_current: Mapped[float | None] = mapped_column(Float, nullable=True)
    dc_power: Mapped[float | None] = mapped_column(Float, nullable=True)
    ac_power: Mapped[float | None] = mapped_column(Float, nullable=True)

    # Environmental measurements.
    irradiance: Mapped[float | None] = mapped_column(Float, nullable=True)
    panel_temperature: Mapped[float | None] = mapped_column(Float, nullable=True)
    ambient_temperature: Mapped[float | None] = mapped_column(Float, nullable=True)

    # Production model and configuration snapshot.
    expected_power: Mapped[float | None] = mapped_column(Float, nullable=True)
    actual_power: Mapped[float | None] = mapped_column(Float, nullable=True)
    panel_area: Mapped[float | None] = mapped_column(Float, nullable=True)
    panel_efficiency: Mapped[float | None] = mapped_column(Float, nullable=True)

    # Inverter telemetry (may be unavailable on small installations).
    inverter_efficiency: Mapped[float | None] = mapped_column(Float, nullable=True)
    inverter_temperature: Mapped[float | None] = mapped_column(Float, nullable=True)
    inverter_status: Mapped[str | None] = mapped_column(String(30), nullable=True)
    inverter_dc_input_power: Mapped[float | None] = mapped_column(Float, nullable=True)
    inverter_ac_output_power: Mapped[float | None] = mapped_column(Float, nullable=True)

    data_source: Mapped[str] = mapped_column(
        String(20), nullable=False, default="simulator", server_default="simulator"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class PVFault(Base):
    """Persistent PV / inverter diagnostic with duplicate suppression.

    One row per (device, fault type) while the fault stays active: repeated
    detections increment ``occurrences`` instead of creating duplicates.
    Rule-based diagnostics are *anomalies*, not confirmed physical faults —
    ``is_confirmed`` only becomes true once a human/thermal inspection is
    recorded.
    """

    __tablename__ = "pv_faults"
    __table_args__ = (
        Index("ix_pv_faults_device_type_status", "device_id", "fault_type", "status"),
    )

    id: Mapped[int] = mapped_column(
        BigInteger, Identity(always=False), primary_key=True
    )
    device_id: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    fault_type: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    severity: Mapped[str] = mapped_column(String(10), nullable=False)
    status: Mapped[str] = mapped_column(
        String(10), nullable=False, default="ACTIVE", server_default="ACTIVE"
    )
    message: Mapped[str] = mapped_column(Text, nullable=False)
    explanation: Mapped[str | None] = mapped_column(Text, nullable=True)
    recommended_action: Mapped[str | None] = mapped_column(Text, nullable=True)
    confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    is_confirmed: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=text("false")
    )
    occurrences: Mapped[int] = mapped_column(
        Integer, nullable=False, default=1, server_default="1"
    )
    first_detected_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    last_detected_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), index=True
    )
    resolved_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class SystemSetting(Base):
    """Key-value system configuration and operational state."""

    __tablename__ = "system_settings"

    id: Mapped[int] = mapped_column(
        BigInteger, Identity(always=False), primary_key=True
    )
    key: Mapped[str] = mapped_column(String(50), unique=True, nullable=False, index=True)
    value: Mapped[str] = mapped_column(Text, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )


# ---------------------------------------------------------------------------
# V3: Building -> Floor -> Zone -> Equipment hierarchy
# ---------------------------------------------------------------------------


class Building(Base):
    """A physical building monitored by the platform."""

    __tablename__ = "buildings"

    id: Mapped[int] = mapped_column(
        BigInteger, Identity(always=False), primary_key=True
    )
    name: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    address: Mapped[str | None] = mapped_column(String(200), nullable=True)
    city: Mapped[str | None] = mapped_column(String(100), nullable=True)
    country: Mapped[str | None] = mapped_column(String(100), nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    floors: Mapped[list[Floor]] = relationship(
        back_populates="building",
        cascade="all, delete-orphan",
        order_by="Floor.level",
    )


class Floor(Base):
    """One floor of a building."""

    __tablename__ = "floors"

    id: Mapped[int] = mapped_column(
        BigInteger, Identity(always=False), primary_key=True
    )
    building_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("buildings.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    level: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    building: Mapped[Building] = relationship(back_populates="floors")
    zones: Mapped[list[Zone]] = relationship(
        back_populates="floor",
        cascade="all, delete-orphan",
        order_by="Zone.name",
    )


class Zone(Base):
    """One room / zone inside a floor, optionally bound to a sensor device.

    ``plan_x`` / ``plan_y`` / ``plan_w`` / ``plan_h`` place the zone on the
    interactive 2D floor plan (grid units).
    """

    __tablename__ = "zones"

    id: Mapped[int] = mapped_column(
        BigInteger, Identity(always=False), primary_key=True
    )
    floor_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("floors.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    device_id: Mapped[str | None] = mapped_column(String(50), nullable=True, index=True)
    plan_x: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    plan_y: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    plan_w: Mapped[int] = mapped_column(Integer, nullable=False, default=1, server_default="1")
    plan_h: Mapped[int] = mapped_column(Integer, nullable=False, default=1, server_default="1")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    floor: Mapped[Floor] = relationship(back_populates="zones")
    equipment: Mapped[list[Equipment]] = relationship(
        back_populates="zone",
        cascade="all, delete-orphan",
        order_by="Equipment.name",
    )


class Equipment(Base):
    """A monitored piece of equipment inside a zone."""

    __tablename__ = "equipment"

    id: Mapped[int] = mapped_column(
        BigInteger, Identity(always=False), primary_key=True
    )
    zone_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("zones.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    type: Mapped[str] = mapped_column(String(20), nullable=False)  # AC | Light | Computer | Other
    nominal_power_kw: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    current_power_kw: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    status: Mapped[str] = mapped_column(
        String(10), nullable=False, default="online", server_default="online", index=True
    )
    health_score: Mapped[int] = mapped_column(
        Integer, nullable=False, default=100, server_default="100"
    )
    icon: Mapped[str] = mapped_column(String(50), nullable=False, default="Zap", server_default="Zap")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    zone: Mapped[Zone] = relationship(back_populates="equipment")

