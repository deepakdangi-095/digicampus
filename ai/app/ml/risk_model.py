"""Training utilities for the dropout / academic risk Random Forest."""
import logging
from datetime import datetime, timezone
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import classification_report
from sklearn.model_selection import train_test_split

logger = logging.getLogger(__name__)

FEATURES = ["attendance_pct", "midterm_pct", "assignment_submission_rate", "fee_delay_days"]
LABEL_COL = "risk_label"
CLASSES = ["LOW", "MEDIUM", "HIGH"]


def generate_synthetic_dataset(n: int = 8000, seed: int = 42) -> pd.DataFrame:
    """Bootstrap data so the service works on day one.

    IMPORTANT: replace with historical outcomes (dropped out / detained / failed) from your ERP
    via `scripts/train_risk_model.py --csv your_data.csv` before relying on predictions.
    """
    rng = np.random.default_rng(seed)
    att = np.clip(rng.normal(75, 15, n), 20, 100)
    mid = np.clip(rng.normal(62, 18, n), 0, 100)
    asg = np.clip(rng.normal(78, 20, n), 0, 100)
    fee = np.where(rng.random(n) < 0.7, 0, rng.integers(1, 120, n))

    latent = (
        0.35 * (100 - att) / 100
        + 0.30 * (100 - mid) / 100
        + 0.20 * (100 - asg) / 100
        + 0.15 * np.minimum(fee, 90) / 90
        + rng.normal(0, 0.05, n)
    )
    labels = np.where(latent < 0.25, "LOW", np.where(latent < 0.42, "MEDIUM", "HIGH"))
    return pd.DataFrame(
        {
            "attendance_pct": att.round(1),
            "midterm_pct": mid.round(1),
            "assignment_submission_rate": asg.round(1),
            "fee_delay_days": fee,
            LABEL_COL: labels,
        }
    )


def train_model(df: pd.DataFrame, seed: int = 42) -> tuple[RandomForestClassifier, dict]:
    missing = set(FEATURES + [LABEL_COL]) - set(df.columns)
    if missing:
        raise ValueError(f"Training data missing columns: {sorted(missing)}")
    df = df.dropna(subset=FEATURES + [LABEL_COL])
    X, y = df[FEATURES], df[LABEL_COL].str.upper()
    X_tr, X_te, y_tr, y_te = train_test_split(X, y, test_size=0.2, stratify=y, random_state=seed)

    clf = RandomForestClassifier(
        n_estimators=300,
        max_depth=10,
        min_samples_leaf=5,
        class_weight="balanced",
        n_jobs=-1,
        random_state=seed,
    ).fit(X_tr, y_tr)

    report = classification_report(y_te, clf.predict(X_te), output_dict=True, zero_division=0)
    metrics = {"accuracy": round(report["accuracy"], 4), "macro_f1": round(report["macro avg"]["f1-score"], 4)}
    logger.info("Risk model trained: %s", metrics)
    return clf, metrics


def save_bundle(clf: RandomForestClassifier, metrics: dict, path: Path) -> dict:
    bundle = {
        "model": clf,
        "features": FEATURES,
        "metrics": metrics,
        "version": "rf-" + datetime.now(timezone.utc).strftime("%Y%m%d%H%M"),
    }
    path.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(bundle, path)
    return bundle
