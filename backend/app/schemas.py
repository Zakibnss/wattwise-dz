"""Pydantic v2 schemas for API responses and MQTT ingestion."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class ReadingIngest(BaseModel):
    """Payload accepted on the MQTT topic ``wattwise/+/data``."""

    model_config = ConfigDict(extra="ignore")

    device_id: str = Field(min_length=1, max_length=50)
    voltage: float | None = None
    current: float | None = None
    power: float | None = None
    energy_kwh: float | None = None
    fan_current: float | None = None
    temperature: float | None = None
    humidity: float | None = None
    lux: float | None = None
    occupancy: int | None = Field(default=None, ge=0, le=1)


class ReadingRead(ReadingIngest):
    """A persisted reading returned by the REST API."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    timestamp: datetime
    created_at: datetime


class AlertRead(BaseModel):
    """A persisted alert returned by the REST API (V3 workflow-aware)."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    device_id: str
    timestamp: datetime
    type: str | None = None
    severity: str | None = None
    message: str | None = None
    cause: str | None = None
    confidence: float | None = None
    resolved: bool
    # V3 action workflow.
    stage: str = "DETECTED"
    is_demo: bool = False
    equipment_id: int | None = None
    analysis: str | None = None
    proposed_action: str | None = None
    estimated_savings_kwh: float | None = None
    analyzed_at: datetime | None = None
    proposed_at: datetime | None = None
    approved_at: datetime | None = None
    executed_at: datetime | None = None
    verified_at: datetime | None = None
    created_at: datetime


class StatsSummary(BaseModel):
    """Aggregated KPIs for a device over a rolling time window."""

    device_id: str | None = None
    period_hours: int
    avg_power_w: float | None = None
    max_power_w: float | None = None
    total_energy_kwh: float = 0.0
    alert_count: int = 0
    occupancy_ratio: float | None = None


class HealthResponse(BaseModel):
    """Health probe payload."""

    status: str
    database: str
    mqtt: str


class ForecastPrediction(BaseModel):
    """One hourly step of the 24-hour power forecast."""

    hour_offset: int = Field(ge=1, le=24)
    predicted_power: float = Field(ge=0)
    predicted_energy_kwh: float = Field(ge=0)
    confidence_lower: float = Field(ge=0)
    confidence_upper: float = Field(ge=0)


class ForecastResponse(BaseModel):
    """Response body of ``GET /api/forecast/next24h``."""

    status: str = "ok"
    device_id: str
    generated_at: datetime
    predictions: list[ForecastPrediction]


class AlertExplanation(BaseModel):
    """Deterministic, human-readable explanation of one alert."""

    reason: str
    evidence: dict[str, Any]
    recommended_action: str
    estimated_savings_kwh_per_day: float | None = None


class ModelRunRead(BaseModel):
    """Persisted training metrics returned by ``GET /api/models``."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    model_name: str
    trained_at: datetime
    mae: float | None = None
    rmse: float | None = None
    r2: float | None = None
    n_samples: int | None = None
    notes: str | None = None


class ModelStatus(BaseModel):
    """Availability and metrics of one trained model."""

    name: str
    loaded: bool
    path: str
    metrics: dict[str, Any] | None = None


class ModelsResponse(BaseModel):
    """Response body of ``GET /api/models``."""

    models: dict[str, ModelStatus]
    last_training_run: ModelRunRead | None = None


class SavingsCreate(BaseModel):
    """Payload for ``POST /api/savings``."""

    alert_id: int
    device_id: str = Field(min_length=1, max_length=50)
    action_applied: str = Field(min_length=1)
    baseline_kwh: float = Field(ge=0)
    actual_kwh: float = Field(ge=0)


class SavingsItem(BaseModel):
    """One savings record returned by the API."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    alert_id: int | None = None
    device_id: str
    timestamp: datetime
    action_applied: str
    baseline_kwh: float
    actual_kwh: float
    saved_kwh: float
    saved_percent: float
    confidence: float | None = None


class SavingsSummary(BaseModel):
    """Response body of ``GET /api/savings/summary``."""

    status: str = "ok"
    device_id: str | None = None
    period_from: datetime
    period_to: datetime
    total_saved_kwh: float = 0.0
    total_saved_dzd: float = 0.0
    count: int = 0
    items: list[SavingsItem] = []


# ---------------------------------------------------------------------------
# Feature 1: Wattwise Score (Diagnostic Énergétique)
# ---------------------------------------------------------------------------

class WattwiseScore(BaseModel):
    """Global energy efficiency grade (A-F) computed from alerts and eco mode."""

    score: int = Field(ge=0, le=100)
    grade: str = Field(min_length=1, max_length=1)
    trend: str


# ---------------------------------------------------------------------------
# Feature 2: Top Consommateurs (Wall of Shame)
# ---------------------------------------------------------------------------

class TopConsumer(BaseModel):
    """One ranked energy-consuming device/zone."""

    name: str
    power_kw: float
    pct: float


class TopConsumersResponse(BaseModel):
    """Response body of ``GET /api/stats/top-consumers``."""

    consumers: list[TopConsumer]


# ---------------------------------------------------------------------------
# Feature 5: Comparaison avec les Voisins (Benchmarking)
# ---------------------------------------------------------------------------

class BenchmarkResponse(BaseModel):
    """Response body of ``GET /api/stats/benchmark``."""

    your_consumption: float
    neighborhood_avg: float
    percentage: float


# ---------------------------------------------------------------------------
# Feature 3: Mode Vacances
# ---------------------------------------------------------------------------

class VacationModeRequest(BaseModel):
    enabled: bool | None = None


class VacationModeResponse(BaseModel):
    vacation_mode: bool
    message: str


# ---------------------------------------------------------------------------
# Advanced PV monitoring, diagnostics and energy optimization
# ---------------------------------------------------------------------------

class PvReadingPoint(BaseModel):
    """One advanced photovoltaic measurement returned by the API."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    device_id: str
    timestamp: datetime
    dc_voltage: float | None = None
    dc_current: float | None = None
    dc_power: float | None = None
    ac_power: float | None = None
    irradiance: float | None = None
    panel_temperature: float | None = None
    ambient_temperature: float | None = None
    expected_power: float | None = None
    actual_power: float | None = None
    panel_area: float | None = None
    panel_efficiency: float | None = None
    inverter_efficiency: float | None = None
    inverter_temperature: float | None = None
    inverter_status: str | None = None
    inverter_dc_input_power: float | None = None
    inverter_ac_output_power: float | None = None
    data_source: str = "simulator"


class PvDetailedResponse(BaseModel):
    """Response body of ``GET /api/solar/detailed``."""

    device_id: str
    data_available: bool
    latest: PvReadingPoint | None = None
    history: list[PvReadingPoint] = []
    expected_power_w: float | None = None
    actual_power_w: float | None = None
    deviation_w: float | None = None
    deviation_percent: float | None = None
    data_source: str | None = None
    last_update: datetime | None = None
    is_stale: bool = False
    resolution_minutes: int = 0


class PvFaultRead(BaseModel):
    """One persistent PV/inverter diagnostic."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    device_id: str
    fault_type: str
    severity: str
    status: str
    message: str
    explanation: str | None = None
    recommended_action: str | None = None
    confidence: float | None = None
    is_confirmed: bool = False
    occurrences: int = 1
    first_detected_at: datetime
    last_detected_at: datetime
    resolved_at: datetime | None = None


class PvFaultsResponse(BaseModel):
    """Response body of ``GET /api/solar/faults``."""

    device_id: str
    data_available: bool
    health_score: int | None = None
    health_status: str
    health_label: str
    active_faults: list[PvFaultRead] = []
    history: list[PvFaultRead] = []
    critical_count: int = 0
    warning_count: int = 0
    methodology: str
    last_update: datetime | None = None
    is_stale: bool = False


class InverterEfficiencyPoint(BaseModel):
    """One point of the inverter efficiency history."""

    timestamp: datetime
    efficiency_percent: float


class InverterStatusResponse(BaseModel):
    """Response body of ``GET /api/solar/inverter-status``."""

    device_id: str
    data_available: bool
    operating_status: str | None = None
    efficiency_percent: float | None = None
    temperature_c: float | None = None
    dc_input_power_w: float | None = None
    ac_output_power_w: float | None = None
    average_efficiency_percent: float | None = None
    degraded: bool = False
    efficiency_history: list[InverterEfficiencyPoint] = []
    warnings: list[PvFaultRead] = []
    recommendations: list[str] = []
    last_update: datetime | None = None
    data_availability_message: str


class SolarOptimizationResponse(BaseModel):
    """Response body of ``GET /api/solar/optimization``."""

    solar_used_kwh: float
    battery_used_kwh: float
    grid_used_kwh: float
    unused_solar_kwh: float
    battery_charge_kwh: float = 0.0
    exported_kwh: float = 0.0
    grid_charge_kwh: float = 0.0
    battery_level_percent: float
    estimated_daily_savings_dzd: float
    estimated_savings_percent: float
    baseline_cost_dzd: float
    optimized_cost_dzd: float
    recommendation_text: str
    optimization_status: str
    strategy: str = "unknown"
    forecast_used: bool = False
    battery_simulated: bool = True
    tariff_dzd_per_kwh: float = 0.0
    suggested_charge_hours: list[int] = []
    suggested_discharge_hours: list[int] = []
    assumptions: list[str] = []


class SolarIngest(BaseModel):
    """Payload accepted on the optional MQTT topic ``wattwise/+/solar``."""

    model_config = ConfigDict(extra="ignore")

    device_id: str = Field(min_length=1, max_length=50)
    dc_voltage: float | None = None
    dc_current: float | None = None
    dc_power: float | None = None
    ac_power: float | None = None
    irradiance: float | None = None
    panel_temperature: float | None = None
    ambient_temperature: float | None = None
    panel_area: float | None = Field(default=None, gt=0)
    panel_efficiency: float | None = Field(default=None, gt=0, le=1.5)
    inverter_efficiency: float | None = None
    inverter_temperature: float | None = None
    inverter_status: str | None = None
    inverter_dc_input_power: float | None = None
    inverter_ac_output_power: float | None = None
    data_source: str = Field(default="mqtt", max_length=20)


# ---------------------------------------------------------------------------
# V3 — Building -> Floor -> Zone -> Equipment hierarchy
# ---------------------------------------------------------------------------

VALID_EQUIPMENT_STATUS = ("online", "warning", "alert", "offline")
VALID_EQUIPMENT_TYPES = ("AC", "Light", "Computer", "Other")


class EquipmentRead(BaseModel):
    """One monitored piece of equipment."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    zone_id: int
    name: str
    type: str
    nominal_power_kw: float
    current_power_kw: float
    status: str = "online"
    health_score: int = 100
    icon: str = "Zap"
    created_at: datetime


class ZoneRead(BaseModel):
    """One zone with its equipment list."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    floor_id: int
    name: str
    device_id: str | None = None
    plan_x: int = 0
    plan_y: int = 0
    plan_w: int = 1
    plan_h: int = 1
    equipment: list[EquipmentRead] = []


class FloorRead(BaseModel):
    """One floor with its zones."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    building_id: int
    name: str
    level: int
    zones: list[ZoneRead] = []


class BuildingRead(BaseModel):
    """One building."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    address: str | None = None
    city: str | None = None
    country: str | None = None
    description: str | None = None
    created_at: datetime


class BuildingTree(BuildingRead):
    """Nested building hierarchy: floors -> zones -> equipment."""

    floors: list[FloorRead] = []


class BuildingsResponse(BaseModel):
    """Response body of ``GET /api/buildings``."""

    status: str = "ok"
    buildings: list[BuildingRead] = []


class EquipmentSimulateResponse(BaseModel):
    """Response body of ``POST /api/equipment/simulate``."""

    status: str = "ok"
    updated: int
    equipment: list[EquipmentRead]


# ---------------------------------------------------------------------------
# V3 — Six-stage action workflow
# ---------------------------------------------------------------------------

WORKFLOW_STAGES = (
    "DETECTED",
    "ANALYSED",
    "PROPOSED",
    "APPROVED",
    "EXECUTED",
    "VERIFIED",
)
WORKFLOW_STAGE_LABELS = {
    "DETECTED": "Détecté",
    "ANALYSED": "Analysé",
    "PROPOSED": "Proposé",
    "APPROVED": "Approuvé",
    "EXECUTED": "Exécuté",
    "VERIFIED": "Vérifié",
}


class WorkflowStageCount(BaseModel):
    """Counter for one workflow stage."""

    stage: str
    label: str
    count: int


class WorkflowResponse(BaseModel):
    """Response body of ``GET /api/actions/workflow``."""

    stages: list[WorkflowStageCount]
    total_active: int


class ActionTransitionResponse(BaseModel):
    """Response body of a stage transition endpoint."""

    status: str = "ok"
    alert_id: int
    stage: str
    stage_label: str
    message: str
    saved_kwh: float | None = None
    saved_dzd: float | None = None


class ActionCreateRequest(BaseModel):
    """Payload for ``POST /api/actions`` (create an action from equipment)."""

    equipment_id: int
    message: str | None = None
    severity: str = Field(default="HIGH", max_length=10)
    type: str = Field(default="EQUIPMENT_MALFUNCTION", max_length=50)


class ActionProposeRequest(BaseModel):
    """Payload for ``POST /api/alerts/{id}/propose``."""

    proposed_action: str = Field(min_length=3)
    estimated_savings_kwh: float | None = Field(default=None, ge=0)


# ---------------------------------------------------------------------------
# V3 — WATTY investigation (explicable AI)
# ---------------------------------------------------------------------------


class InvestigationHypothesis(BaseModel):
    """One WATTY investigation hypothesis."""

    cause: str
    confidence: int = Field(ge=0, le=100)
    evidence: list[str] = []
    missing_data: list[str] = []
    recommended_action: str


class InvestigationResult(BaseModel):
    """Response body of ``POST /api/watty/investigate``."""

    status: str = "ok"
    alert_id: int
    hypotheses: list[InvestigationHypothesis]
    summary: str | None = None
    source: str = "rules"  # "llm" | "rules"
    generated_at: datetime


class InvestigateRequest(BaseModel):
    """Payload for ``POST /api/watty/investigate``."""

    alert_id: int


# ---------------------------------------------------------------------------
# V3 — Energy Brain insights
# ---------------------------------------------------------------------------


class Insight(BaseModel):
    """One Energy Brain recommendation."""

    rule_id: str
    title: str
    description: str
    severity: str = "info"  # info | warning | critical
    confidence: int = Field(default=100, ge=0, le=100)
    category: str = "general"
    recommended_action: str | None = None
    zone_id: int | None = None
    equipment_id: int | None = None
    data: dict[str, Any] = {}


class InsightsResponse(BaseModel):
    """Response body of ``GET /api/intelligence/insights``."""

    status: str = "ok"
    generated_at: datetime
    insights: list[Insight]
    briefing: str | None = None
    critical_count: int = 0
    warning_count: int = 0


# ---------------------------------------------------------------------------
# V3 — Jury demo mode
# ---------------------------------------------------------------------------


class DemoTriggerResponse(BaseModel):
    """Response body of ``POST /api/demo/trigger``."""

    status: str = "ok"
    message: str
    alert_id: int | None = None
    equipment: EquipmentRead | None = None


class DemoResetResponse(BaseModel):
    """Response body of ``POST /api/demo/reset``."""

    status: str = "ok"
    message: str
    resolved_alerts: int = 0
    reset_equipment: int = 0


class DemoStatusResponse(BaseModel):
    """Response body of ``GET /api/demo/status``."""

    active: bool
    alert_ids: list[int] = []
    equipment_id: int | None = None
