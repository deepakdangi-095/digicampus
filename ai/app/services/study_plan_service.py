import json
import math
from datetime import date, timedelta
from functools import lru_cache

from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

from app.core.config import settings
from app.schemas.study_plan import (
    DayPlan, PYQItem, StudyPlanRequest, StudyPlanResponse, StudySession, WeakTopic,
)

LEARNING_DAYS = 5  # days 1-5 learn/practice, day 6 PYQ drill, day 7 revision + mock


@lru_cache
def _pyq_index():
    bank = json.loads((settings.data_dir / "pyq_bank.json").read_text(encoding="utf-8"))
    vec = TfidfVectorizer(ngram_range=(1, 2), stop_words="english", sublinear_tf=True)
    matrix = vec.fit_transform([f"{q['subject']} {q['topic']} {q['topic']} {q['question']}" for q in bank])
    return bank, vec, matrix


def find_pyqs(topic: WeakTopic, k: int) -> list[PYQItem]:
    bank, vec, matrix = _pyq_index()
    sims = cosine_similarity(vec.transform([f"{topic.subject} {topic.topic} {topic.topic}"]), matrix)[0]
    subj = topic.subject.lower()
    ranked = sorted(range(len(bank)), key=lambda i: sims[i], reverse=True)
    in_subject = [i for i in ranked if subj in bank[i]["subject"].lower() or bank[i]["subject"].lower() in subj]
    pool = in_subject or ranked
    return [
        PYQItem(**bank[i], relevance=round(float(sims[i]), 3))
        for i in pool[:k]
        if sims[i] > 0.03
    ]


def _learn_activity(prof: int, first_time: bool) -> str:
    if first_time:
        return "Concept building from fundamentals" if prof < 30 else "Concept revision with solved examples"
    return "Guided problem practice" if prof < 60 else "Timed problem solving"


def build_plan(req: StudyPlanRequest) -> StudyPlanResponse:
    start = req.start_date or date.today()
    topics = req.weak_topics
    daily = int(req.hours_per_day * 60)

    # Time budget proportional to weakness (min weight so strong-ish topics still get time)
    weights = [max(100 - t.proficiency, 10) for t in topics]
    pool = daily * LEARNING_DAYS
    remaining = [max(int(pool * w / sum(weights)), 15) for w in weights]
    order = sorted(range(len(topics)), key=lambda i: -weights[i])
    seen: set[int] = set()

    days: list[DayPlan] = []
    for d in range(LEARNING_DAYS):
        cap, sessions = daily, []
        rot = order[d % len(order):] + order[: d % len(order)]  # interleave subjects
        while cap > 0 and any(remaining):
            progressed = False
            for i in rot:
                if cap <= 0:
                    break
                if remaining[i] <= 0:
                    continue
                m = min(remaining[i], cap, 60)
                t = topics[i]
                sessions.append(StudySession(subject=t.subject, topic=t.topic,
                                             activity=_learn_activity(t.proficiency, i not in seen), minutes=m))
                seen.add(i)
                remaining[i] -= m
                cap -= m
                progressed = True
            if not progressed:
                break
        days.append(DayPlan(day=d + 1, date=start + timedelta(days=d),
                            focus="Learn & practice weakest topics" if d < 3 else "Practice & consolidate",
                            sessions=sessions, total_minutes=sum(s.minutes for s in sessions)))

    # Day 6: PYQ drill on the weakest topics
    top = [topics[i] for i in order[:6]]
    per = max(20, daily // max(len(top), 1))
    s6 = [StudySession(subject=t.subject, topic=t.topic,
                       activity=f"Solve {req.pyqs_per_topic} PYQs under exam conditions", minutes=per) for t in top]
    days.append(DayPlan(day=6, date=start + timedelta(days=5), focus="Previous Year Question drill",
                        sessions=s6, total_minutes=sum(s.minutes for s in s6)))

    # Day 7: revision + mock
    rev = max(10, math.floor((daily - 60) / max(len(topics), 1)))
    s7 = [StudySession(subject=t.subject, topic=t.topic, activity="Quick revision of notes & formulas", minutes=rev)
          for t in topics]
    s7.append(StudySession(subject="All", topic="Mixed", activity="Timed mock test + error analysis", minutes=60))
    days.append(DayPlan(day=7, date=start + timedelta(days=6), focus="Revision & mock test",
                        sessions=s7, total_minutes=sum(s.minutes for s in s7)))

    pyqs, seen_ids = [], set()
    for t in topics:
        for q in find_pyqs(t, req.pyqs_per_topic):
            if q.id not in seen_ids:
                seen_ids.add(q.id)
                pyqs.append(q)

    weakest = topics[order[0]]
    summary = (f"7-day plan across {len(topics)} weak topic(s) at {req.hours_per_day:g}h/day. "
               f"Highest priority: {weakest.subject} - {weakest.topic} (proficiency {weakest.proficiency}%).")
    return StudyPlanResponse(student_id=req.student_id, summary=summary, timetable=days, pyqs=pyqs)
