"""Lightweight conversational layer: greetings, thanks, identity questions and follow-up suggestions."""
import re

_GREET = re.compile(r"^\s*(hi+|hello+|hey+|namaste|good\s+(morning|afternoon|evening))\b[\s,!.]*", re.I)
_THANKS = re.compile(r"\b(thanks?|thank\s+you|thx|ty)\b", re.I)
_BYE = re.compile(r"\b(bye|goodbye|see\s+you|good\s*night)\b", re.I)
_IDENT = re.compile(r"\b(who\s+are\s+you|what\s+can\s+you\s+do|what\s+do\s+you\s+do|help\s+me\s+with)\b", re.I)

DEFAULT_SUGGESTIONS = [
    "What is the minimum attendance required?",
    "Suggest events I can join this semester",
    "Which websites should I use to learn DSA?",
    "I feel demotivated, can you help?",
]
CATEGORY_SUGGESTIONS = {
    "regulations": ["What happens if my attendance is below 65%?", "How is SGPA calculated?", "What is the passing criterion?"],
    "hostel": ["How is roommate compatibility scored?", "What details go in the hostel preference form?"],
    "exams": ["What items are prohibited in the exam hall?", "How does the seating allocation work?"],
    "workflow": ["What happens if an application is pending for 48 hours?", "Who approves a bonafide certificate?"],
    "career": ["What ATS score do I need?", "How can I prepare for placements?", "Suggest hackathons I can join"],
    "coach": ["Suggest events I can join this semester", "How do I learn Python step by step?", "What should I do to improve my resume?"],
}

RESPONSES = {
    "greeting": "Hello! I'm the Digi Campus Assistant. Ask me about attendance rules, grading, exams, hostel allocation, approvals or placements.",
    "thanks": "You're welcome! Ask me anything else about campus rules whenever you need.",
    "bye": "Goodbye! Good luck with your studies.",
    "identity": ("I'm the Digi Campus Assistant and mentor. I answer questions from the official university knowledge base "
                 "(attendance, grading, exams, hostel, approvals, placements), check numbers like your attendance % or CGPA "
                 "against the rules, and verify my answers against the source text. I can also motivate you, suggest events "
                 "and hackathons to join, and point you to free web resources to learn and practise."),
}


def detect_intent(query: str) -> str | None:
    q = query.strip()
    if _IDENT.search(q):
        return "identity"
    if "?" in q or len(q.split()) > 6:
        return None
    if _THANKS.search(q):
        return "thanks"
    if _BYE.search(q):
        return "bye"
    m = _GREET.match(q)
    if m and len(q[m.end():].split()) <= 2:
        return "greeting"
    return None


def suggestions_for(category: str | None) -> list[str]:
    return CATEGORY_SUGGESTIONS.get(category or "", DEFAULT_SUGGESTIONS)
