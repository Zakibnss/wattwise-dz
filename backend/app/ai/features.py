"""Feature engineering shared by training and inference.

The training data is resampled to 15-minute bins. Lags are therefore expressed
in 15-minute steps: ``power_lag1`` is the previous bin (15 min),
``power_lag6`` is 90 minutes earlier and ``power_lag144`` is 24 hours earlier.

Missing weather/occupancy values are carried forward because sensors report at
slightly different cadences. Missing power values are also forward-filled, but
rows whose lagged features cannot be computed (the first 144 bins) are dropped.
"""

from __future__ import annotations

from typing import Final

import pandas as pd

#: Ordered list of columns consumed by the XGBoost forecaster.
FEATURE_COLUMNS: Final[tuple[str, ...]] = (
    "hour",
    "dayofweek",
    "is_weekend",
    "temperature",
    "humidity",
    "occupancy",
    "power_lag1",
    "power_lag6",
    "power_lag144",
    "temp_lag1",
)

#: Target column produced by :func:`build_features`.
TARGET_COLUMN: Final[str] = "power"


def build_features(df: pd.DataFrame) -> pd.DataFrame:
    """Turn raw 15-minute readings into a supervised learning table.

    Args:
        df: DataFrame containing at least ``timestamp`` and ``power`` columns.
            ``temperature``, ``humidity`` and ``occupancy`` are optional.

    Returns:
        A chronologically sorted DataFrame with :data:`FEATURE_COLUMNS`, the
        ``timestamp`` column and the ``power`` target. Rows where a lag is not
        yet available (and rows without power) are dropped, so the result never
        contains NaN values.

    Raises:
        ValueError: If ``timestamp`` or ``power`` is missing from ``df``.
    """
    missing = {"timestamp", "power"}.difference(df.columns)
    if missing:
        raise ValueError(
            "build_features requires columns: " + ", ".join(sorted(missing))
        )

    frame = df.copy()
    frame["timestamp"] = pd.to_datetime(frame["timestamp"], errors="coerce", utc=True)
    frame = frame.dropna(subset=["timestamp"]).sort_values("timestamp")
    frame = frame.drop_duplicates(subset=["timestamp"], keep="last")
    frame = frame.reset_index(drop=True)

    frame["power"] = pd.to_numeric(frame["power"], errors="coerce")
    frame["power"] = frame["power"].ffill()

    for column in ("temperature", "humidity"):
        if column not in frame.columns:
            frame[column] = 0.0
        frame[column] = pd.to_numeric(frame[column], errors="coerce")
        frame[column] = frame[column].ffill().bfill().fillna(0.0)

    if "occupancy" not in frame.columns:
        frame["occupancy"] = 0
    frame["occupancy"] = (
        pd.to_numeric(frame["occupancy"], errors="coerce").fillna(0).astype(int)
    )

    frame["hour"] = frame["timestamp"].dt.hour.astype(int)
    frame["dayofweek"] = frame["timestamp"].dt.dayofweek.astype(int)
    frame["is_weekend"] = (frame["dayofweek"] >= 5).astype(int)

    frame["power_lag1"] = frame["power"].shift(1)
    frame["power_lag6"] = frame["power"].shift(6)
    frame["power_lag144"] = frame["power"].shift(144)
    frame["temp_lag1"] = frame["temperature"].shift(1)

    required = [*FEATURE_COLUMNS, TARGET_COLUMN]
    frame = frame.dropna(subset=required).reset_index(drop=True)

    return frame[["timestamp", *FEATURE_COLUMNS, TARGET_COLUMN]]
