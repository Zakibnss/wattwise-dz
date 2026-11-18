"""Explicit CLI training of the XGBoost power forecaster.

Usage (from the backend container)::

    python -m app.ai.train_forecaster

The command is intentionally *not* executed at application startup. Training
writes ``models/forecaster.pkl``, a sidecar ``models/forecaster_metrics.json``
and one row in the ``model_runs`` table.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import joblib
import pandas as pd
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from xgboost import XGBRegressor

from app.ai.features import FEATURE_COLUMNS, TARGET_COLUMN, build_features
from app.ai.forecaster import METRICS_PATH, MODEL_PATH

BACKEND_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_DATA_PATH = BACKEND_ROOT / "data" / "training_data.csv"
DEFAULT_MODEL_NAME = "forecaster_v1"


def train_model(
    features: pd.DataFrame,
    test_size: float = 0.2,
    random_state: int = 42,
) -> tuple[XGBRegressor, dict[str, float]]:
    """Fit the XGBoost regressor and evaluate it on a time-ordered holdout.

    Args:
        features: Output of :func:`app.ai.features.build_features`.
        test_size: Fraction of the newest rows reserved for evaluation.
        random_state: Seed for XGBoost's internal randomness.

    Returns:
        The fitted estimator and a metrics dict with ``mae``, ``rmse`` and
        ``r2``.

    Raises:
        ValueError: If the table is too small to split or lacks feature columns.
    """
    missing = set(FEATURE_COLUMNS).union({TARGET_COLUMN}).difference(features.columns)
    if missing:
        raise ValueError("Training data is missing columns: " + ", ".join(sorted(missing)))

    ordered = features.sort_values("timestamp").reset_index(drop=True)
    split_index = int(len(ordered) * (1.0 - test_size))
    if split_index < 2 or split_index >= len(ordered):
        raise ValueError(
            f"Not enough rows to train with test_size={test_size}: got {len(ordered)}"
        )

    x_train = ordered.loc[: split_index - 1, list(FEATURE_COLUMNS)]
    y_train = ordered.loc[: split_index - 1, TARGET_COLUMN]
    x_test = ordered.loc[split_index:, list(FEATURE_COLUMNS)]
    y_test = ordered.loc[split_index:, TARGET_COLUMN]

    model = XGBRegressor(
        n_estimators=200,
        max_depth=5,
        learning_rate=0.05,
        objective="reg:squarederror",
        random_state=random_state,
        n_jobs=-1,
    )
    model.fit(x_train, y_train)
    predictions = model.predict(x_test)

    metrics = {
        "mae": float(mean_absolute_error(y_test, predictions)),
        "rmse": float(mean_squared_error(y_test, predictions) ** 0.5),
        "r2": float(r2_score(y_test, predictions)),
    }
    return model, metrics


def save_artifacts(
    model: XGBRegressor,
    metrics: dict[str, Any],
    model_path: Path = MODEL_PATH,
    metrics_path: Path = METRICS_PATH,
) -> None:
    """Persist the estimator and its metrics sidecar."""
    model_path.parent.mkdir(parents=True, exist_ok=True)
    metrics_path.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(model, model_path)
    metrics_path.write_text(
        json.dumps(metrics, indent=2, ensure_ascii=False), encoding="utf-8"
    )


async def persist_model_run(
    metrics: dict[str, Any],
    model_name: str = DEFAULT_MODEL_NAME,
    notes: str | None = None,
) -> int:
    """Insert one training-metrics row into ``model_runs``.

    Args:
        metrics: Dict containing at least ``mae``, ``rmse``, ``r2`` and
            optionally ``n_samples`` / ``trained_at``.
        model_name: Model identifier stored in the row.
        notes: Optional free-form notes.

    Returns:
        The primary key of the inserted row.
    """
    from app.database import SessionLocal
    from app.models import ModelRun

    raw_trained_at = metrics.get("trained_at")
    if isinstance(raw_trained_at, str):
        trained_at = datetime.fromisoformat(raw_trained_at)
    elif isinstance(raw_trained_at, datetime):
        trained_at = raw_trained_at
    else:
        trained_at = datetime.now(timezone.utc)
    if trained_at.tzinfo is None:
        trained_at = trained_at.replace(tzinfo=timezone.utc)

    async with SessionLocal() as session:
        run = ModelRun(
            model_name=model_name,
            trained_at=trained_at,
            mae=float(metrics["mae"]),
            rmse=float(metrics["rmse"]),
            r2=float(metrics["r2"]),
            n_samples=int(metrics.get("n_samples", 0)),
            notes=notes,
        )
        session.add(run)
        await session.commit()
        await session.refresh(run)
        return int(run.id)


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    """Parse command-line options."""
    parser = argparse.ArgumentParser(description="Train the WATTWISE DZ XGBoost forecaster.")
    parser.add_argument("--data", type=Path, default=DEFAULT_DATA_PATH)
    parser.add_argument("--model-path", type=Path, default=MODEL_PATH)
    parser.add_argument("--metrics-path", type=Path, default=METRICS_PATH)
    parser.add_argument("--test-size", type=float, default=0.2)
    parser.add_argument(
        "--skip-db",
        action="store_true",
        help="Write artifacts only (do not insert a model_runs row).",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    """Run training end to end and print metrics as JSON."""
    args = parse_args(argv)
    if not args.data.is_file():
        print(
            f"Training data not found at {args.data}. "
            "Run: python -m app.ai.prepare_data",
            file=sys.stderr,
        )
        return 1

    raw = pd.read_csv(args.data)
    features = build_features(raw)
    if features.empty:
        print("Training data produced no usable feature rows.", file=sys.stderr)
        return 1

    model, metrics = train_model(features, test_size=args.test_size)
    metrics.update(
        {
            "model_name": DEFAULT_MODEL_NAME,
            "trained_at": datetime.now(timezone.utc).isoformat(),
            "n_samples": int(len(features)),
            "n_train": int(len(features) * (1.0 - args.test_size)),
            "n_test": int(len(features) - len(features) * (1.0 - args.test_size)),
        }
    )

    save_artifacts(model, metrics, args.model_path, args.metrics_path)
    print(json.dumps(metrics, indent=2, ensure_ascii=False))

    if not args.skip_db:
        try:
            run_id = asyncio.run(persist_model_run(metrics))
            print(f"Recorded model_runs row id={run_id}")
        except Exception as exc:  # pragma: no cover - DB outage
            print(
                f"Warning: could not record model_runs row: {exc}",
                file=sys.stderr,
            )
            return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
