"""Knowledge-base loading, section-aware chunking and an offline TF-IDF retriever.

Pure Python + scikit-learn (no LangChain / network), so retrieval always works even when
no embedding model or API key is available. FAISS (dense) is layered on top in rag_service.
"""
import hashlib
import re
from dataclasses import dataclass
from pathlib import Path

from sklearn.feature_extraction.text import ENGLISH_STOP_WORDS, TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

CATEGORY_RULES = [
    ("hostel", "hostel"), ("roommate", "hostel"),
    ("examination", "exams"), ("exam", "exams"), ("seating", "exams"),
    ("administrative", "workflow"), ("workflow", "workflow"), ("approval", "workflow"),
    ("career", "career"), ("placement", "career"), ("resume", "career"),
    ("academic", "regulations"), ("attendance", "regulations"), ("grading", "regulations"),
]
_SUFFIXES = ("ations", "ation", "ings", "ing", "edly", "ed", "ies", "es", "s", "ly")
_TOKEN = re.compile(r"[a-z0-9]+(?:\.[0-9]+)?")


@dataclass
class Chunk:
    text: str
    source: str
    category: str
    section: str


def _stem(w: str) -> str:
    for suf in _SUFFIXES:
        if w.endswith(suf) and len(w) - len(suf) >= 3:
            return w[: -len(suf)]
    return w


_CANON = ("exam", "attend", "place", "regist", "approv", "hostel", "roommat", "condon", "certif")


def _canon(w: str) -> str:
    for c in _CANON:
        if w.startswith(c):
            return c
    return w


def tokenize(text: str) -> list[str]:
    text = re.sub(r"\b([abo])\+", r"\1plus", text.lower())  # keep grades like A+ / B+ distinct
    return [_canon(_stem(t)) for t in _TOKEN.findall(text) if t not in ENGLISH_STOP_WORDS]


def categorize(title: str, fallback: str) -> str:
    low = title.lower()
    for kw, cat in CATEGORY_RULES:
        if kw in low:
            return cat
    return fallback


def _clean(text: str) -> str:
    text = re.sub(r"\*\*|`|\$", "", text).replace("\\%", "%")
    text = text.replace("\\ge", ">=").replace("\\le", "<=").replace("\\text", "")
    return re.sub(r"\*(?=\S)([^*\n]+)\*", r"\1", text)


def _pieces(body: str, max_chars: int) -> list[tuple[str, str]]:
    """Split a section body into (sub_heading, text) pieces of <= max_chars."""
    out: list[tuple[str, str]] = []
    for block in re.split(r"\n(?=###\s)", body.strip()):
        block = block.strip()
        if not block:
            continue
        sub = ""
        if block.startswith("###"):
            first, _, block = block.partition("\n")
            sub = re.sub(r"^\d+(\.\d+)*\.?\s*", "", first.lstrip("# ").strip())
        cur = ""
        for para in re.split(r"\n\s*\n", block):
            para = para.rstrip()
            if not para.strip():
                continue
            if cur and len(cur) + len(para) > max_chars:
                out.append((sub, cur.strip()))
                cur = ""
            cur += para + "\n"
        if cur.strip():
            out.append((sub, cur.strip()))
    return out


def load_chunks(directory: Path, max_chars: int = 450) -> list[Chunk]:
    chunks: list[Chunk] = []
    for p in sorted(list(directory.glob("*.md")) + list(directory.glob("*.txt"))):
        raw = _clean(p.read_text(encoding="utf-8"))
        parts = re.split(r"(?m)^##\s+(?!#)", raw)
        sections = parts[1:] or [f"{p.stem}\n{raw}"]
        for sec in sections:
            title, _, body = sec.partition("\n")
            title = re.sub(r"^\d+(\.\d+)*\.?\s*", "", title.strip())
            cat = categorize(title, p.stem.lower())
            for sub, piece in _pieces(body, max_chars):
                label = f"{title} \u203a {sub}" if sub else title
                chunks.append(Chunk(text=f"{label}\n{piece}", source=p.name, category=cat, section=label))
    return chunks


def kb_fingerprint(directory: Path) -> str:
    h = hashlib.sha256()
    for p in sorted(directory.glob("*")):
        if p.is_file():
            h.update(p.name.encode())
            h.update(p.read_bytes())
    return h.hexdigest()


class TfidfRetriever:
    def __init__(self, chunks: list[Chunk]) -> None:
        self.chunks = chunks
        self.vec = TfidfVectorizer(tokenizer=tokenize, token_pattern=None, lowercase=False,
                                   ngram_range=(1, 1), sublinear_tf=True)
        self.matrix = self.vec.fit_transform([c.text for c in chunks])
        self._tokens = [set(tokenize(c.text)) for c in chunks]
        self._idf = dict(zip(self.vec.get_feature_names_out(), self.vec.idf_))

    def search(self, query: str, k: int = 4, category: str | None = None) -> list[tuple[Chunk, float]]:
        sims = cosine_similarity(self.vec.transform([query]), self.matrix)[0]
        # blend cosine with idf-weighted query coverage so rare query terms (e.g. "smartwatch") count
        q = [t for t in set(tokenize(query)) if t in self._idf]
        total = sum(self._idf[t] for t in q) or 1.0
        cov = [sum(self._idf[t] for t in q if t in toks) / total for toks in self._tokens]
        sims = [0.4 * float(sims[i]) + 0.5 * cov[i] for i in range(len(self.chunks))]
        order = sorted(range(len(self.chunks)), key=lambda i: sims[i], reverse=True)
        return [(self.chunks[i], float(sims[i])) for i in order
                if category is None or self.chunks[i].category == category][:k]

    def best_lines(self, query: str, chunk: Chunk, n: int = 4) -> list[str]:
        """Pick the lines of a chunk most relevant to the query (keeps original order)."""
        lines = [re.sub(r"^[\s*\-•]+", "", l).strip() for l in chunk.text.splitlines()[1:]]
        lines = [l for l in lines if len(l) > 20 and not l.startswith("#") and set(l) - set("|-: ")]
        if not lines:
            return [chunk.text]
        q = set(tokenize(query))
        scored = sorted(range(len(lines)), key=lambda i: len(q & set(tokenize(lines[i]))), reverse=True)
        keep = sorted(i for i in scored[:n] if q & set(tokenize(lines[i]))) or [0]
        return [lines[i] for i in keep]
