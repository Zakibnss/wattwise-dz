"""Forecaster inference tests."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from app.ai import forecaster


def _history(rows: int = 160) -> list[dict[str, object]]:
    """Build a short 15-minute reading history as plain dictionaries."""
    start = datetime(2024, 6, 1, tzinfo=timezone.utc)
    return [
        {
            "timestamp": start + timedelta(minutes=15 * index),
            "power": 120.0 + (index % 12) * 5.0,
            "temperature": 24.0,
            "humidity": 50.0,
            "occupancy": 1 if index % 3 else 0,
        }
        for index in range(rows)
    ]


def test_predict_next_24h_returns_24_bounded_items() -> None:
    """The API contract is exactly 24 hourly predictions with confidence bounds."""
    if not forecaster.MODEL_PATH.is_file():
        pytest.skip("forecaster.pkl not trained in this environment")

    predictions = forecaster.predict_next_24h(_history())

    assert len(predictions) == 24
    assert [item["hour_offset"] for item in predictions] == list(range(1, 25))
    for item in predictions:
        assert item["predicted_power"] >= 0
        assert item["predicted_energy_kwh"] >= 0
        assert (
            item["confidence_lower"]
            <= item["predicted_power"]
            <= item["confidence_upper"]
        )


def test_missing_model_raises_runtime_error(
    monkeypatch: pytest.MonkeyPatch, tmp_path
) -> None:
    """A clear error is raised when the artifact has not been trained."""
    monkeypatch.setattr(forecaster, "MODEL_PATH", tmp_path / "missing.pkl")
    monkeypatch.setattr(forecaster, "_MODEL", None)

    with pytest.raises(RuntimeError, match="not found"):
        forecaster.load_model()


def test_predict_single_rejects_missing_model(
    monkeypatch: pytest.MonkeyPatch, tmp_path
) -> None:
    """``predict_single`` uses the same guarding path as ``load_model``."""
    monkeypatch.setattr(forecaster, "MODEL_PATH", tmp_path / "missing.pkl")
    monkeypatch.setattr(forecaster, "_MODEL", None)

    with pytest.raises(RuntimeError):
        forecaster.predict_single({})
