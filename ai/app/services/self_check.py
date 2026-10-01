"""Self-argument: the assistant argues against its own draft answer, then verifies the result.

Two layers:
  1. argue_and_revise(): an LLM "skeptical auditor" attacks the draft (unsupported claims, wrong numbers,
     omitted conditions) and rewrites it, for a configurable number of rounds. Skipped without an LLM.
  2. verify(): a deterministic, model-free check that every sentence/number in the final answer is
     actually supported by the retrieved knowledge-base text (or the student's own message).
Pure Python + scikit-learn tokenisation; no pydantic/LangChain imports so it is easy to unit test.
"""
import json
import re
from dataclasses import dataclass, field

from app.services.kb_loader import tokenize

_NUM = re.compile(r"\d+(?:\.\d+)?")
_MD = re.compile(r"[*_`#>|]")
_SKIP_PREFIX = ("according to", "your situation")


@dataclass
class ClaimCheck:
    claim: str
    supported: bool
    evidence: str | None
    coverage: float


@dataclass
class SelfCheckResult:
    verdict: str  # SUPPORTED | PARTIAL | UNSUPPORTED
    supported_ratio: float
    arguments_against: list[str] = field(default_factory=list)
    rounds: int = 0
    revised: bool = False
    claims: list[ClaimCheck] = field(default_factory=list)


def _nums(text: str) -> set[str]:
    return {f"{float(x):g}" for x in _NUM.findall(text)}


def split_claims(answer: str) -> list[str]:
    claims: list[str] = []
    for line in answer.splitlines():
        line = _MD.sub("", line).strip(" -\u2022\t")
        if not line or line.lower().startswith(_SKIP_PREFIX):
            continue
        for sent in re.split(r"(?<=[.!?])\s+", line):
            if len(tokenize(sent)) >= 3:
                claims.append(sent.strip())
    return claims


def verify(answer: str, evidence: list[str], question: str = "") -> SelfCheckResult:
    ev_tokens = [set(tokenize(e)) for e in evidence]
    union = set().union(*ev_tokens) if ev_tokens else set()
    ev_nums = _nums(" ".join(evidence)) | _nums(question)  # numbers the student typed may be echoed

    checks: list[ClaimCheck] = []
    for claim in split_claims(answer):
        toks = set(tokenize(claim))
        cov = len(toks & union) / len(toks) if toks else 1.0
        bad_nums = _nums(claim) - ev_nums
        ok = cov >= 0.5 and not bad_nums
        label = None
        if ok and evidence:
            best = max(range(len(evidence)), key=lambda i: len(toks & ev_tokens[i]))
            label = evidence[best].split("\n", 1)[0][:90]
        checks.append(ClaimCheck(claim=claim, supported=ok, evidence=label, coverage=round(cov, 2)))

    ratio = sum(c.supported for c in checks) / len(checks) if checks else 1.0
    verdict = "SUPPORTED" if ratio >= 0.8 else "PARTIAL" if ratio >= 0.5 else "UNSUPPORTED"
    return SelfCheckResult(verdict=verdict, supported_ratio=round(ratio, 2), claims=checks)


_CRITIC = """You are a skeptical university-policy auditor. Use ONLY the CONTEXT as truth.
Argue AGAINST the DRAFT ANSWER: find (a) claims or numbers not supported by the context,
(b) conditions, exceptions or deadlines in the context that the draft omitted, (c) anything that could
mislead the student. Then write a corrected FINAL answer using only the context (concise; bullets if multi-part).
Reply with JSON only, no markdown fences:
{"arguments_against": ["..."], "final_answer": "...", "changed": true or false}

CONTEXT:
<<CONTEXT>>

STUDENT QUESTION: <<QUESTION>>

DRAFT ANSWER:
<<DRAFT>>"""


def _parse_json(text: str) -> dict | None:
    m = re.search(r"\{.*\}", text, re.S)
    if not m:
        return None
    try:
        data = json.loads(m.group(0))
        return data if isinstance(data, dict) else None
    except json.JSONDecodeError:
        return None


def argue_and_revise(llm, question: str, context: str, draft: str, rounds: int = 1) -> tuple[str, list[str], int, bool]:
    """Returns (final_answer, arguments_against, rounds_completed, changed). Never raises."""
    arguments: list[str] = []
    changed_any, done = False, 0
    for _ in range(max(0, rounds)):
        prompt = _CRITIC.replace("<<CONTEXT>>", context).replace("<<QUESTION>>", question).replace("<<DRAFT>>", draft)
        try:
            data = _parse_json(llm.invoke(prompt).content)
        except Exception:
            break
        if not data or not str(data.get("final_answer", "")).strip():
            break
        done += 1
        arguments += [str(a) for a in data.get("arguments_against", []) if str(a).strip()][:5]
        final = str(data["final_answer"]).strip()
        if not data.get("changed") or final == draft:
            break
        draft, changed_any = final, True
    return draft, arguments, done, changed_any
