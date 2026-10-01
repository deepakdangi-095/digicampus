import json
import zlib
from datetime import date
from difflib import get_close_matches
from functools import lru_cache

from app.core.config import settings
from app.schemas.career import CareerRequest, CareerResponse, EventSuggestion, SkillGap

ROLE_PROFILES: dict[str, dict] = {
    "software engineer": {"core": ["dsa", "oop", "git", "sql", "system design", "python", "rest api"],
                          "bonus": ["docker", "testing", "cloud"]},
    "backend developer": {"core": ["python", "sql", "rest api", "docker", "git", "system design", "testing"],
                          "bonus": ["redis", "kubernetes", "cloud"]},
    "frontend developer": {"core": ["javascript", "react", "html", "css", "git", "rest api", "testing"],
                           "bonus": ["typescript", "accessibility", "performance"]},
    "data scientist": {"core": ["python", "statistics", "machine learning", "sql", "pandas", "data visualization", "feature engineering"],
                       "bonus": ["deep learning", "mlops", "nlp"]},
    "data analyst": {"core": ["sql", "excel", "python", "statistics", "data visualization", "power bi"],
                     "bonus": ["tableau", "a/b testing"]},
    "machine learning engineer": {"core": ["python", "machine learning", "deep learning", "mlops", "docker", "sql", "dsa"],
                                  "bonus": ["cloud", "spark", "nlp"]},
    "devops engineer": {"core": ["linux", "docker", "kubernetes", "ci/cd", "cloud", "git", "scripting"],
                        "bonus": ["terraform", "monitoring"]},
    "embedded engineer": {"core": ["c", "microcontrollers", "rtos", "electronics", "iot", "debugging"],
                          "bonus": ["python", "pcb design"]},
}
GENERIC_CORE = ["dsa", "communication", "git", "problem solving", "sql"]

NUDGES = [
    "Solve 2 problems on {skill} today and write down one takeaway.",
    "Spend 30 focused minutes on {skill}: one tutorial, one hands-on exercise.",
    "Add one commit to a project that uses {skill}; small daily progress compounds.",
    "Explain {skill} out loud in 5 minutes as if teaching a junior; note where you stumble.",
    "Update one resume bullet today with a measurable result related to {skill}.",
]


@lru_cache
def _events() -> list[dict]:
    return json.loads((settings.data_dir / "events.json").read_text(encoding="utf-8"))


def _norm(items: list[str]) -> list[str]:
    return list(dict.fromkeys(s.strip().lower() for s in items if s.strip()))


def _stage(sem: int) -> str:
    if sem <= 2:
        return "Foundation: build fundamentals and coding habit"
    if sem <= 4:
        return "Skill building: projects and open-source exposure"
    if sem <= 6:
        return "Internship readiness: portfolio, internships and interview prep"
    return "Placement sprint: mock interviews, offers and final-year project"


def get_advice(req: CareerRequest, today: date | None = None) -> CareerResponse:
    today = today or date.today()
    role_key = req.target_job_role.strip().lower()
    match = get_close_matches(role_key, ROLE_PROFILES, n=1, cutoff=0.5)
    profile = ROLE_PROFILES[match[0]] if match else {"core": GENERIC_CORE, "bonus": []}
    matched_role = match[0].title() if match else req.target_job_role.title()

    strong, weak = _norm(req.strong_skills), _norm(req.weak_skills)
    core = profile["core"]
    covered = [s for s in core if s in strong]
    readiness = round(100 * len(covered) / len(core), 1)

    gaps: list[SkillGap] = []
    missing = [s for s in core if s not in strong]
    for idx, s in enumerate(missing):
        is_weak = s in weak
        prio = "HIGH" if is_weak or idx < max(2, len(missing) // 2) else "MEDIUM"
        gaps.append(SkillGap(
            skill=s, priority=prio,
            reason=("You flagged this as a weak area and it is core for " if is_weak else "Core requirement for ") + matched_role,
            suggested_action=f"Complete one structured course on {s} and build a mini-project demonstrating it.",
        ))
    gaps += [SkillGap(skill=s, priority="LOW", reason=f"Differentiator for {matched_role}",
                      suggested_action=f"Explore {s} after core gaps are closed.")
             for s in profile["bonus"] if s not in strong]
    gaps.sort(key=lambda g: {"HIGH": 0, "MEDIUM": 1, "LOW": 2}[g.priority])

    return CareerResponse(
        student_id=req.student_id, matched_role=matched_role, role_readiness_pct=readiness,
        stage=_stage(req.current_semester), skill_gaps=gaps[:8],
        resume_recommendations=_resume_tips(req, strong, gaps, matched_role),
        events=_match_events(req, set(strong) | {g.skill for g in gaps}),
        placement_eligibility=_eligibility(req),
        daily_nudge=_nudge(req, gaps, today),
    )


def _resume_tips(req: CareerRequest, strong: list[str], gaps: list[SkillGap], role: str) -> list[str]:
    tips = []
    if req.projects_count < 2:
        tips.append(f"Add at least 2 end-to-end projects relevant to {role}; link GitHub repos with README and demo.")
    else:
        tips.append("Rewrite project bullets as 'Action + Tech + Measurable result' (e.g. 'cut query time 40% using indexing').")
    if req.internships_count == 0 and req.current_semester >= 4:
        tips.append("Target a summer internship or a virtual work-experience programme; even 4-8 weeks strengthens the resume.")
    if strong:
        tips.append(f"Put a 'Technical Skills' block first, ordered by role relevance: {', '.join(strong[:6])}.")
    high = [g.skill for g in gaps if g.priority == "HIGH"][:3]
    if high:
        tips.append(f"Prioritise adding verifiable evidence (project/certificate) for: {', '.join(high)}.")
    tips += ["Keep the resume to one page with ATS-friendly formatting (no tables/graphics).",
             "Tailor the summary line to the target role and include your LinkedIn and GitHub links."]
    return tips


def _eligibility(req: CareerRequest) -> list[str]:
    """University placement rules (KB section 5)."""
    notes = []
    if req.cgpa is not None:
        notes.append("CGPA meets the 6.50 minimum." if req.cgpa >= 6.5
                     else f"CGPA {req.cgpa:.2f} is below the 6.50 minimum for campus drives.")
    if req.active_backlogs > 0:
        notes.append(f"{req.active_backlogs} active backlog(s): clear them before drive registration (no active backlogs allowed).")
    if req.ats_score is not None:
        notes.append("ATS score meets the 75% requirement." if req.ats_score >= 75
                     else f"ATS score {req.ats_score:.0f}% is below the mandatory 75%; fix formatting/skill omissions before deadlines.")
    else:
        notes.append("Run the Digi Campus AI Resume Advisor: resumes need an ATS score of at least 75% to apply.")
    if req.current_offer_ctc:
        notes.append(f"You are marked Placed. Further drives need an offer of at least {req.current_offer_ctc * 1.5:.2f} (1.5x current) - the Dream Offer rule.")
    return notes


def _match_events(req: CareerRequest, skills: set[str]) -> list[EventSuggestion]:
    out = []
    for e in _events():
        if req.current_semester < e["min_semester"]:
            continue
        overlap = [t for t in e["tags"] if t in skills]
        branch_hit = any(t in req.branch.lower() for t in e["tags"])
        score = round(min(1.0, 0.25 * len(overlap) + (0.2 if branch_hit else 0) + 0.1), 2)
        why = f"Builds {', '.join(overlap[:3])}." if overlap else "Broad exposure and networking for your semester."
        out.append(EventSuggestion(name=e["name"], type=e["type"], why_relevant=why, match_score=score,
                                   how_to_join=e.get("how_to_join"), url=e.get("url")))
    return sorted(out, key=lambda x: x.match_score, reverse=True)[:4]


def _nudge(req: CareerRequest, gaps: list[SkillGap], today: date) -> str:
    skill = gaps[0].skill if gaps else "your target role skills"
    seed = zlib.crc32(f"{req.student_id or req.target_job_role}{today.toordinal()}".encode())
    return NUDGES[seed % len(NUDGES)].format(skill=skill)
