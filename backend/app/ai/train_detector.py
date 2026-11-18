"""Explicit CLI training of the unsupervised Isolation Forest detector.

Usage (from the backend container)::

    python -m app.ai.train_detector

The model is fitted on the four raw signals available in Building 59:
``power``, ``fan_current``, ``temperature`` and ``occupancy``. No labels are
required, which keeps the detector usable for Algerian buildings where waste
annotations do not exist yet.
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import joblib
import pandas as pd
from sklearn.ensemble import IsolationForest

BACKEND_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_DATA_PATH = BACKEND_ROOT / "data" / "training_data.csv"
MODELS_DIR = BACKEND_ROOT / "models"
DETECTOR_PATH = MODELS_DIR / "detector.pkl"
DETECTOR_METRICS_PATH = MODELS_DIR / "detector_metrics.json"

#: Raw signals consumed by the Isolation Forest.
DETECTOR_FEATURES = ("power", "fan_current", "temperature", "occupancy")
DEFAULT_CONTAMINATION = 0.05


def train_detector(
    raw: pd.DataFrame,
    contamination: float = DEFAULT_CONTAMINATION,
    random_state: int = 42,
) -> tuple[IsolationForest, dict[str, Any]]:
    """Fit an Isolation Forest and report its training anomaly rate.

    Args:
        raw: Raw training data containing :data:`DETECTOR_FEATURES`.
        contamination: Expected proportion of anomalies.
        random_state: Seed for reproducibility.

    Returns:
        The fitted estimator and a metrics dict.

    Raises:
        ValueError: If required columns are missing or no complete rows remain.
    """
    missing = set(DETECTOR_FEATURES).difference(raw.columns)
    if missing:
        raise ValueError(
            "Detector training data is missing columns: " + ", ".join(sorted(missing))
        )

    data = raw.loc[:, list(DETECTOR_FEATURES)].apply(pd.to_numeric, errors="coerce")
    data = data.dropna()
    if data.empty:
        raise ValueError("No complete rows available to train the detector.")

    model = IsolationForest(
        contamination=contamination,
        random_state=random_state,
        n_jobs=-1,
    )
    model.fit(data)
    labels = model.predict(data)
    anomaly_rate = float((labels == -1).mean())

    return model, {
        "model_name": "detector_v1",
        "anomaly_rate": anomaly_rate,
        "n_samples": int(len(data)),
        "contamination": contamination,
        "trained_at": datetime.now(timezone.utc).isoformat(),
    }


def save_artifacts(
    model: IsolationForest,
    metrics: dict[str, Any],
    model_path: Path = DETECTOR_PATH,
    metrics_path: Path = DETECTOR_METRICS_PATH,
) -> None:
    """Persist the detector and its metrics sidecar."""
    model_path.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(model, model_path)
    metrics_path.write_text(
        json.dumps(metrics, indent=2, ensure_ascii=False), encoding="utf-8"
    )


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    """Parse command-line options."""
    parser = argparse.ArgumentParser(description="Train the WATTWISE DZ Isolation Forest detector.")
    parser.add_argument("--data", type=Path, default=DEFAULT_DATA_PATH)
    parser.add_argument("--model-path", type=Path, default=DETECTOR_PATH)
    parser.add_argument("--metrics-path", type=Path, default=DETECTOR_METRICS_PATH)
    parser.add_argument("--contamination", type=float, default=DEFAULT_CONTAMINATION)
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    """Run detector training and print metrics as JSON."""
    args = parse_args(argv)
    if not args.data.is_file():
        print(
            f"Training data not found at {args.data}. "
            "Run: python -m app.ai.prepare_data",
            file=sys.stderr,
        )
        return 1

    raw = pd.read_csv(args.data)
    model, metrics = train_detector(raw, contamination=args.contamination)
    save_artifacts(model, metrics, args.model_path, args.metrics_path)
    print(json.dumps(metrics, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
