"""Hybrid detector layer tests."""

from __future__ import annotations

from typing import Any

from app.ai.detector import WasteDetector
from app.schemas import ReadingIngest


class _AnomalyForest:
    """Minimal Isolation Forest stand-in that always labels a sample as -1."""

    def predict(self, samples: list[list[float]]) -> list[int]:
        """Return one anomaly label per sample."""
        return [-1 for _ in samples]

    def decision_function(self, samples: list[list[float]]) -> list[float]:
        """Return a negative outlier score per sample."""
        return [-0.2 for _ in samples]


def test_phase1_fan_rule_still_fires() -> None:
    """Layer 1 delegates to the untouched Phase 1 rule set."""
    detector = WasteDetector(use_model=False)
    reading = ReadingIngest(
        device_id="SALLE1",
        power=99.0,
        fan_current=0.42,
        occupancy=0,
    )

    types = [alert["type"] for alert in detector.detect(reading, None)]

    assert "FAN_NO_OCCUPANCY" in types


def test_isolation_forest_layer_fires_on_anomaly() -> None:
    """Layer 2 appends an ISOLATION_FOREST_ANOMALY alert for label -1."""
    detector = WasteDetector(model=_AnomalyForest())
    reading = ReadingIngest(
        device_id="SALLE1",
        power=250.0,
        fan_current=0.4,
        temperature=31.0,
        occupancy=0,
    )

    alerts = detector.detect(reading, None)
    types = [alert["type"] for alert in alerts]

    assert detector.model_loaded is True
    assert "ISOLATION_FOREST_ANOMALY" in types
    anomaly = next(item for item in alerts if item["type"] == "ISOLATION_FOREST_ANOMALY")
    assert anomaly["confidence"] is not None


def test_residual_layer_fires_above_threshold() -> None:
    """Layer 3 fires when observed power exceeds the forecast by >30 %."""
    detector = WasteDetector(use_model=False)
    reading = ReadingIngest(device_id="SALLE1", power=500.0, occupancy=1)

    alerts = detector.detect(reading, predicted_power=100.0)
    types = [alert["type"] for alert in alerts]

    assert "OVERCONSUMPTION_VS_FORECAST" in types


def test_residual_layer_ignores_small_gap() -> None:
    """Layer 3 stays silent for a residual below the absolute floor."""
    detector = WasteDetector(use_model=False)
    reading = ReadingIngest(device_id="SALLE1", power=120.0, occupancy=1)

    alerts = detector.detect(reading, predicted_power=100.0)

    assert all(item["type"] != "OVERCONSUMPTION_VS_FORECAST" for item in alerts)


def test_isolation_forest_skips_incomplete_readings() -> None:
    """Missing detector inputs must not crash or produce a false alert."""
    detector = WasteDetector(model=_AnomalyForest())
    reading = ReadingIngest(device_id="SALLE1", power=120.0, occupancy=None)

    alerts: list[dict[str, Any]] = detector.detect(reading, None)

    assert all(item["type"] != "ISOLATION_FOREST_ANOMALY" for item in alerts)
