"""Deterministic policy checks derived from the university knowledge base.

Numbers in a student's question ("my attendance is 70%", "CGPA 6.2") are compared to the
official thresholds here instead of leaving arithmetic/range logic to a language model.
"""
import re

_PCT = re.compile(r"(\d{1,3}(?:\.\d+)?)\s*(?:%|percent|per cent)")
_CGPA = re.compile(r"cgpa\s*(?:is|of|=|:)?\s*(\d{1,2}(?:\.\d+)?)", re.I)


def parse_attendance(query: str) -> float | None:
    """Attendance percentage mentioned in a message like 'my attendance is 70%', else None."""
    if "attend" not in query.lower():
        return None
    m = _PCT.search(query.lower())
    return float(m.group(1)) if m and 0 <= float(m.group(1)) <= 100 else None


def attendance_status(pct: float) -> str:
    if pct < 65:
        return (f"At {pct:g}% attendance you are below 65% (Level 3): you are automatically barred from the End-Semester "
                "Exam for that course, receive an F-Repeat (FR) grade and must re-register; your hall ticket is locked "
                "and the case is escalated to your Faculty Advisor and HOD.")
    if pct < 75:
        return (f"At {pct:g}% you are below the mandatory 75% (Level 2 alert: push notification and SMS to your parent/guardian) "
                "but inside the 65.0-74.9% condonation band. Condonation is possible only on valid medical grounds or official "
                "university representation (sports/cultural/academic). Submit the condonation form in the Digi Campus App within "
                "5 business days of returning, with the medical certificate or event duty slip.")
    if pct < 78:
        return f"At {pct:g}% you meet the 75% minimum but are under 78%, which triggers a Level 1 in-app warning."
    return f"At {pct:g}% you are above the 75% mandatory threshold and the 78% early-warning level."


def cgpa_status(cgpa: float) -> str:
    if cgpa >= 6.5:
        return (f"A CGPA of {cgpa:g} meets the 6.50 minimum for campus placement drives, provided you have no active "
                "backlogs at registration and your resume's AI ATS score is at least 75%.")
    return f"A CGPA of {cgpa:g} is below the 6.50 minimum required to register for on-campus placement drives."


def attendance_pct(query: str) -> float | None:
    """Attendance % mentioned in the message ("my attendance is 70%"), if any."""
    q = query.lower()
    m = _PCT.search(q) if "attend" in q else None
    return float(m.group(1)) if m and 0 <= float(m.group(1)) <= 100 else None


def cgpa_value(query: str) -> float | None:
    m = _CGPA.search(query)
    return float(m.group(1)) if m and 0 <= float(m.group(1)) <= 10 else None


def extract_facts(query: str) -> list[str]:
    facts: list[str] = []
    if (pct := attendance_pct(query)) is not None:
        facts.append(attendance_status(pct))
    if (cg := cgpa_value(query)) is not None:
        facts.append(cgpa_status(cg))
    return facts
