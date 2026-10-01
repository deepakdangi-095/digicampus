import asyncio
import logging
import threading

from langchain_core.documents import Document
from langchain_core.output_parsers import StrOutputParser
from langchain_core.prompts import ChatPromptTemplate

from app.core.config import settings
from app.core.llm import get_embeddings, get_llm
from app.schemas.chat import ChatTurn
from app.services.kb_loader import Chunk, TfidfRetriever, kb_fingerprint, load_chunks

logger = logging.getLogger(__name__)

PROMPT = ChatPromptTemplate.from_messages([
    ("system",
     "You are Digi Campus Assistant for a university. Answer ONLY from the CONTEXT below. "
     "If the context does not contain the answer, say you don't have that information and suggest "
     "contacting the relevant office. Quote exact numbers, thresholds, timelines and grades from the context. "
     "Include conditions and exceptions that apply. Use a friendly, supportive tone but add no advice or claims beyond the "
     "context; encouragement and next steps are added separately by the system. Be concise (short bullets for multi-part answers). "
     "Never invent policies.\n\nCONTEXT:\n{context}"),
    ("human", "Conversation so far:\n{history}\n\nQuestion: {question}"),
])

OUT_OF_SCOPE = ("I couldn't find this in the university knowledge base. Please contact the relevant "
                "department office or the helpdesk for an authoritative answer.")


class RAGService:
    """Hybrid retrieval: FAISS dense search when an embedding model is reachable, otherwise (or when dense
    finds nothing) an offline TF-IDF retriever over the same chunks. Also drafts answers (LLM or extractive)."""

    def __init__(self) -> None:
        self._lock = threading.RLock()
        self._chunks: list[Chunk] | None = None
        self._tfidf: TfidfRetriever | None = None
        self._dense = None
        self._dense_tried = False

    # ---- index management -------------------------------------------------
    def _ensure_sparse(self) -> None:
        with self._lock:
            if self._chunks is None:
                chunks = load_chunks(settings.knowledge_dir)
                if not chunks:
                    raise RuntimeError(f"No knowledge files found in {settings.knowledge_dir}")
                self._chunks, self._tfidf = chunks, TfidfRetriever(chunks)

    def _ensure_dense(self) -> None:
        with self._lock:
            if self._dense_tried:
                return
            self._dense_tried = True
            try:
                from langchain_community.vectorstores import FAISS

                fp_file = settings.faiss_dir / "kb.sha256"
                fp = kb_fingerprint(settings.knowledge_dir)
                if (settings.faiss_dir / "index.faiss").exists() and fp_file.exists() and fp_file.read_text() == fp:
                    # Safe: index is produced by this service, never user-supplied.
                    self._dense = FAISS.load_local(str(settings.faiss_dir), get_embeddings(),
                                                   allow_dangerous_deserialization=True)
                else:
                    docs = [Document(page_content=c.text, metadata={"source": c.source, "category": c.category,
                                                                    "section": c.section}) for c in self._chunks]
                    self._dense = FAISS.from_documents(docs, get_embeddings())
                    settings.faiss_dir.mkdir(parents=True, exist_ok=True)
                    self._dense.save_local(str(settings.faiss_dir))
                    fp_file.write_text(fp)
                logger.info("Dense FAISS retrieval enabled")
            except Exception:
                logger.warning("Dense retrieval unavailable; using offline TF-IDF retriever", exc_info=True)
                self._dense = None

    def build_index(self) -> int:
        with self._lock:
            self._chunks = self._tfidf = self._dense = None
            self._dense_tried = False
            (settings.faiss_dir / "kb.sha256").unlink(missing_ok=True)
        self._ensure_sparse()
        self._ensure_dense()
        return len(self._chunks or [])

    # ---- retrieval ----------------------------------------------------------
    def _retrieve(self, query: str, category: str | None) -> list[tuple[Chunk, float]]:
        self._ensure_sparse()
        self._ensure_dense()
        k = settings.rag_top_k
        if self._dense is not None:
            kwargs = {"filter": {"category": category}, "fetch_k": 50} if category else {}
            hits = []
            for doc, dist in self._dense.similarity_search_with_score(query, k=k, **kwargs):
                score = max(0.0, 1 - (dist ** 2) / 2)  # L2-normalised embeddings => cosine
                if score >= settings.rag_min_score:
                    hits.append((Chunk(doc.page_content, doc.metadata["source"], doc.metadata["category"],
                                       doc.metadata.get("section", "")), score))
            if hits:
                return hits
        return [(c, s) for c, s in self._tfidf.search(query, k, category) if s >= settings.tfidf_min_score]

    async def retrieve(self, query: str, category: str | None = None) -> list[tuple[Chunk, float]]:
        return await asyncio.to_thread(self._retrieve, query, category)

    # ---- drafting -------------------------------------------------------------
    @staticmethod
    def context_for(hits: list[tuple[Chunk, float]], facts: list[str]) -> str:
        facts_block = ("VERIFIED FACTS ABOUT THIS STUDENT'S SITUATION (computed from policy):\n"
                       + "\n".join(f"- {f}" for f in facts) + "\n\n") if facts else ""
        return facts_block + "\n\n---\n\n".join(f"[{c.source} \u203a {c.section}]\n{c.text}" for c, _ in hits)

    def extractive(self, query: str, hits: list[tuple[Chunk, float]], facts: list[str]) -> str:
        fact_txt = "\n".join(f"- {f}" for f in facts)
        if not hits:
            return fact_txt
        top = hits[0][0]
        body = "\n".join(f"- {l}" for l in self._tfidf.best_lines(query, top))
        out = f"According to **{top.section}** ({top.source}):\n{body}"
        return f"**Your situation:**\n{fact_txt}\n\n{out}" if facts else out

    async def draft(self, question: str, history: list[ChatTurn], hits, facts: list[str]) -> tuple[str, str]:
        llm = get_llm()
        if llm is not None:
            hist = "\n".join(f"{t.role}: {t.content}" for t in history[-6:]) or "(none)"
            try:
                text = await (PROMPT | llm | StrOutputParser()).ainvoke(
                    {"context": self.context_for(hits, facts), "history": hist, "question": question})
                return text.strip(), "llm"
            except Exception:
                logger.exception("LLM call failed; falling back to extractive answer")
        return self.extractive(question, hits, facts), "extractive"


rag_service = RAGService()
