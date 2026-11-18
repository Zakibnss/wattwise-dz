"""Deterministic solar / battery / grid energy-source optimizer.

Methodology
-----------
The optimizer is intentionally **rule-based** and fully deterministic. It is
the first step of an extensible architecture: a future MILP or reinforcement
learning controller can replace :func:`optimize` without changing the API.

Inputs are validated with Pydantic (no negative energy, SoC within
``[min_soc, max_soc]``, positive battery capacity, round-trip efficiency in
``(0, 1]``). Allocation always respects:

* ``solar_used + battery_used + grid_used == consumption``
* ``battery_charge + export + unused_solar == solar surplus``
* battery energy between the configured reserve and maximum SoC
* charge/discharge power limits over the optimisation horizon

When hourly production and consumption forecasts are supplied, the engine
simulates each hour chronologically, charges from solar surplus and discharges
during expensive or deficit hours while keeping a reserve for the next day.
Otherwise it uses an aggregate daily balance.

All costs are **estimates** based on the configured tariff. They are not
verified savings: no measured baseline or billing reconciliation is implied.
"""

from __future__ import annotations

import math
from typing import Any, Literal

from pydantic import BaseModel, Field, model_validator


class TimeOfUseTariff(BaseModel):
    """One optional time-of-use tariff window (local hours)."""

    start_hour: int = Field(ge=0, le=23)
    end_hour: int = Field(ge=1, le=24)
    tariff_dzd_per_kwh: float = Field(ge=0)

    @model_validator(mode="after")
    def _check_window(self) -> "TimeOfUseTariff":
        if self.end_hour <= self.start_hour:
            raise ValueError("end_hour must be greater than start_hour")
        return self

    def covers(self, hour: int) -> bool:
        """Return whether the given local hour falls in this window."""
        return self.start_hour <= hour < self.end_hour


class OptimizationInputs(BaseModel):
    """Validated inputs of the energy-source optimization problem."""

    solar_kwh: float = Field(default=0.0, ge=0)
    consumption_kwh: float = Field(default=0.0, ge=0)

    battery_capacity_kwh: float = Field(default=10.0, gt=0)
    battery_soc_percent: float = Field(default=62.0, ge=0, le=100)
    battery_min_soc_percent: float = Field(default=20.0, ge=0, le=100)
    battery_max_soc_percent: float = Field(default=95.0, ge=0, le=100)
    battery_charge_limit_kw: float = Field(default=3.0, ge=0)
    battery_discharge_limit_kw: float = Field(default=3.0, ge=0)
    battery_round_trip_efficiency: float = Field(default=0.90, gt=0, le=1)

    grid_tariff_dzd_per_kwh: float = Field(default=5.5, ge=0)
    grid_export_enabled: bool = False
    grid_export_tariff_dzd_per_kwh: float = Field(default=0.0, ge=0)
    allow_grid_charging: bool = False

    horizon_hours: float = Field(default=24.0, gt=0, le=48)

    solar_forecast_kwh: list[float] | None = None
    consumption_forecast_kwh: list[float] | None = None
    time_of_use_tariffs: list[TimeOfUseTariff] | None = None

    @model_validator(mode="after")
    def _check_consistency(self) -> "OptimizationInputs":
        if self.battery_min_soc_percent >= self.battery_max_soc_percent:
            raise ValueError("battery_min_soc_percent must be below battery_max_soc_percent")
        if self.battery_soc_percent < self.battery_min_soc_percent:
            raise ValueError("battery_soc_percent cannot be below the minimum reserve")
        if self.battery_soc_percent > self.battery_max_soc_percent:
            raise ValueError("battery_soc_percent cannot exceed the maximum SoC")
        if self.solar_forecast_kwh is not None or self.consumption_forecast_kwh is not None:
            if self.solar_forecast_kwh is None or self.consumption_forecast_kwh is None:
                raise ValueError(
                    "solar_forecast_kwh and consumption_forecast_kwh must be provided together"
                )
            if len(self.solar_forecast_kwh) != len(self.consumption_forecast_kwh):
                raise ValueError("solar and consumption forecasts must have the same length")
            if any(v < 0 for v in self.solar_forecast_kwh + self.consumption_forecast_kwh):
                raise ValueError("forecast values cannot be negative")
        return self

    def tariff_for_hour(self, hour: int) -> float:
        """Return the grid import tariff for one local hour."""
        if self.time_of_use_tariffs:
            for window in self.time_of_use_tariffs:
                if window.covers(hour % 24):
                    return window.tariff_dzd_per_kwh
        return self.grid_tariff_dzd_per_kwh


def _round(value: float, digits: int = 3) -> float:
    return round(float(value), digits)


def _empty_result(
    inputs: OptimizationInputs,
    status: str,
    recommendation: str,
) -> dict[str, Any]:
    """Return a fully-shaped result with zero allocation."""
    return {
        "solar_used_kwh": 0.0,
        "battery_used_kwh": 0.0,
        "grid_used_kwh": 0.0,
        "unused_solar_kwh": 0.0,
        "battery_charge_kwh": 0.0,
        "exported_kwh": 0.0,
        "battery_level_percent": _round(inputs.battery_soc_percent, 1),
        "estimated_daily_savings_dzd": 0.0,
        "estimated_savings_percent": 0.0,
        "baseline_cost_dzd": 0.0,
        "optimized_cost_dzd": 0.0,
        "recommendation_text": recommendation,
        "optimization_status": status,
        "strategy": "no_data",
        "forecast_used": False,
        "suggested_charge_hours": [],
        "suggested_discharge_hours": [],
        "assumptions": [],
    }


def optimize(inputs: OptimizationInputs | dict[str, Any]) -> dict[str, Any]:
    """Solve the deterministic daily energy-source allocation problem.

    Args:
        inputs: :class:`OptimizationInputs` instance or a compatible mapping.

    Returns:
        A JSON-serialisable dict with the allocation, estimated cost/savings,
        the final battery level and a human-readable recommendation.

    Raises:
        pydantic.ValidationError: When an input violates a physical constraint.
    """
    if not isinstance(inputs, OptimizationInputs):
        inputs = OptimizationInputs.model_validate(inputs)

    if inputs.consumption_kwh <= 0 and inputs.solar_kwh <= 0:
        return _empty_result(
            inputs,
            "no_data",
            "Aucune donnée de consommation ou de production solaire n'est "
            "disponible : impossible de recommander une stratégie fiable.",
        )

    forecast_mode = (
        inputs.solar_forecast_kwh is not None
        and inputs.consumption_forecast_kwh is not None
        and len(inputs.solar_forecast_kwh) >= 2
    )

    if forecast_mode:
        result = _optimize_hourly(inputs)
    else:
        result = _optimize_aggregate(inputs)

    if inputs.solar_kwh <= 0 and not forecast_mode:
        result["optimization_status"] = "no_solar_production"
    return result


def _battery_state(inputs: OptimizationInputs) -> tuple[float, float, float, float]:
    """Return ``(stored_kwh, usable_capacity_kwh, charge_limit, discharge_limit)``.

    ``stored_kwh`` is energy above the minimum reserve, at the battery
    terminals. Usable capacity is measured between the configured min and max
    SoC.
    """
    usable_capacity = inputs.battery_capacity_kwh * (
        inputs.battery_max_soc_percent - inputs.battery_min_soc_percent
    ) / 100.0
    stored = inputs.battery_capacity_kwh * (
        inputs.battery_soc_percent - inputs.battery_min_soc_percent
    ) / 100.0
    stored = max(0.0, min(usable_capacity, stored))
    charge_limit = inputs.battery_charge_limit_kw * inputs.horizon_hours
    discharge_limit = inputs.battery_discharge_limit_kw * inputs.horizon_hours
    return stored, usable_capacity, charge_limit, discharge_limit


def _recommendation_text(
    scenario: str,
    inputs: OptimizationInputs,
    solar_used: float,
    battery_used: float,
    grid_used: float,
    unused: float,
    exported: float,
    savings: float,
    charge_hours: list[int],
    discharge_hours: list[int],
) -> str:
    """Build a French explanation grounded in the computed allocation."""
    parts: list[str] = []

    if scenario == "surplus":
        parts.append(
            f"La production solaire couvre la consommation ({solar_used:.2f} kWh). "
            "L'excédent charge d'abord la batterie"
        )
        if exported > 0:
            parts.append(f" puis {exported:.2f} kWh sont exportés vers le réseau.")
        else:
            parts.append(
                f" ; {unused:.2f} kWh de surplus restent non valorisés "
                "(export réseau désactivé)."
            )
    elif scenario == "deficit":
        parts.append(
            f"Le solaire couvre {solar_used:.2f} kWh et la batterie fournit "
            f"{battery_used:.2f} kWh. Le réseau complète {grid_used:.2f} kWh."
        )
    elif scenario == "low_battery":
        parts.append(
            "Le niveau de batterie est proche de la réserve minimale : le "
            f"déchargement est évité et le réseau fournit {grid_used:.2f} kWh. "
            "La batterie est préservée pour les périodes plus favorables."
        )
    else:
        parts.append(
            f"Répartition estimée — solaire {solar_used:.2f} kWh, batterie "
            f"{battery_used:.2f} kWh, réseau {grid_used:.2f} kWh."
        )

    if charge_hours:
        parts.append(
            "Charge recommandée : "
            + ", ".join(f"{h:02d}h" for h in charge_hours)
            + " (production excédentaire / heures creuses)."
        )
    if discharge_hours:
        parts.append(
            "Décharge recommandée : "
            + ", ".join(f"{h:02d}h" for h in discharge_hours)
            + " (heures de consommation ou de tarif élevé)."
        )

    parts.append(
        f"Économie journalière estimée : {savings:.2f} DZD "
        f"(tarif configuré {inputs.grid_tariff_dzd_per_kwh:.2f} DZD/kWh). "
        "Estimation, non une économie vérifiée."
    )
    return " ".join(parts)


def _optimize_aggregate(inputs: OptimizationInputs) -> dict[str, Any]:
    """Aggregate daily balance used when no hourly forecast is available."""
    stored, usable_capacity, charge_limit, discharge_limit = _battery_state(inputs)
    sqrt_eff = math.sqrt(inputs.battery_round_trip_efficiency)

    solar = inputs.solar_kwh
    consumption = inputs.consumption_kwh

    solar_used = min(solar, consumption)
    deficit = max(0.0, consumption - solar_used)
    surplus = max(0.0, solar - solar_used)

    battery_used = 0.0
    low_battery = (
        inputs.battery_soc_percent
        <= inputs.battery_min_soc_percent + max(2.0, 0.05 * inputs.battery_max_soc_percent)
        or stored <= 0.0
    )
    if deficit > 0 and not low_battery:
        available = min(stored * sqrt_eff, discharge_limit)
        battery_used = min(deficit, max(0.0, available))
        stored -= min(stored, battery_used / sqrt_eff if sqrt_eff > 0 else battery_used)

    grid_used = max(0.0, deficit - battery_used)

    battery_charge = 0.0
    if surplus > 0 and charge_limit > 0 and usable_capacity > stored:
        headroom = max(0.0, usable_capacity - stored)
        battery_charge = min(surplus, charge_limit, headroom / sqrt_eff)
        stored += battery_charge * sqrt_eff
        surplus -= battery_charge

    exported = 0.0
    if surplus > 0 and inputs.grid_export_enabled:
        exported = surplus
    unused = max(0.0, surplus - exported)

    baseline_cost = consumption * inputs.grid_tariff_dzd_per_kwh
    optimized_cost = (
        grid_used * inputs.grid_tariff_dzd_per_kwh
        - exported * inputs.grid_export_tariff_dzd_per_kwh
    )
    optimized_cost = max(0.0, optimized_cost)
    savings = baseline_cost - optimized_cost
    savings_pct = (savings / baseline_cost * 100.0) if baseline_cost > 0 else 0.0

    final_soc = inputs.battery_min_soc_percent + (
        stored / inputs.battery_capacity_kwh * 100.0
        if inputs.battery_capacity_kwh > 0
        else 0.0
    )

    if low_battery and deficit > 0:
        scenario = "low_battery"
    elif surplus > 0 or battery_charge > 0:
        scenario = "surplus"
    else:
        scenario = "deficit"

    recommendation = _recommendation_text(
        scenario,
        inputs,
        solar_used,
        battery_used,
        grid_used,
        unused,
        exported,
        savings,
        [],
        [],
    )

    return {
        "solar_used_kwh": _round(solar_used),
        "battery_used_kwh": _round(battery_used),
        "grid_used_kwh": _round(grid_used),
        "unused_solar_kwh": _round(unused),
        "battery_charge_kwh": _round(battery_charge),
        "exported_kwh": _round(exported),
        "battery_level_percent": _round(min(100.0, max(0.0, final_soc)), 1),
        "estimated_daily_savings_dzd": _round(savings, 2),
        "estimated_savings_percent": _round(max(0.0, savings_pct), 1),
        "baseline_cost_dzd": _round(baseline_cost, 2),
        "optimized_cost_dzd": _round(optimized_cost, 2),
        "recommendation_text": recommendation,
        "optimization_status": "ok",
        "strategy": scenario,
        "forecast_used": False,
        "suggested_charge_hours": [],
        "suggested_discharge_hours": [],
        "assumptions": [
            "Bilan énergétique agrégé sur 24 h faute de courbe horaire.",
            f"Rendement aller-retour batterie : {inputs.battery_round_trip_efficiency:.0%}.",
            "Aucune hypothèse de tarif dynamique Sonelgaz : tarif configuré uniquement.",
        ],
    }


def _optimize_hourly(inputs: OptimizationInputs) -> dict[str, Any]:
    """Chronological hourly simulation using solar/consumption forecasts."""
    assert inputs.solar_forecast_kwh is not None
    assert inputs.consumption_forecast_kwh is not None

    solar_forecast = list(inputs.solar_forecast_kwh)
    consumption_forecast = list(inputs.consumption_forecast_kwh)
    hours = len(solar_forecast)

    stored, usable_capacity, _, _ = _battery_state(inputs)
    sqrt_eff = math.sqrt(inputs.battery_round_trip_efficiency)
    charge_limit_hourly = inputs.battery_charge_limit_kw
    discharge_limit_hourly = inputs.battery_discharge_limit_kw
    reserve_soc = inputs.battery_min_soc_percent

    total_solar = sum(solar_forecast)
    total_consumption = sum(consumption_forecast)
    rates = [inputs.tariff_for_hour(h) for h in range(hours)]
    sorted_rates = sorted(rates)
    median_rate = sorted_rates[len(sorted_rates) // 2] if sorted_rates else 0.0
    low_rate = sorted_rates[len(sorted_rates) // 4] if sorted_rates else 0.0

    solar_used = battery_used = grid_used = battery_charge = unused = exported = 0.0
    grid_charge_total = 0.0
    charge_hours: list[int] = []
    discharge_hours: list[int] = []
    baseline_cost = 0.0
    optimized_cost = 0.0

    for hour in range(hours):
        solar = solar_forecast[hour]
        consumption = consumption_forecast[hour]
        rate = rates[hour]
        baseline_cost += consumption * rate

        direct = min(solar, consumption)
        surplus = solar - direct
        deficit = consumption - direct
        solar_used += direct

        # Charge from solar surplus first (always economically free).
        if surplus > 0 and stored < usable_capacity:
            headroom = usable_capacity - stored
            charge = min(surplus, charge_limit_hourly, headroom / sqrt_eff)
            if charge > 0:
                stored += charge * sqrt_eff
                battery_charge += charge
                surplus -= charge
                if hour not in charge_hours:
                    charge_hours.append(hour)

        # Optional grid charging during cheap hours when reserve is low.
        if (
            inputs.allow_grid_charging
            and rate <= low_rate
            and stored < usable_capacity * 0.5
            and charge_limit_hourly > 0
        ):
            grid_charge = min(
                charge_limit_hourly,
                (usable_capacity - stored) / sqrt_eff,
            )
            if grid_charge > 0:
                stored += grid_charge * sqrt_eff
                battery_charge += grid_charge
                grid_charge_total += grid_charge
                optimized_cost += grid_charge * rate
                if hour not in charge_hours:
                    charge_hours.append(hour)

        # Discharge decision: future-aware + tariff-aware.
        if deficit > 0 and stored > 0:
            soc_now = reserve_soc + stored / inputs.battery_capacity_kwh * 100.0
            future_solar = sum(solar_forecast[hour + 1 :])
            future_consumption = sum(consumption_forecast[hour + 1 :])
            future_surplus = future_solar > future_consumption * 1.1
            expensive = rate >= median_rate
            near_reserve = soc_now <= reserve_soc + 8.0
            should_discharge = expensive or not future_surplus or not near_reserve
            if should_discharge:
                delivered = min(
                    deficit,
                    stored * sqrt_eff,
                    discharge_limit_hourly,
                )
                if delivered > 0:
                    stored -= delivered / sqrt_eff
                    battery_used += delivered
                    deficit -= delivered
                    if hour not in discharge_hours:
                        discharge_hours.append(hour)

        grid_used += deficit
        optimized_cost += deficit * rate

        if surplus > 0:
            if inputs.grid_export_enabled:
                exported += surplus
                optimized_cost -= surplus * inputs.grid_export_tariff_dzd_per_kwh
            else:
                unused += surplus

    optimized_cost = max(0.0, optimized_cost)
    savings = baseline_cost - optimized_cost
    savings_pct = (savings / baseline_cost * 100.0) if baseline_cost > 0 else 0.0

    final_soc = reserve_soc + (
        stored / inputs.battery_capacity_kwh * 100.0
        if inputs.battery_capacity_kwh > 0
        else 0.0
    )

    if total_solar > total_consumption:
        scenario = "surplus"
    elif inputs.battery_soc_percent <= reserve_soc + 5:
        scenario = "low_battery"
    else:
        scenario = "deficit"

    recommendation = _recommendation_text(
        scenario,
        inputs,
        solar_used,
        battery_used,
        grid_used,
        unused,
        exported,
        savings,
        charge_hours,
        discharge_hours,
    )

    return {
        "solar_used_kwh": _round(solar_used),
        "battery_used_kwh": _round(battery_used),
        "grid_used_kwh": _round(grid_used),
        "unused_solar_kwh": _round(unused),
        "battery_charge_kwh": _round(battery_charge),
        "exported_kwh": _round(exported),
        "battery_level_percent": _round(min(100.0, max(0.0, final_soc)), 1),
        "estimated_daily_savings_dzd": _round(savings, 2),
        "estimated_savings_percent": _round(max(0.0, savings_pct), 1),
        "baseline_cost_dzd": _round(baseline_cost, 2),
        "optimized_cost_dzd": _round(optimized_cost, 2),
        "recommendation_text": recommendation,
        "optimization_status": "ok",
        "strategy": scenario,
        "forecast_used": True,
        "grid_charge_kwh": _round(grid_charge_total),
        "suggested_charge_hours": sorted(charge_hours),
        "suggested_discharge_hours": sorted(discharge_hours),
        "assumptions": [
            "Prévisions horaires fournies par l'appelant (aucune donnée inventée).",
            f"Rendement aller-retour batterie : {inputs.battery_round_trip_efficiency:.0%}.",
            (
                "Tarifs horaires fournis (heures pleines / creuses)."
                if inputs.time_of_use_tariffs
                else "Tarif unique configuré, sans hypothèse de tarif Sonelgaz."
            ),
            "Économies estimées, non vérifiées par facturation.",
        ],
    }


__all__ = [
    "OptimizationInputs",
    "TimeOfUseTariff",
    "optimize",
]
