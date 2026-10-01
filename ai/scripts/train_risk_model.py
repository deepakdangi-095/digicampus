"""Train and persist the risk model.

  python scripts/train_risk_model.py                     # synthetic bootstrap data
  python scripts/train_risk_model.py --csv history.csv   # real data
CSV columns: attendance_pct, midterm_pct, assignment_submission_rate, fee_delay_days, risk_label (LOW|MEDIUM|HIGH)
"""
import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pandas as pd  # noqa: E402

from app.core.config import settings  # noqa: E402
from app.ml.risk_model import generate_synthetic_dataset, save_bundle, train_model  # noqa: E402

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--csv", type=Path)
    args = ap.parse_args()
    df = pd.read_csv(args.csv) if args.csv else generate_synthetic_dataset()
    clf, metrics = train_model(df)
    bundle = save_bundle(clf, metrics, settings.risk_model_path)
    print(f"Saved {settings.risk_model_path} | version={bundle['version']} | {metrics}")
