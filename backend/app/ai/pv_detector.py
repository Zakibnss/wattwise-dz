"""Photovoltaic diagnostics: expected power, inverter efficiency and fault rules.

Scope and honesty constraints
-----------------------------
Every diagnostic produced here is a **rule-based anomaly**, not a confirmed
physical fault. Thermal imaging, on-site inspection or manufacturer telemetry
are required before claiming a hot-spot, dust layer or inverter failure. The
``is_confirmed`` flag therefore stays ``False`` unless an external inspection
explicitly confirms a fault.

Health score methodology
------------------------
The PV health score starts at 100 and subtracts one penalty per *active*
fault::

    penalty = base_severity_penalty × persistence_factor
    persistence_factor = 1 + 0.1 × min(occurrences - 1, 4)

``base_severity_penalty`` is **8 points** for a warning and **20 points** for a
critical fault. The persistence factor saturates at 1.4 after five consecutive
detections, so a single transient warning costs 8 points while a long-running
critical inverter fault costs up to 28. The result is clamped to ``[0, 100]``
and mapped to:

* ``normal``   : score ≥ 85 (green)
* ``warning``  : 60 ≤ score < 85 (amber)
* ``critical`` : score < 60 (red)
* ``unknown``  : no PV measurement available (score is ``None``)

No randomness is involved: the same diagnostics always yield the same score.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Iterable, Sequence

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings, get_settings
from app.models import PVFault, PVReading

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Fault type identifiers (also stored in ``pv_faults.fault_type``)
# ---------------------------------------------------------------------------
FAULT_UNDERPERFORMANCE = "PV_UNDERPERFORMANCE"
FAULT_PANEL_OVERHEAT = "PV_PANEL_OVERHEAT"
FAULT_INVERTER_DEGRADATION = "INVERTER_DEGRADATION"
FAULT_INVERTER_OVERHEAT = "INVERTER_OVERHEAT"
FAULT_PRODUCTION_DROP = "PV_PRODUCTION_DROP"
FAULT_SENSOR_INCONSISTENCY = "PV_SENSOR_INCONSISTENCY"
FAULT_STALE_DATA = "PV_DATA_STALE"

WARNING = "WARNING"
CRITICAL = "CRITICAL"

#: Base penalty per active fault used by the health score.
SEVERITY_PENALTY = {WARNING: 8.0, CRITICAL: 20.0}


# ---------------------------------------------------------------------------
# Physical calculations
# ---------------------------------------------------------------------------
def estimate_cell_temperature(
    irradiance: float | None,
    ambient_temperature: float | None,
    noct_c: float = 45.0,
) -> float | None:
    """Estimate module temperature from ambient temperature and irradiance.

    Uses the NOCT model ``T_cell = T_ambient + (NOCT - 20) / 800 × G``.
    Returns ``None`` when ambient temperature is unavailable instead of
    inventing a value.
    """
    if irradiance is None or ambient_temperature is None:
        return None
    irradiance = max(0.0, float(irradiance))
    return float(ambient_temperature) + (noct_c - 20.0) / 800.0 * irradiance


def calculate_expected_power(
    irradiance_wm2: float | None,
    panel_area_m2: float | None,
    panel_efficiency: float | None,
    *,
    panel_temperature_c: float | None = None,
    ambient_temperature_c: float | None = None,
    temp_coefficient_per_c: float = -0.004,
    stc_temperature_c: float = 25.0,
    noct_c: float = 45.0,
) -> float | None:
    """Compute the expected DC power of the array in watts.

    ``Expected Power = Irradiance × Panel Area × Panel Efficiency`` with an
    optional temperature derating:

    ``P = G × A × η × max(0, 1 + γ × (T_cell − 25 °C))``

    Args:
        irradiance_wm2: Plane-of-array irradiance in W/m².
        panel_area_m2: Total module area in m².
        panel_efficiency: Module efficiency at STC (0-1).
        panel_temperature_c: Measured module temperature when available.
        ambient_temperature_c: Used to estimate cell temperature when the
            module temperature sensor is missing.
        temp_coefficient_per_c: Power temperature coefficient (≈ -0.4 %/°C).
        stc_temperature_c: Reference temperature (25 °C).
        noct_c: Nominal operating cell temperature.

    Returns:
        Expected power in watts, or ``None`` when an input required by the
        formula is missing/invalid. Never returns a negative value.
    """
    if irradiance_wm2 is None or panel_area_m2 is None or panel_efficiency is None:
        return None

    irradiance = float(irradiance_wm2)
    area = float(panel_area_m2)
    efficiency = float(panel_efficiency)
    if irradiance < 0 or area <= 0 or efficiency <= 0 or efficiency > 1.5:
        return None

    cell_temperature = panel_temperature_c
    if cell_temperature is None:
        cell_temperature = estimate_cell_temperature(
            irradiance, ambient_temperature_c, noct_c=noct_c
        )

    derating = 1.0
    if cell_temperature is not None:
        derating = max(
            0.0, 1.0 + temp_coefficient_per_c * (float(cell_temperature) - stc_temperature_c)
        )

    return max(0.0, irradiance * area * efficiency * derating)


def compute_inverter_efficiency(
    dc_input_power_w: float | None,
    ac_output_power_w: float | None,
) -> float | None:
    """Conversion efficiency in percent, or ``None`` when not computable.

    ``η = (P_ac / P_dc) × 100``. A non-positive DC input or a negative AC
    output is treated as invalid telemetry (explicitly unavailable) rather
    than being forced to a number.
    """
    if dc_input_power_w is None or ac_output_power_w is None:
        return None
    try:
        dc = float(dc_input_power_w)
        ac = float(ac_output_power_w)
    except (TypeError, ValueError):
        return None
    if dc <= 0 or ac < 0:
        return None
    return max(0.0, min(100.0, (ac / dc) * 100.0))


# ---------------------------------------------------------------------------
# Diagnostics
# ---------------------------------------------------------------------------
@dataclass(slots=True)
class Diagnostic:
    """Structured, explainable diagnostic returned by the detector."""

    fault_type: str
    severity: str
    message: str
    explanation: str
    recommended_action: str
    confidence: float | None = None
    is_confirmed: bool = False

    def as_dict(self) -> dict[str, Any]:
        """Return a JSON-serialisable representation."""
        return {
            "fault_type": self.fault_type,
            "severity": self.severity,
            "message": self.message,
            "explanation": self.explanation,
            "recommended_action": self.recommended_action,
            "confidence": self.confidence,
            "is_confirmed": self.is_confirmed,
        }


@dataclass(slots=True)
class DetectionThresholds:
    """Configurable diagnostic thresholds (documented defaults)."""

    underperformance_ratio: float = 0.80
    min_irradiance_wm2: float = 500.0
    min_expected_power_w: float = 50.0
    consecutive_readings: int = 3
    max_panel_temperature_c: float = 70.0
    inverter_min_efficiency_pct: float = 90.0
    inverter_max_temperature_c: float = 65.0
    temp_coefficient_per_c: float = -0.004
    stc_temperature_c: float = 25.0
    noct_c: float = 45.0
    stale_after_minutes: int = 30

    @classmethod
    def from_settings(cls, settings: Settings | None = None) -> "DetectionThresholds":
        """Build thresholds from application settings."""
        s = settings or get_settings()
        return cls(
            underperformance_ratio=s.pv_underperformance_ratio,
            min_irradiance_wm2=s.pv_min_irradiance_wm2,
            min_expected_power_w=s.pv_min_expected_power_w,
            consecutive_readings=max(1, s.pv_consecutive_readings),
            max_panel_temperature_c=s.pv_max_panel_temperature_c,
            inverter_min_efficiency_pct=s.pv_inverter_min_efficiency_pct,
            inverter_max_temperature_c=s.pv_inverter_max_temperature_c,
            temp_coefficient_per_c=s.pv_temp_coefficient_per_c,
            stc_temperature_c=s.pv_stc_temperature_c,
            noct_c=s.pv_noct_c,
            stale_after_minutes=s.pv_stale_after_minutes,
        )


def _value(reading: Any, field: str) -> Any:
    """Read a measurement from an ORM row or a plain mapping."""
    if isinstance(reading, dict):
        return reading.get(field)
    return getattr(reading, field, None)


def _float(value: Any) -> float | None:
    """Best-effort float conversion returning ``None`` on invalid input."""
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


class PVFaultDetector:
    """Deterministic photovoltaic and inverter diagnostic engine."""

    def __init__(
        self,
        thresholds: DetectionThresholds | None = None,
        settings: Settings | None = None,
    ) -> None:
        self.settings = settings or get_settings()
        self.thresholds = thresholds or DetectionThresholds.from_settings(self.settings)

    # -- helpers -----------------------------------------------------------
    def _expected_power(self, reading: Any) -> float | None:
        stored = _float(_value(reading, "expected_power"))
        if stored is not None:
            return stored
        return calculate_expected_power(
            _float(_value(reading, "irradiance")),
            _float(_value(reading, "panel_area")) or self.settings.pv_panel_area_m2,
            _float(_value(reading, "panel_efficiency"))
            or self.settings.pv_panel_efficiency,
            panel_temperature_c=_float(_value(reading, "panel_temperature")),
            ambient_temperature_c=_float(_value(reading, "ambient_temperature")),
            temp_coefficient_per_c=self.thresholds.temp_coefficient_per_c,
            stc_temperature_c=self.thresholds.stc_temperature_c,
            noct_c=self.thresholds.noct_c,
        )

    def _actual_power(self, reading: Any) -> float | None:
        actual = _float(_value(reading, "actual_power"))
        if actual is not None:
            return actual
        ac_power = _float(_value(reading, "ac_power"))
        if ac_power is not None:
            return ac_power
        return _float(_value(reading, "dc_power"))

    def _inverter_efficiency(self, reading: Any) -> float | None:
        stored = _float(_value(reading, "inverter_efficiency"))
        if stored is not None:
            return stored
        dc = _float(_value(reading, "inverter_dc_input_power"))
        if dc is None:
            dc = _float(_value(reading, "dc_power"))
        ac = _float(_value(reading, "inverter_ac_output_power"))
        if ac is None:
            ac = _float(_value(reading, "ac_power"))
        return compute_inverter_efficiency(dc, ac)

    @staticmethod
    def _timestamp(reading: Any) -> datetime | None:
        ts = _value(reading, "timestamp")
        if isinstance(ts, datetime):
            return ts
        return None

    @staticmethod
    def _sort(readings: Iterable[Any]) -> list[Any]:
        rows = list(readings)
        return sorted(
            rows,
            key=lambda r: (
                PVFaultDetector._timestamp(r) or datetime.min.replace(tzinfo=timezone.utc)
            ),
        )

    def _tail(self, readings: list[Any], predicate) -> list[Any]:
        """Return the trailing run of rows satisfying ``predicate``."""
        run: list[Any] = []
        for reading in reversed(readings):
            if predicate(reading):
                run.append(reading)
            else:
                break
        run.reverse()
        return run

    # -- main API ----------------------------------------------------------
    def detect(self, readings: Sequence[Any]) -> list[Diagnostic]:
        """Analyse the most recent readings and return structured diagnostics.

        Args:
            readings: Chronologically ordered PV readings (ORM rows or dicts).
                The most recent samples drive the trailing-window rules.

        Returns:
            A list of :class:`Diagnostic` objects. Empty when the installation
            behaves normally or when there is not enough valid telemetry.
        """
        rows = self._sort(readings)
        if not rows:
            return []

        diagnostics: list[Diagnostic] = []
        n = self.thresholds.consecutive_readings
        # Thermal rules use two consecutive samples: module/inverter inertia
        # makes a single hot sample too noisy to be actionable.
        thermal_n = 2

        # --- A. Underperformance: sustained low actual vs expected ---------
        def underperforming(r: Any) -> bool:
            expected = self._expected_power(r)
            actual = self._actual_power(r)
            irradiance = _float(_value(r, "irradiance"))
            if expected is None or actual is None or irradiance is None:
                return False
            if expected < self.thresholds.min_expected_power_w:
                return False
            if irradiance < self.thresholds.min_irradiance_wm2:
                return False
            return actual < expected * self.thresholds.underperformance_ratio

        under_run = self._tail(rows, underperforming)
        if len(under_run) >= n:
            window = under_run[-n:]
            ratios = []
            for r in window:
                expected = self._expected_power(r)
                actual = self._actual_power(r)
                if expected and expected > 0 and actual is not None:
                    ratios.append(actual / expected)
            avg_ratio = sum(ratios) / len(ratios) if ratios else None
            severity = (
                CRITICAL
                if avg_ratio is not None
                and avg_ratio
                < self.thresholds.underperformance_ratio * 0.75 - 1e-9
                else WARNING
            )
            ratio_text = f"{avg_ratio * 100:.0f} %" if avg_ratio is not None else "inconnu"
            diagnostics.append(
                Diagnostic(
                    fault_type=FAULT_UNDERPERFORMANCE,
                    severity=severity,
                    message=(
                        "Performance photovoltaïque anormalement faible — "
                        "salissure ou ombrage possible."
                    ),
                    explanation=(
                        f"La puissance réelle est restée sous "
                        f"{self.thresholds.underperformance_ratio * 100:.0f} % de la "
                        f"puissance attendue sur {len(window)} mesures consécutives "
                        f"(ratio moyen {ratio_text}, irradiance ≥ "
                        f"{self.thresholds.min_irradiance_wm2:.0f} W/m²). "
                        "Une salissure, un ombrage partiel ou une perte de rendement "
                        "module sont possibles ; aucune cause physique n'est confirmée."
                    ),
                    recommended_action=(
                        "Inspecter visuellement les modules (poussière, ombrage, "
                        "connectique), nettoyer si nécessaire puis comparer à nouveau "
                        "la production réelle et attendue."
                    ),
                    confidence=0.75 if avg_ratio is not None else None,
                    is_confirmed=False,
                )
            )

        # --- B. Panel over-temperature -------------------------------------
        def hot_panel(r: Any) -> bool:
            temperature = _float(_value(r, "panel_temperature"))
            return (
                temperature is not None
                and temperature > self.thresholds.max_panel_temperature_c
            )

        hot_run = self._tail(rows, hot_panel)
        if len(hot_run) >= thermal_n:
            window = hot_run[-thermal_n:]
            temperatures = [
                t for t in (_float(_value(r, "panel_temperature")) for r in window) if t
            ]
            peak = max(temperatures) if temperatures else None
            diagnostics.append(
                Diagnostic(
                    fault_type=FAULT_PANEL_OVERHEAT,
                    severity=CRITICAL
                    if peak is not None
                    and peak > self.thresholds.max_panel_temperature_c + 15
                    else WARNING,
                    message=(
                        "Température du panneau anormalement élevée — "
                        "inspection recommandée."
                    ),
                    explanation=(
                        f"Température module supérieure à "
                        f"{self.thresholds.max_panel_temperature_c:.0f} °C sur "
                        f"{len(window)} mesures consécutives"
                        + (f" (pic {peak:.1f} °C)." if peak is not None else ".")
                        + " Un point chaud localisé ne peut pas être confirmé sans "
                        "caméra thermique ni mesure de température localisée."
                    ),
                    recommended_action=(
                        "Vérifier la ventilation à l'arrière des modules, "
                        "contrôler les diodes bypass et réaliser un relevé thermique "
                        "avant de conclure à un point chaud."
                    ),
                    confidence=0.65,
                    is_confirmed=False,
                )
            )

        # --- C. Inverter degradation (consecutive valid readings) ----------
        def low_efficiency(r: Any) -> bool:
            efficiency = self._inverter_efficiency(r)
            dc = _float(_value(r, "inverter_dc_input_power"))
            if dc is None:
                dc = _float(_value(r, "dc_power"))
            return (
                efficiency is not None
                and dc is not None
                and dc > 0
                and efficiency < self.thresholds.inverter_min_efficiency_pct
            )

        eff_run = self._tail(rows, low_efficiency)
        if len(eff_run) >= n:
            window = eff_run[-n:]
            efficiencies = [
                e
                for e in (self._inverter_efficiency(r) for r in window)
                if e is not None
            ]
            avg_eff = sum(efficiencies) / len(efficiencies) if efficiencies else None
            diagnostics.append(
                Diagnostic(
                    fault_type=FAULT_INVERTER_DEGRADATION,
                    severity=CRITICAL
                    if avg_eff is not None
                    and avg_eff < self.thresholds.inverter_min_efficiency_pct - 10
                    else WARNING,
                    message="Rendement de l'onduleur dégradé — maintenance recommandée.",
                    explanation=(
                        f"Rendement DC→AC inférieur à "
                        f"{self.thresholds.inverter_min_efficiency_pct:.0f} % sur "
                        f"{len(window)} mesures consécutives"
                        + (f" (moyenne {avg_eff:.1f} %)." if avg_eff is not None else ".")
                        + " Cette baisse persistante peut indiquer un vieillissement "
                        "de l'onduleur ou un problème de refroidissement."
                    ),
                    recommended_action=(
                        "Contrôler la température et la ventilation de l'onduleur, "
                        "vérifier les connexions DC/AC et planifier une maintenance "
                        "préventive avec le fabricant."
                    ),
                    confidence=0.7,
                    is_confirmed=False,
                )
            )

        def hot_inverter(r: Any) -> bool:
            temperature = _float(_value(r, "inverter_temperature"))
            return (
                temperature is not None
                and temperature > self.thresholds.inverter_max_temperature_c
            )

        inv_hot_run = self._tail(rows, hot_inverter)
        if len(inv_hot_run) >= thermal_n:
            window = inv_hot_run[-thermal_n:]
            temperatures = [
                t
                for t in (_float(_value(r, "inverter_temperature")) for r in window)
                if t is not None
            ]
            peak = max(temperatures) if temperatures else None
            diagnostics.append(
                Diagnostic(
                    fault_type=FAULT_INVERTER_OVERHEAT,
                    severity=WARNING,
                    message="Température de l'onduleur élevée — surveillance requise.",
                    explanation=(
                        f"Température onduleur supérieure à "
                        f"{self.thresholds.inverter_max_temperature_c:.0f} °C sur "
                        f"{len(window)} mesures consécutives"
                        + (f" (pic {peak:.1f} °C)." if peak is not None else ".")
                    ),
                    recommended_action=(
                        "Dégager la ventilation de l'onduleur, vérifier la propreté "
                        "des filtres et la température du local technique."
                    ),
                    confidence=0.6,
                    is_confirmed=False,
                )
            )

        # --- D. Sudden production drop + sensor inconsistency --------------
        if len(rows) >= 2:
            previous, latest = rows[-2], rows[-1]
            prev_actual = self._actual_power(previous)
            last_actual = self._actual_power(latest)
            prev_irr = _float(_value(previous, "irradiance"))
            last_irr = _float(_value(latest, "irradiance"))
            if (
                prev_actual is not None
                and last_actual is not None
                and prev_actual > 100
                and last_actual < prev_actual * 0.60
                and (
                    prev_irr is None
                    or last_irr is None
                    or last_irr >= prev_irr * 0.85
                )
            ):
                drop_pct = (1 - last_actual / prev_actual) * 100
                diagnostics.append(
                    Diagnostic(
                        fault_type=FAULT_PRODUCTION_DROP,
                        severity=WARNING,
                        message="Chute de production solaire inexpliquée détectée.",
                        explanation=(
                            f"La production est passée de {prev_actual:.0f} W à "
                            f"{last_actual:.0f} W (−{drop_pct:.0f} %) alors que "
                            "l'irradiance est restée stable. Une déconnexion, un "
                            "disjoncteur ouvert ou un défaut capteur sont possibles."
                        ),
                        recommended_action=(
                            "Vérifier les protections AC/DC, l'état de l'onduleur "
                            "et la continuité des chaînes PV avant de relancer."
                        ),
                        confidence=0.55,
                        is_confirmed=False,
                    )
                )

            dc_latest = _float(_value(latest, "dc_power"))
            ac_latest = _float(_value(latest, "ac_power"))
            if (
                dc_latest is not None
                and ac_latest is not None
                and dc_latest > 50
                and ac_latest > dc_latest * 1.15
            ):
                diagnostics.append(
                    Diagnostic(
                        fault_type=FAULT_SENSOR_INCONSISTENCY,
                        severity=WARNING,
                        message="Incohérence capteurs DC/AC détectée.",
                        explanation=(
                            f"La puissance AC ({ac_latest:.0f} W) dépasse la puissance "
                            f"DC ({dc_latest:.0f} W) de plus de 15 %, ce qui est "
                            "physiquement impossible pour un onduleur photovoltaïque. "
                            "Une mesure est probablement invalide."
                        ),
                        recommended_action=(
                            "Contrôler le câblage et l'étalonnage des capteurs de "
                            "courant/tension DC et AC."
                        ),
                        confidence=0.8,
                        is_confirmed=False,
                    )
                )

        # --- D. Stale measurements -----------------------------------------
        last_ts = self._timestamp(rows[-1])
        if last_ts is not None:
            now = datetime.now(timezone.utc)
            if last_ts.tzinfo is None:
                last_ts = last_ts.replace(tzinfo=timezone.utc)
            if now - last_ts > timedelta(minutes=self.thresholds.stale_after_minutes):
                age_min = int((now - last_ts).total_seconds() // 60)
                diagnostics.append(
                    Diagnostic(
                        fault_type=FAULT_STALE_DATA,
                        severity=WARNING,
                        message="Données photovoltaïques obsolètes — capteurs à vérifier.",
                        explanation=(
                            f"La dernière mesure PV date de {age_min} minutes, au-delà "
                            f"du seuil de {self.thresholds.stale_after_minutes} minutes. "
                            "L'état du champ est inconnu entre deux mesures."
                        ),
                        recommended_action=(
                            "Vérifier l'alimentation de la passerelle ESP32 et la "
                            "connexion au broker MQTT."
                        ),
                        confidence=None,
                        is_confirmed=False,
                    )
                )

        return diagnostics


# ---------------------------------------------------------------------------
# Health score
# ---------------------------------------------------------------------------
def compute_health_score(faults: Sequence[Any]) -> dict[str, Any]:
    """Compute the 0-100 PV health score from active faults.

    See the module docstring for the documented methodology.
    """
    active = [
        f
        for f in faults
        if str(_value(f, "status") or "ACTIVE").upper() == "ACTIVE"
    ]
    if not active:
        return {
            "score": 100,
            "status": "normal",
            "label": "Champ photovoltaïque sain",
            "active_faults": 0,
            "critical_faults": 0,
            "warning_faults": 0,
        }

    penalty = 0.0
    critical_count = 0
    warning_count = 0
    for fault in active:
        severity = str(_value(fault, "severity") or WARNING).upper()
        if severity == CRITICAL:
            critical_count += 1
        else:
            warning_count += 1
        occurrences = int(_value(fault, "occurrences") or 1)
        persistence = 1.0 + 0.1 * min(max(occurrences - 1, 0), 4)
        penalty += SEVERITY_PENALTY.get(severity, SEVERITY_PENALTY[WARNING]) * persistence

    score = int(round(max(0.0, min(100.0, 100.0 - penalty))))
    if score >= 85:
        status, label = "normal", "Champ photovoltaïque sain"
    elif score >= 60:
        status, label = "warning", "Surveillance recommandée"
    else:
        status, label = "critical", "Maintenance prioritaire requise"

    return {
        "score": score,
        "status": status,
        "label": label,
        "active_faults": len(active),
        "critical_faults": critical_count,
        "warning_faults": warning_count,
    }


HEALTH_METHODOLOGY = (
    "Score = 100 − Σ pénalité. Pénalité = 8 points (avertissement) ou 20 points "
    "(critique) × facteur de persistance (1 + 0,1 × min(occurrences − 1, 4)), "
    "borné à [0, 100]. Statut : ≥ 85 sain, 60–84 surveillance, < 60 critique. "
    "Les diagnostics sont des anomalies détectées par règles, pas des défauts "
    "physiques confirmés."
)


# ---------------------------------------------------------------------------
# Persistence (duplicate suppression + auto-resolution)
# ---------------------------------------------------------------------------
async def detect_and_persist(
    session: AsyncSession,
    readings: Sequence[Any],
    device_id: str,
    *,
    settings: Settings | None = None,
    thresholds: DetectionThresholds | None = None,
    now: datetime | None = None,
) -> list[PVFault]:
    """Run the detector and upsert active faults without duplicates.

    * A new detection of an already-active fault increments ``occurrences``
      (at most once per ``pv_fault_renotify_minutes``) and refreshes metadata.
    * Active faults whose condition disappeared are automatically resolved.
    * The method commits the transaction.
    """
    s = settings or get_settings()
    detector = PVFaultDetector(thresholds=thresholds, settings=s)
    diagnostics = detector.detect(readings)
    moment = now or datetime.now(timezone.utc)

    existing_rows = list(
        (
            await session.scalars(
                select(PVFault).where(
                    PVFault.device_id == device_id,
                    PVFault.status == "ACTIVE",
                )
            )
        ).all()
    )
    by_type = {fault.fault_type: fault for fault in existing_rows}
    detected_types: set[str] = set()

    for diagnostic in diagnostics:
        detected_types.add(diagnostic.fault_type)
        fault = by_type.get(diagnostic.fault_type)
        if fault is None:
            session.add(
                PVFault(
                    device_id=device_id,
                    fault_type=diagnostic.fault_type,
                    severity=diagnostic.severity,
                    status="ACTIVE",
                    message=diagnostic.message,
                    explanation=diagnostic.explanation,
                    recommended_action=diagnostic.recommended_action,
                    confidence=diagnostic.confidence,
                    is_confirmed=diagnostic.is_confirmed,
                    occurrences=1,
                    first_detected_at=moment,
                    last_detected_at=moment,
                )
            )
            continue

        last_seen = fault.last_detected_at
        if last_seen is not None and last_seen.tzinfo is None:
            last_seen = last_seen.replace(tzinfo=timezone.utc)
        should_count = (
            last_seen is None
            or (moment - last_seen) >= timedelta(minutes=s.pv_fault_renotify_minutes)
        )
        if should_count:
            fault.occurrences = int(fault.occurrences or 1) + 1
        fault.severity = diagnostic.severity
        fault.message = diagnostic.message
        fault.explanation = diagnostic.explanation
        fault.recommended_action = diagnostic.recommended_action
        fault.confidence = diagnostic.confidence
        fault.last_detected_at = moment

    for fault_type, fault in by_type.items():
        if fault_type not in detected_types:
            fault.status = "RESOLVED"
            fault.resolved_at = moment

    await session.commit()

    refreshed = list(
        (
            await session.scalars(
                select(PVFault)
                .where(PVFault.device_id == device_id, PVFault.status == "ACTIVE")
                .order_by(PVFault.last_detected_at.desc())
            )
        ).all()
    )
    logger.info(
        "PV diagnostics device=%s active=%s detected=%s",
        device_id,
        len(refreshed),
        [d.fault_type for d in diagnostics],
    )
    return refreshed
