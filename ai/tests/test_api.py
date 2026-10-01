from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_risk_high_vs_low():
    hi = client.post("/ai/predict-risk", json={"attendance_pct": 52, "midterm_pct": 30,
                     "assignment_submission_rate": 40, "fee_delay_days": 60}).json()
    lo = client.post("/ai/predict-risk", json={"attendance_pct": 94, "midterm_pct": 85,
                     "assignment_submission_rate": 98, "fee_delay_days": 0}).json()
    assert hi["risk_level"] == "HIGH" and lo["risk_level"] == "LOW"
    assert hi["risk_percentage"] > lo["risk_percentage"] and hi["warnings"]


def test_study_plan_has_7_days_and_pyqs():
    r = client.post("/ai/recommend-study-plan", json={"weak_topics": [
        {"subject": "DBMS", "topic": "Normalization", "proficiency": 25},
        {"subject": "Operating Systems", "topic": "Deadlocks", "proficiency": 40}]}).json()
    assert [d["day"] for d in r["timetable"]] == list(range(1, 8))
    assert r["pyqs"]


def test_career_and_evaluator():
    c = client.post("/ai/career-advisor", json={"branch": "Computer Science", "current_semester": 5,
                    "strong_skills": ["python", "sql"], "weak_skills": ["statistics"],
                    "target_job_role": "Data Scientist"}).json()
    assert c["matched_role"] == "Data Scientist" and c["skill_gaps"] and c["daily_nudge"]
    e = client.post("/ai/evaluate-assignment", json={
        "submission_text": "Normalization reduces redundancy. 1NF removes repeating groups and 2NF removes partial dependency.",
        "rubric": [{"name": "Definition", "description": "Normalization reduces data redundancy", "keywords": ["redundancy"]},
                   {"name": "Normal forms", "description": "Explains 1NF 2NF 3NF BCNF", "keywords": ["1NF", "2NF", "3NF", "BCNF"]}]}).json()
    assert 0 < e["total_score"] < e["max_score"] and e["missing_concepts"]
