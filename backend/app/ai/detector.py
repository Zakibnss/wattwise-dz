"""Hybrid waste detector: Phase 1 rules + Isolation Forest + forecast residual.

Layer 1 delegates to :func:`app.mqtt_client.detect_waste` so the three Phase 1
rules stay the single source of truth. Layer 2 flags multivariate outliers with
an unsupervised Isolation Forest. Layer 3 compares the observed power with the
XGBoost prediction and flags a positive residual.

The public ``detect`` method returns plain dictionaries (not ORM ``Alert``
instances). This keeps the detector synchronous, DB-free and directly
compatible with the Phase 1 persistence loop in ``MQTTIngestor``.
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

import joblib

from app.schemas import ReadingIngest

logger = logging.getLogger(__name__)

MODELS_DIR = Path(__file__).resolve().parents[2] / "models"
DETECTOR_PATH = MODELS_DIR / "detector.pkl"

#: Relative residual above which Layer 3 fires.
RESIDUAL_RATIO = 0.30
#: Absolute residual floor (W) below which Layer 3 never fires.
RESIDUAL_MIN_WATTS = 50.0

_IF_MODEL: Any | None = None
_IF_LOAD_ATTEMPTED = False


def load_isolation_forest(force_reload: bool = False) -> Any | None:
    """Load and cache the Isolation Forest, returning ``None`` if absent.

    A missing model is a normal state before the explicit training CLI has run,
    so this helper never raises.
    """
    global _IF_MODEL, _IF_LOAD_ATTEMPTED
    if force_reload:
        _IF_MODEL = None
        _IF_LOAD_ATTEMPTED = False
    if _IF_LOAD_ATTEMPTED:
        return _IF_MODEL
    _IF_LOAD_ATTEMPTED = True
    if not DETECTOR_PATH.is_file():
        logger.info("Isolation Forest not found at %s; Layer 2 disabled", DETECTOR_PATH)
        return None
    try:
        _IF_MODEL = joblib.load(DETECTOR_PATH)
        logger.info("Loaded Isolation Forest from %s", DETECTOR_PATH)
    except Exception:  # pragma: no cover - corrupted artifact
        logger.exception("Unable to load Isolation Forest from %s", DETECTOR_PATH)
        _IF_MODEL = None
    return _IF_MODEL


def is_detector_available() -> bool:
    """Return whether the Isolation Forest artifact exists on disk."""
    return DETECTOR_PATH.is_file()


class WasteDetector:
    """Run the three detection layers for one reading."""

    def __init__(self, model: Any | None = None, use_model: bool = True) -> None:
        """Initialise the detector.

        Args:
            model: Optional pre-loaded Isolation Forest (used by tests).
            use_model: Set to ``False`` to disable Layer 2 entirely.
        """
        self._model = model
        self._model_resolved = model is not None or not use_model
        self._use_model = use_model

    @property
    def model_loaded(self) -> bool:
        """Whether an Isolation Forest is available for Layer 2."""
        return self._get_model() is not None

    def _get_model(self) -> Any | None:
        """Resolve the model once per detector instance."""
        if not self._use_model:
            return None
        if not self._model_resolved:
            self._model = load_isolation_forest()
            self._model_resolved = True
        return self._model

    def detect(
        self,
        reading: ReadingIngest,
        predicted_power: float | None,
    ) -> list[dict[str, Any]]:
        """Apply all detection layers to a single reading.

        Args:
            reading: Validated sensor reading.
            predicted_power: XGBoost expectation for this reading, or ``None``
                when the forecaster is unavailable.

        Returns:
            Alert dictionaries ready to be persisted in the ``alerts`` table.
        """
        alerts: list[dict[str, Any]] = []

        # Layer 1: the untouched Phase 1 rule set.
        from app.mqtt_client import detect_waste

        alerts.extend(detect_waste(reading))

        # Layer 2: unsupervised multivariate anomaly detection.
        if_model = self._isolation_forest_detect(reading)
        if if_model is not None:
            alerts.append(if_model)

        # Layer 3: positive residual versus the XGBoost prediction.
        residual_alert = self._residual_detect(reading, predicted_power)
        if residual_alert is not None:
            alerts.append(residual_alert)

        return alerts

    def _isolation_forest_detect(
        self, reading: ReadingIngest
    ) -> dict[str, Any] | None:
        """Flag a reading when the Isolation Forest labels it as an outlier."""
        model = self._get_model()
        if model is None:
            return None

        values = [
            reading.power,
            reading.fan_current,
            reading.temperature,
            reading.occupancy,
        ]
        if any(value is None for value in values):
            return None

        sample = [[float(value) for value in values]]
        try:
            label = int(model.predict(sample)[0])
            score = 0.0
            if hasattr(model, "decision_function"):
                score = float(model.decision_function(sample)[0])
        except Exception:  # pragma: no cover - defensive against odd estimators
            logger.exception("Isolation Forest inference failed")
            return None

        if label != -1:
            return None

        confidence = min(0.95, max(0.55, 0.7 + abs(score)))
        return {
            "type": "ISOLATION_FOREST_ANOMALY",
            "severity": "MEDIUM",
            "message": "Comportement énergétique inhabituel détecté",
            "cause": (
                "Isolation Forest : combinaison puissance / ventilateur / "
                f"température / occupation atypique (score={score:.3f})"
            ),
            "confidence": round(confidence, 4),
        }

    @staticmethod
    def _residual_detect(
        reading: ReadingIngest, predicted_power: float | None
    ) -> dict[str, Any] | None:
        """Flag a large positive gap between observed and predicted power."""
        if predicted_power is None or reading.power is None:
            return None

        residual = float(reading.power) - float(predicted_power)
        threshold = max(RESIDUAL_MIN_WATTS, RESIDUAL_RATIO * float(predicted_power))
        if residual <= threshold:
            return None

        confidence = min(0.99, residual / (float(predicted_power) + 1.0))
        return {
            "type": "OVERCONSUMPTION_VS_FORECAST",
            "severity": "MEDIUM",
            "message": f"Consommation {residual:.0f} W au-dessus de la prévision",
            "cause": "Résidu de prédiction XGBoost",
            "confidence": round(confidence, 4),
        }
