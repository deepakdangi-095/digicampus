"""Mentor layer: motivation, next steps, event participation nudges and curated web resources.

Deterministic and offline (no LLM needed). Catalogs live in data/events.json and data/resources.json;
edit them to add your college's own clubs, fests and links. Pure Python (+ kb_loader tokenizer).
"""
import json
import re
import zlib
from dataclasses import dataclass, field
from datetime import date
from functools import lru_cache
from pathlib import Path

from app.services.kb_loader import tokenize
from app.services.policy_rules import attendance_pct, cgpa_value
from app.services.wellbeing import is_distressed


@dataclass
class ResourceLink:
    title: str
    url: str
    why: str


@dataclass
class EventTip:
    name: str
    type: str
    why_relevant: str
    how_to_join: str
    url: str | None = None


@dataclass
class CoachingResult:
    motivation: str = ""
    next_steps: list[str] = field(default_factory=list)
    events: list[EventTip] = field(default_factory=list)
    resources: list[ResourceLink] = field(default_factory=list)


@dataclass
class Profile:
    branch: str | None = None
    semester: int | None = None
    interests: list[str] = field(default_factory=list)
    target_role: str | None = None


@lru_cache
def load_catalogs(data_dir: str) -> tuple[list[dict], list[dict]]:
    d = Path(data_dir)
    return (json.loads((d / "events.json").read_text(encoding="utf-8")),
            json.loads((d / "resources.json").read_text(encoding="utf-8")))


# ---- intent detection -------------------------------------------------------
_ANCHORS = re.compile(r"\b(attendance|condon\w*|duty slip|hall ticket|sgpa|grade point|backlogs?|ats|cgpa|hostel|"
                      r"roommates?|seating|bonafide|dream offer|f-?repeat)\b", re.I)
_EVENT_Q = re.compile(r"\b(hackathons?|events?|contests?|competitions?|workshops?|fests?|bootcamps?|gsoc|sih|"
                      r"open[- ]source|extracurriculars?|clubs?)\b", re.I)
_RES_Q = re.compile(r"\b(resources?|courses?|tutorials?|websites?|platforms?|roadmaps?|internships?|study material|"
                    r"learn(?:ing)?|how (?:do|can|should) i (?:prepare|start|study))\b", re.I)
_MOTIV_Q = re.compile(r"\b(motivat\w*|demotivat\w*|discourag\w*|lazy|procrastinat\w*|burn(?:ed|t)?\s*out|feeling low|"
                      r"feel low|can'?t focus|cannot focus|no interest|losing interest|stress(?:ed)?|anxious|anxiety|"
                      r"overwhelm\w*)\b", re.I)


def guidance_intent(query: str) -> str | None:
    if _MOTIV_Q.search(query):
        return "motivation"
    if _ANCHORS.search(query):  # policy questions go to the knowledge base
        return None
    if _EVENT_Q.search(query):
        return "events"
    if _RES_Q.search(query):
        return "resources"
    return None


# ---- selection ----------------------------------------------------------------
CATEGORY_TAGS = {"career": "career internship interview resume placement", "exams": "exam learning practice",
                 "regulations": "learning", "workflow": "documents", "hostel": ""}


def _ctx(query: str, category: str | None, p: Profile, extra: str = "") -> set[str]:
    text = " ".join([query, extra, CATEGORY_TAGS.get(category or "", ""), p.branch or "", p.target_role or "", " ".join(p.interests)])
    return set(tokenize(text))


def _matches(tags: list[str], ctx: set[str]) -> list[str]:
    """A tag matches only if ALL its words appear (so 'machine learning' is not triggered by 'learning' alone)."""
    return [t for t in tags if (toks := set(tokenize(t))) and toks <= ctx]


def _tag_weights(items: list[dict]) -> dict[str, float]:
    """Rarer tags are more specific, so they count for more than tags shared by most items."""
    freq: dict[str, int] = {}
    for it in items:
        for t in it["tags"]:
            freq[t] = freq.get(t, 0) + 1
    return {t: 1.0 / n for t, n in freq.items()}


def pick_events(query: str, category: str | None, p: Profile, catalogs, k: int = 2) -> list[EventTip]:
    events, _ = catalogs
    ctx, w = _ctx(query, category, p), _tag_weights(events)
    scored = []
    for e in events:
        if p.semester and p.semester < e["min_semester"]:
            continue
        hits = _matches(e["tags"], ctx)
        early = 0.3 if e.get("beginner_friendly") and (p.semester or 1) <= 4 else 0.15 if e.get("beginner_friendly") else 0
        scored.append((sum(w[t] for t in hits) + early, hits, e))
    scored.sort(key=lambda x: x[0], reverse=True)
    out = []
    for _, hits, e in scored[:k]:
        why = (f"Matches your interest in {', '.join(hits[:3])}." if hits
               else "A great way to build skills, friendships and confidence beyond the classroom.")
        out.append(EventTip(e["name"], e["type"], why, e["how_to_join"], e.get("url")))
    return out


def pick_resources(query: str, category: str | None, p: Profile, catalogs, k: int = 3, extra: str = "") -> list[ResourceLink]:
    _, resources = catalogs
    ctx, w = _ctx(query, category, p, extra), _tag_weights(resources)
    scored = []
    for r in resources:
        if "wellbeing" in r["tags"] and not is_distressed(query):
            continue
        hits = _matches(r["tags"], ctx)
        scored.append((sum(w[t] for t in hits) + (0.05 if "beginner" in r["tags"] else 0), r))
    scored.sort(key=lambda x: x[0], reverse=True)
    return [ResourceLink(r["title"], r["url"], r["why"]) for s, r in scored[:k] if s > 0]


# ---- coaching for knowledge-base answers -----------------------------------------
GENERAL_MOTIVATION = [
    "Every semester is a fresh chance to improve, and small consistent steps beat last-minute heroics.",
    "You don't need to be perfect, just a little better than yesterday. Pick one small action today.",
    "Campus life is more than classes: the students who grow fastest mix studies with projects, events and mentors.",
    "Progress feels slow until one day it doesn't. Keep showing up, and let your effort compound.",
    "Asking questions and seeking guidance is a strength, not a weakness. You're doing exactly that.",
]


LOW_MOOD_MESSAGES = [
    "Feeling stuck doesn't mean you're failing. It usually means you're stretching, and that's where growth happens.",
    "One rough patch doesn't define your semester. Small steps, taken today, are enough to turn the week around.",
    "You've handled hard things before. Let's shrink the problem to one small step you can do in the next 10 minutes.",
]


def _seeded(items: list, seed: str):
    return items[zlib.crc32(f"{seed}{date.today().toordinal()}".encode()) % len(items)]


def situation(query: str) -> tuple[str, list[str]] | None:
    att, cg = attendance_pct(query), cgpa_value(query)
    if att is not None:
        if att < 65:
            return ("This is a serious situation, but it is not the end of your journey. Acting today gives you the most options.",
                    ["Meet your Faculty Advisor or HOD this week and talk through your options openly.",
                     "Attend every remaining class and lab in this course, and keep any proof (medical or event duty slips) in the app.",
                     "Prepare a backup plan: if the course has to be re-registered, start a 7-day study plan early so the repeat goes smoothly."])
        if att < 75:
            return ("You're in a recoverable zone, and you still have time to protect your exam eligibility.",
                    ["If you have valid medical proof or an event duty slip, submit the condonation form in the app within 5 business days of returning.",
                     "Attend every upcoming class and lab so the number only goes up from here.",
                     "Tell your Faculty Advisor early; they can guide you before the deadline."])
        if att < 78:
            return ("You're above the line, so protect it!", ["Try not to skip anything: staying at 78% or above avoids the early-warning alert.",
                                                              "Track your attendance weekly in the app."])
        return ("Great job. Healthy attendance is one of the best habits for good grades.",
                ["Keep the streak going and use the extra time for projects, clubs or an event you're curious about."])
    if cg is not None:
        if cg < 6.5:
            return ("Placement eligibility is one route, and your next semester can change your CGPA. Let's build a plan.",
                    ["Aim to clear any backlogs and lift your next SGPA: ask for a 7-day study plan on your weakest subjects.",
                     "Build proof of skill in parallel: one solid project or a hackathon entry speaks loudly to recruiters and gives you options beyond campus drives.",
                     "Meet the Training & Placement cell to understand all the routes open to you."])
        return ("You meet the CGPA bar. Now let's make the rest of your profile shine.",
                ["Make sure you have no active backlogs and your resume's ATS score is 75% or more.",
                 "Join a mock placement drive and one coding contest to get interview-ready."])
    return None


CATEGORY_STEPS = {
    "career": ["Run your resume through the AI Resume Advisor and aim for an ATS score of 75% or higher.",
               "Build or polish two projects and put the links on your resume.",
               "Join one hackathon or contest this month to practise under real deadlines."],
    "exams": ["Solve previous year questions under timed conditions and review every mistake.",
              "Ask for a 7-day study plan built around your weakest topics.",
              "Keep your Smart QR pass ready and leave smartwatches and phones out of the exam hall."],
    "hostel": ["Fill in the Hostel Preference Form honestly: better answers mean better roommate matches.",
               "Review your ranked roommate list calmly and accept a mutual pairing you feel good about."],
    "workflow": ["Submit early with all documents attached so the first stage can act quickly.",
                 "Track your application stage in the app and use the 48-hour escalation if nothing moves."],
    "regulations": ["Check your subject-wise attendance in the app every week.",
                    "Plan your study time early in the semester rather than near exams."],
}


def build_coaching(query: str, category: str | None, profile: Profile, seed: str, catalogs) -> CoachingResult:
    sit = situation(query)
    motivation, steps = sit if sit else (_seeded(GENERAL_MOTIVATION, seed), CATEGORY_STEPS.get(category or "", []))
    att = attendance_pct(query)
    want_events = (category in (None, "career") or cgpa_value(query) is not None) and not (att is not None and att < 78)
    events = pick_events(query, category, profile, catalogs, k=2) if want_events else []
    res_k = 0 if category == "hostel" else 2
    resources = pick_resources(query, category, profile, catalogs, k=res_k)
    return CoachingResult(motivation=motivation, next_steps=steps[:3], events=events, resources=resources)


# ---- direct guidance answers (no knowledge-base lookup) ------------------------------
DUTY_TIP = ("Tip: when you officially represent the university at a sports, cultural or academic event, ask for an event "
            "duty slip. Attendance lost that way can be condoned if you fall in the 65-74.9% band.")


def events_reply(query: str, profile: Profile, seed: str, catalogs) -> tuple[str, CoachingResult]:
    events = pick_events(query, None, profile, catalogs, k=3)
    lines = "\n".join(f"- **{e.name}** ({e.type}): {e.why_relevant} {e.url or ''}".rstrip() for e in events)
    text = ("Getting involved beyond the classroom is one of the best things you can do: you build skills, friends and a "
            "stronger resume. Here are options that fit you:\n" + lines +
            "\n\nPick just ONE to start this month. Small steps count! Always check the official site for current dates "
            "and eligibility.\n" + DUTY_TIP)
    res = pick_resources(query, None, profile, catalogs, k=2, extra="event hackathon")
    return text, CoachingResult(motivation="You've got this. Every big achievement started with signing up for something small.",
                                next_steps=[f"{e.name}: {e.how_to_join}" for e in events[:3]], events=events, resources=res)


def resources_reply(query: str, profile: Profile, seed: str, catalogs) -> tuple[str, CoachingResult]:
    res = pick_resources(query, None, profile, catalogs, k=4, extra="learning")
    lines = "\n".join(f"- **{r.title}**: {r.why} {r.url}" for r in res)
    text = ("Great initiative! Here are trusted web resources to learn from:\n" + lines +
            "\n\nStart with just one and give it 30 focused minutes today. Then add a small project to lock in what you learn.")
    events = pick_events(query, None, profile, catalogs, k=1)
    return text, CoachingResult(motivation="Self-learning is a superpower. Consistency matters more than intensity.",
                                next_steps=["Pick one resource and finish one lesson today.", "Build a tiny project with what you learned this week."],
                                events=events, resources=res)


MICRO_STEPS = [
    "Work in one 25-minute focus block, then take a 5-minute break. Just start: the first 5 minutes are the hardest.",
    "Write down the 3 most important tasks for today and finish the smallest one first.",
    "Message a friend or mentor and study together for an hour; company makes effort easier.",
    "Choose one event, club or contest to join this month. Fresh energy and new people help motivation a lot.",
]


def motivation_reply(query: str, profile: Profile, seed: str, catalogs) -> tuple[str, CoachingResult]:
    msg = _seeded(LOW_MOOD_MESSAGES, seed)
    text = (f"I hear you, and it's completely normal to have low-energy days. {msg}\n\nTry this today:\n" +
            "\n".join(f"- {s}" for s in MICRO_STEPS[:3]))
    if is_distressed(query):
        text += ("\n\nIf the stress feels heavy or keeps building, please talk to your campus counsellor, a mentor, or a "
                 "trusted friend. You can also call Tele-MANAS on 14416 (free, 24x7). Asking for support is a sign of strength.")
    events = pick_events(query, None, profile, catalogs, k=1)
    res = pick_resources(query, None, profile, catalogs, k=2, extra="learning")
    return text, CoachingResult(motivation=msg, next_steps=MICRO_STEPS[:3], events=events, resources=res)
