"""Deterministic, template-based explanations for every alert type.

No generative model is involved: the explainer turns an alert plus its sensor
context into a stable French ``reason`` / ``evidence`` / ``action`` / savings
payload. The payload is stored as JSON in ``alerts.cause`` so the API can serve
it later without re-reading the original reading.
"""

from __future__ import annotations

import json
from datetime import datetime
from typing import TYPE_CHECKING, Any, Mapping

if TYPE_CHECKING:  # pragma: no cover - typing only
    from app.models import Alert

#: Default number of daily running hours used when estimating savings.
DEFAULT_HOURS = 8.0
#: Nominal voltage used to convert a fan current into power.
NOMINAL_VOLTAGE = 220.0

_EXPLANATION_KEYS = {
    "reason",
    "evidence",
    "recommended_action",
    "estimated_savings_kwh_per_day",
}


def _field(alert: Alert | Mapping[str, Any], key: str) -> Any:
    """Read a field from an ORM alert or a plain mapping."""
    if isinstance(alert, Mapping):
        return alert.get(key)
    return getattr(alert, key, None)


def _safe_float(value: Any) -> float | None:
    """Convert a value to float, returning ``None`` when not numeric."""
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _json_safe(value: Any) -> Any:
    """Convert datetimes to ISO strings so evidence is JSON serialisable."""
    if isinstance(value, datetime):
        return value.isoformat()
    return value


def _determine_physical_cause(
    power: float | None,
    temperature: float | None,
    hour: int | None,
    residual: float | None = None,
) -> str:
    """Diagnose the specific physical cause for OVERCONSUMPTION_VS_FORECAST anomalies.

    Rules (Fault Detection & Diagnosis):
    - If night consumption is high (20h - 06h): 'Éclairage ou appareil oublié'.
    - If temperature is high (> 25°C) and power is high: 'Climatisation surchargée'.
    - If power is high but temperature is normal (<= 25°C): 'Équipement défaillant'.
    """
    is_night = hour is not None and (hour >= 20 or hour < 6)
    is_power_high = (power is not None and power > 80.0) or (residual is not None and residual > 20.0)
    is_temp_high = temperature is not None and temperature > 25.0

    if is_night and is_power_high:
        return "Éclairage ou appareil oublié"
    if is_temp_high and is_power_high:
        return "Climatisation surchargée"
    if is_power_high and (temperature is None or not is_temp_high):
        return "Équipement défaillant"

    # Default fallback when power/residual was flagged
    if is_temp_high:
        return "Climatisation surchargée"
    if is_night:
        return "Éclairage ou appareil oublié"
    return "Équipement défaillant"


def _existing_explanation(cause: Any, alert_type: str = "") -> dict[str, Any] | None:
    """Return a previously stored explanation found in ``cause``, enriching if needed."""
    if not isinstance(cause, str) or not cause.strip().startswith("{"):
        return None
    try:
        parsed = json.loads(cause)
    except json.JSONDecodeError:
        return None
    if isinstance(parsed, dict) and _EXPLANATION_KEYS.issubset(parsed.keys()):
        # If it's an overconsumption alert and physical_cause is missing in evidence, compute it
        evidence = parsed.get("evidence")
        if isinstance(evidence, dict) and alert_type == "OVERCONSUMPTION_VS_FORECAST":
            if "physical_cause" not in evidence:
                power = _safe_float(evidence.get("power") or evidence.get("power_w"))
                temperature = _safe_float(evidence.get("temperature"))
                residual = _safe_float(evidence.get("residual"))
                hour = None
                ts = evidence.get("timestamp")
                if isinstance(ts, str):
                    try:
                        hour = datetime.fromisoformat(ts.replace("Z", "+00:00")).hour
                    except Exception:
                        pass
                physical = _determine_physical_cause(power, temperature, hour, residual)
                evidence["physical_cause"] = physical
                evidence["cause"] = physical
        return parsed
    return None


def explain_alert(
    alert: Alert | Mapping[str, Any],
    context: Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    """Build a deterministic explanation for one alert with FDD cause diagnosis.

    Args:
        alert: Persisted :class:`app.models.Alert` or an alert dictionary.
        context: Optional sensor context captured at detection time (power,
            fan current, occupancy, lux, residual, temperature, history, ...).

    Returns:
        A dict with ``reason``, ``evidence``, ``recommended_action`` and
        ``estimated_savings_kwh_per_day``. If ``alert.cause`` already contains
        a stored explanation JSON, it is returned (enriched with physical cause).
    """
    alert_type = str(_field(alert, "type") or "UNKNOWN")
    stored = _existing_explanation(_field(alert, "cause"), alert_type=alert_type)
    if stored is not None:
        return stored

    severity = _field(alert, "severity")
    message = _field(alert, "message")
    confidence = _safe_float(_field(alert, "confidence"))

    raw_context = dict(context or {})
    evidence: dict[str, Any] = {
        "alert_type": alert_type,
        "severity": severity,
        "confidence": confidence,
        "device_id": _field(alert, "device_id"),
        "timestamp": _json_safe(_field(alert, "timestamp")),
    }
    for key, value in raw_context.items():
        if value is not None and key != "history":
            evidence[key] = _json_safe(value)

    power = _safe_float(raw_context.get("power"))
    fan_current = _safe_float(raw_context.get("fan_current"))
    lux = _safe_float(raw_context.get("lux"))
    residual = _safe_float(raw_context.get("residual"))
    temperature = _safe_float(raw_context.get("temperature"))

    # Extract hour from timestamp or context
    hour: int | None = None
    ts = raw_context.get("timestamp") or _field(alert, "timestamp")
    if isinstance(ts, datetime):
        hour = ts.hour
    elif isinstance(ts, str):
        try:
            hour = datetime.fromisoformat(ts.replace("Z", "+00:00")).hour
        except Exception:
            pass
    if hour is None and raw_context.get("hour") is not None:
        try:
            hour = int(raw_context["hour"])
        except (ValueError, TypeError):
            pass

    savings: float | None = None

    if alert_type == "FAN_NO_OCCUPANCY":
        reason = "Ventilateur allumé sans occupant"
        recommended_action = "Relier au capteur de présence"
        if fan_current is not None:
            savings = fan_current * NOMINAL_VOLTAGE * DEFAULT_HOURS / 1000.0
    elif alert_type == "HIGH_POWER_NO_OCCUPANCY":
        reason = "Consommation élevée alors que la salle est inoccupée"
        recommended_action = "Identifier les équipements actifs"
        if power is not None:
            savings = power * (DEFAULT_HOURS / 2.0) / 1000.0
    elif alert_type in {"LIGHTING_WASTE", "LIGHTING_CANDIDATE"}:
        reason = "Éclairage potentiellement inutile"
        recommended_action = "Éteindre ou asservir à la luminosité naturelle"
        if power is not None:
            savings = power * DEFAULT_HOURS / 1000.0
    elif alert_type == "OVERCONSUMPTION_VS_FORECAST":
        physical_cause = _determine_physical_cause(
            power=power,
            temperature=temperature,
            hour=hour,
            residual=residual,
        )
        reason = f"Surconsommation par rapport à la prévision XGBoost : {physical_cause}"
        recommended_action = "Inspecter l'équipement le plus énergivore"
        evidence["physical_cause"] = physical_cause
        evidence["cause"] = physical_cause
        if residual is None and message:
            evidence["message"] = message
        if residual is not None:
            savings = max(0.0, residual) * 2.0 / 1000.0
    elif alert_type == "ISOLATION_FOREST_ANOMALY":
        reason = "Comportement inhabituel détecté par Isolation Forest"
        recommended_action = "Vérifier le comportement inhabituel"
    elif alert_type == "PEAK_ALERT":
        reason = "Pic de consommation détecté en période de tension réseau"
        recommended_action = "Délestage immédiat des charges non essentielles"
        evidence["physical_cause"] = "Pic d'appel de puissance"
        if power is not None:
            savings = power * 2.0 / 1000.0
    else:
        reason = str(message or "Alerte à analyser")
        recommended_action = "Analyser manuellement le comportement détecté"

    evidence = {key: value for key, value in evidence.items() if value is not None}
    if lux is not None:
        evidence.setdefault("lux", lux)
    if power is not None:
        evidence.setdefault("power_w", power)
    if temperature is not None:
        evidence.setdefault("temperature", temperature)

    return {
        "reason": reason,
        "evidence": evidence,
        "recommended_action": recommended_action,
        "estimated_savings_kwh_per_day": (
            round(savings, 4) if savings is not None else None
        ),
    }
