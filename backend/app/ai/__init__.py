"""Phase 2 AI layer: data preparation, forecasting, detection and explanation.

Modules in this package are deliberately import-light: training scripts import
pandas/xgboost/scikit-learn only when they run, and the API/ingestion code
imports the inference helpers lazily so that Phase 1 stays functional even
when no model artifact has been trained yet.
"""

from __future__ import annotations

__all__ = [
    "detector",
    "explainer",
    "features",
    "forecaster",
    "prepare_data",
    "train_detector",
    "train_forecaster",
]
