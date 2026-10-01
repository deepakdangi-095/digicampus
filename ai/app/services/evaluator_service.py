import logging
import re

from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

from app.core.llm import get_llm
from app.schemas.evaluation import CriterionResult, EvaluationRequest, EvaluationResponse

logger = logging.getLogger(__name__)
_TOKEN = re.compile(r"[a-z0-9+#/.\-]+")
_SUFFIXES = ("ization", "ations", "ation", "ings", "ing", "edly", "ed", "ies", "es", "s", "ly")


def _stem(w: str) -> str:
    for suf in _SUFFIXES:
        if w.endswith(suf) and len(w) - len(suf) >= 3:
            return w[: -len(suf)]
    return w


def _stems(text: str) -> list[str]:
    return [_stem(t.strip(".-")) for t in _TOKEN.findall(text.lower()) if t.strip(".-")]


def _sentences(text: str) -> list[str]:
    parts = [s.strip() for s in re.split(r"(?<=[.!?])\s+|\n+", text) if len(s.strip()) > 8]
    return parts or [text]


def _grade(pct: float) -> str:
    for cut, g in [(90, "O"), (80, "A+"), (70, "A"), (60, "B+"), (55, "B"), (50, "C"), (40, "P")]:
        if pct >= cut:
            return g
    return "F"


def evaluate(req: EvaluationRequest) -> EvaluationResponse:
    text = req.submission_text
    doc_stems = set(_stems(text))
    words = len(text.split())
    sentences = _sentences(text)

    # One TF-IDF space for submission sentences + rubric criteria
    crit_texts = [f"{c.name}. {c.description} {' '.join(c.keywords)}" for c in req.rubric]
    vec = TfidfVectorizer(ngram_range=(1, 2), stop_words="english", sublinear_tf=True).fit(sentences + crit_texts)
    sent_m, crit_m = vec.transform(sentences), vec.transform(crit_texts)
    sims = cosine_similarity(crit_m, sent_m)  # criteria x sentences

    total_w = sum(c.weight for c in req.rubric)
    results: list[CriterionResult] = []
    total = 0.0

    for ci, c in enumerate(req.rubric):
        max_c = req.max_score * c.weight / total_w
        matched = [k for k in c.keywords if k.strip() and all(s in doc_stems for s in _stems(k))]
        missing = [k for k in c.keywords if k not in matched]
        kw_cov = len(matched) / len(c.keywords) if c.keywords else 0.0
        sem = float(min(1.0, sims[ci].max() / 0.5))  # cosine 0.5 ~ strong paraphrase match
        coverage = round(0.6 * kw_cov + 0.4 * sem if c.keywords else sem, 3)
        frac = min(1.0, coverage / 0.85)
        score = round(max_c * frac, 2)
        total += score

        if coverage >= 0.75:
            fb = "Well covered."
        elif coverage >= 0.4:
            fb = "Partially covered" + (f"; elaborate on: {', '.join(missing[:4])}." if missing else "; add more depth and examples.")
        else:
            fb = "Largely missing" + (f"; include: {', '.join(missing[:4])}." if missing else "; address this point explicitly.")
        results.append(CriterionResult(name=c.name, score=score, max_score=round(max_c, 2), coverage=coverage,
                                       matched_keywords=matched, missing_keywords=missing, feedback=fb))

    note = ""
    if req.min_words and words < req.min_words:
        penalty = round(total * min(0.1, 0.1 * (req.min_words - words) / req.min_words), 2)
        total -= penalty
        note = f" Length {words} words is below the expected {req.min_words}; {penalty} marks deducted."

    total = round(max(0.0, total), 2)
    pct = round(100 * total / req.max_score, 1)
    strengths = [r.name for r in results if r.coverage >= 0.75]
    missing_concepts = [f"{r.name}: {k}" for r in results if r.coverage < 0.75 for k in r.missing_keywords] \
        or [r.name for r in results if r.coverage < 0.4]

    overall = _overall_feedback(req, results, total, pct, strengths, missing_concepts) + note
    return EvaluationResponse(student_id=req.student_id, total_score=total, max_score=req.max_score, percentage=pct,
                              grade=_grade(pct), word_count=words, criteria_results=results,
                              missing_concepts=missing_concepts[:15], strengths=strengths, overall_feedback=overall.strip())


def _overall_feedback(req, results, total, pct, strengths, missing) -> str:
    llm = get_llm()
    if llm is not None:
        try:
            summary = "\n".join(f"- {r.name}: {r.score}/{r.max_score}, missing {r.missing_keywords}" for r in results)
            msg = (f"You are a supportive examiner. Question: {req.question or 'N/A'}\n"
                   f"Score {total}/{req.max_score}.\nRubric outcome:\n{summary}\n"
                   "Write 3 short sentences of constructive feedback for the student. Do not change the score.")
            return llm.invoke(msg).content.strip()
        except Exception:
            logger.exception("LLM feedback failed; using templated feedback")
    good = f"Strong on {', '.join(strengths)}. " if strengths else ""
    gaps = f"Improve by covering: {', '.join(missing[:5])}." if missing else "Excellent coverage of the rubric."
    return f"You scored {total}/{req.max_score} ({pct}%). {good}{gaps}"
