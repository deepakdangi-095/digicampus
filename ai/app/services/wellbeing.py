"""Wellbeing safeguard: recognises messages about self-harm and responds with care and real support options."""
import re

_CRISIS = re.compile(
    r"\b(suicid\w*|kill\s+myself|end\s+my\s+life|want\s+to\s+die|wanna\s+die|don'?t\s+want\s+to\s+live|"
    r"self[-\s]?harm|hurt\s+myself|no\s+reason\s+to\s+live|better\s+off\s+dead)\b", re.I)
_DISTRESS = re.compile(r"\b(stress(?:ed)?|anxious|anxiety|overwhelm\w*|burn(?:ed|t)?\s*out|feeling\s+low|feel\s+low|depress\w*|hopeless)\b", re.I)

TELEMANAS = {"title": "Tele-MANAS (free 24x7 helpline)", "url": "https://telemanas.mohfw.gov.in/",
             "why": "Call 14416 or 1-800-891-4416 to talk to a trained counsellor, in many languages."}

CRISIS_RESPONSE = (
    "I'm really sorry you're going through this. What you're feeling matters, and you don't have to face it alone.\n\n"
    "Please reach out to someone right now who can be with you: a friend, a family member, your hostel warden, or your "
    "campus counsellor. You can also call Tele-MANAS on 14416 or 1-800-891-4416 (free, 24x7, many languages) to talk to a "
    "trained counsellor. If you are in immediate danger, call 112.\n\n"
    "I'm here with you, and we can keep talking while you reach out to them.")


def is_crisis(query: str) -> bool:
    return bool(_CRISIS.search(query))


def is_distressed(query: str) -> bool:
    return bool(_DISTRESS.search(query))
