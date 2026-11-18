"""WATTWISE DZ configuration settings and logging setup."""

from __future__ import annotations

import logging
import os
from pathlib import Path

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict

_env_file = Path(__file__).resolve().parent.parent.parent / ".env"


class Settings(BaseSettings):
    """Application settings loaded from environment variables or .env file."""

    database_url: str = "postgresql+asyncpg://wattwise:wattwise_dev@postgres:5432/wattwise"
    test_database_url: str = "postgresql+asyncpg://wattwise:wattwise_dev@postgres:5432/wattwise_test"

    mqtt_broker_host: str = "mosquitto"
    mqtt_broker_port: int = 1883
    mqtt_topic: str = "wattwise/+/data"
    mqtt_solar_topic: str = "wattwise/+/solar"
    mqtt_keepalive: int = 60

    log_level: str = "INFO"
    dzd_per_kwh: float = 5.5

    # ------------------------------------------------------------------
    # Photovoltaic plant (advanced PV monitoring)
    # ------------------------------------------------------------------
    pv_device_id: str = "PV1"
    #: Total module area in m². 34 m² ≈ 6.5 kWc at 19.5 % efficiency.
    pv_panel_area_m2: float = 34.0
    #: Module conversion efficiency (0-1) at Standard Test Conditions.
    pv_panel_efficiency: float = 0.195
    #: Nominal plant peak power, used for display only.
    pv_peak_kw: float = 6.5
    #: Power temperature coefficient (per °C, negative for crystalline silicon).
    pv_temp_coefficient_per_c: float = -0.004
    #: Cell temperature at Standard Test Conditions.
    pv_stc_temperature_c: float = 25.0
    #: Nominal Operating Cell Temperature (°C) used to estimate cell temperature.
    pv_noct_c: float = 45.0
    #: Measurements older than this are flagged as stale (minutes).
    pv_stale_after_minutes: int = 30

    # ------------------------------------------------------------------
    # PV / inverter diagnostic thresholds (configurable, documented)
    # ------------------------------------------------------------------
    #: Actual power below this fraction of expected power is underperformance.
    pv_underperformance_ratio: float = 0.80
    #: Minimum irradiance (W/m²) before underperformance is evaluated.
    pv_min_irradiance_wm2: float = 500.0
    #: Minimum expected power (W) before underperformance is evaluated.
    pv_min_expected_power_w: float = 50.0
    #: Consecutive readings required before a persistent fault is raised.
    pv_consecutive_readings: int = 3
    #: Panel temperature threshold (°C).
    pv_max_panel_temperature_c: float = 70.0
    #: Inverter efficiency threshold (%), sustained over consecutive readings.
    pv_inverter_min_efficiency_pct: float = 90.0
    #: Inverter temperature threshold (°C).
    pv_inverter_max_temperature_c: float = 65.0
    #: Minimum minutes between two occurrences of the same active fault.
    pv_fault_renotify_minutes: int = 30

    # ------------------------------------------------------------------
    # Energy source optimizer (battery / grid / solar)
    # ------------------------------------------------------------------
    #: Battery usable capacity in kWh.
    battery_capacity_kwh: float = 10.0
    battery_min_soc_percent: float = 20.0
    battery_max_soc_percent: float = 95.0
    battery_charge_limit_kw: float = 3.0
    battery_discharge_limit_kw: float = 3.0
    #: Round-trip efficiency (0-1).
    battery_round_trip_efficiency: float = 0.90
    #: Default state of charge when no real BMS telemetry is available.
    battery_default_soc_percent: float = 62.0
    #: When True, the optimizer may recommend grid charging during cheap hours.
    battery_allow_grid_charging: bool = False
    #: Grid import tariff in DZD/kWh (existing documented default).
    grid_tariff_dzd_per_kwh: float = 5.5
    #: Grid export (feed-in) availability and tariff. Off by default: no
    #: verified Algerian feed-in tariff is assumed.
    grid_export_enabled: bool = False
    grid_export_tariff_dzd_per_kwh: float = 0.0
    #: Grid CO₂ emission factor (kg CO₂/kWh) used by the carbon report.
    grid_co2_factor_kg_per_kwh: float = 0.45

    groq_api_key: str = Field(
        default="",
        validation_alias=AliasChoices("groq_api_key", "GROQ_API_KEY"),
    )
    groq_model: str = Field(
        default="llama-3.3-70b-versatile",
        validation_alias=AliasChoices("groq_model", "GROQ_MODEL"),
    )

    model_config = SettingsConfigDict(
        env_file=(".env", "../.env", str(_env_file)),
        env_file_encoding="utf-8",
        extra="ignore",
    )


settings = Settings()


def get_settings() -> Settings:
    """Return the global Settings instance."""
    return settings


def setup_logging(log_level: str = "INFO") -> None:
    """Configure root logging."""
    logging.basicConfig(
        level=getattr(logging, log_level.upper(), logging.INFO),
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    )
