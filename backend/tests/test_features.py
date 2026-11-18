"""Feature engineering tests."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pandas as pd
import pytest

from app.ai.features import FEATURE_COLUMNS, TARGET_COLUMN, build_features


def _readings(rows: int = 200) -> pd.DataFrame:
    """Build a small, realistic 15-minute sensor frame."""
    start = datetime(2024, 1, 1, tzinfo=timezone.utc)
    return pd.DataFrame(
        {
            "timestamp": [start + timedelta(minutes=15 * i) for i in range(rows)],
            "power": [100.0 + (i % 24) * 2.0 for i in range(rows)],
            "temperature": [20.0 + (i % 10) * 0.1 for i in range(rows)],
            "humidity": [45.0 + (i % 5) for i in range(rows)],
            "occupancy": [1 if 8 <= (i // 4) % 24 <= 17 else 0 for i in range(rows)],
        }
    )


def test_build_features_returns_expected_columns_without_nan() -> None:
    """All configured features exist and the output is NaN-free."""
    features = build_features(_readings())

    assert not features.empty
    for column in (*FEATURE_COLUMNS, TARGET_COLUMN, "timestamp"):
        assert column in features.columns
    assert not features.loc[:, list(FEATURE_COLUMNS)].isna().any().any()
    assert features["is_weekend"].isin({0, 1}).all()


def test_build_features_drops_incomplete_warmup_rows() -> None:
    """A history shorter than the 144-step lag yields no training rows."""
    features = build_features(_readings(rows=100))

    assert features.empty


def test_build_features_requires_power_column() -> None:
    """Missing target columns fail loudly instead of silently training."""
    with pytest.raises(ValueError, match="power"):
        build_features(pd.DataFrame({"timestamp": [datetime.now(timezone.utc)]}))
