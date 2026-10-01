import logging
import threading

import joblib
import pandas as pd

from app.core.config import settings
from app.ml.risk_model import CLASSES, FEATURES, generate_synthetic_dataset, save_bundle, train_model
from app.schemas.risk import RiskFactor, RiskRequest, RiskResponse

logger = logging.getLogger(__name__)


class RiskService:
    def __init__(self) -> None:
        self._bundle: dict | None = None
        self._lock = threading.Lock()

    def load(self) -> dict:
        with self._lock:
            if self._bundle is None:
                path = settings.risk_model_path
                if path.exists():
                    self._bundle = joblib.load(path)
                else:
                    logger.warning("No trained model at %s; bootstrapping on synthetic data.", path)
                    clf, metrics = train_model(generate_synthetic_dataset())
                    self._bundle = save_bundle(clf, metrics, path)
            return self._bundle

    def predict(self, req: RiskRequest) -> RiskResponse:
        bundle = self.load()
        clf = bundle["model"]
        X = pd.DataFrame(
            [[req.attendance_pct, req.midterm_pct, req.assignment_submission_rate, req.fee_delay_days]],
            columns=FEATURES,
        )
        proba = dict(zip(clf.classes_, clf.predict_proba(X)[0]))
        p = {c: float(proba.get(c, 0.0)) for c in CLASSES}
        level = max(p, key=p.get)
        risk_pct = round(100 * (0.5 * p["MEDIUM"] + p["HIGH"]), 1)

        return RiskResponse(
            student_id=req.student_id,
            risk_level=level,
            risk_percentage=risk_pct,
            probabilities={k: round(v, 4) for k, v in p.items()},
            top_factors=self._factors(req, clf.feature_importances_),
            warnings=self._warnings(req),
            recommended_actions=self._actions(level, req),
            model_version=bundle["version"],
        )

    @staticmethod
    def _factors(req: RiskRequest, importances) -> list[RiskFactor]:
        components = {
            "attendance_pct": (req.attendance_pct, (100 - req.attendance_pct) / 100),
            "midterm_pct": (req.midterm_pct, (100 - req.midterm_pct) / 100),
            "assignment_submission_rate": (req.assignment_submission_rate, (100 - req.assignment_submission_rate) / 100),
            "fee_delay_days": (req.fee_delay_days, min(req.fee_delay_days, 90) / 90),
        }
        imp = dict(zip(FEATURES, importances))
        raw = {k: imp[k] * comp for k, (_, comp) in components.items()}
        total = sum(raw.values()) or 1.0
        factors = [
            RiskFactor(feature=k, value=components[k][0], impact_pct=round(100 * v / total, 1))
            for k, v in raw.items()
        ]
        return sorted(factors, key=lambda f: f.impact_pct, reverse=True)[:3]

    @staticmethod
    def _warnings(r: RiskRequest) -> list[str]:
        w: list[str] = []
        if r.attendance_pct < 65:
            w.append(f"LEVEL 3 CRITICAL: Attendance {r.attendance_pct:.1f}% is below 65%: barred from the End-Semester Exam (F-Repeat grade) and hall ticket is locked.")
        elif r.attendance_pct < 75:
            w.append(f"LEVEL 2: Attendance {r.attendance_pct:.1f}% is below the mandatory 75%. Condonation is possible only with a medical certificate or event duty slip.")
        elif r.attendance_pct < 78:
            w.append(f"LEVEL 1: Attendance {r.attendance_pct:.1f}% is close to the 75% mandatory threshold.")
        if r.midterm_pct < 40:
            w.append(f"Mid-term average {r.midterm_pct:.1f}% is in the failing range.")
        elif r.midterm_pct < 50:
            w.append(f"Mid-term average {r.midterm_pct:.1f}% is borderline.")
        if r.assignment_submission_rate < 60:
            w.append(f"Only {r.assignment_submission_rate:.0f}% of assignments submitted on time.")
        if r.fee_delay_days > 30:
            w.append(f"Fee payment overdue by {r.fee_delay_days} days (possible financial distress).")
        elif r.fee_delay_days > 0:
            w.append(f"Fee payment overdue by {r.fee_delay_days} days.")
        return w

    @staticmethod
    def _actions(level: str, r: RiskRequest) -> list[str]:
        a: list[str] = []
        if level == "HIGH":
            a += ["Schedule a faculty-mentor counselling session within 48 hours.",
                  "Notify parent/guardian and the HOD via the alert center."]
        elif level == "MEDIUM":
            a.append("Assign a peer mentor and review progress again in 2 weeks.")
        else:
            a.append("No intervention needed; continue routine monitoring.")
        if r.attendance_pct < 65:
            a.append("Escalate to Faculty Advisor and HOD; student must re-register for the course if the deficit stands.")
        elif r.attendance_pct < 75:
            a.append("Ask the student to file a condonation form in the app within 5 business days (medical certificate / event duty slip).")
        if r.midterm_pct < 50:
            a.append("Enrol the student in remedial classes and generate a 7-day study plan.")
        if r.assignment_submission_rate < 60:
            a.append("Set assignment-deadline reminders and offer a supervised catch-up session.")
        if r.fee_delay_days > 0:
            a.append("Offer fee-extension request or refer to the scholarship/financial-aid office.")
        return a


risk_service = RiskService()
