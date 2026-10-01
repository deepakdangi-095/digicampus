"""Conversation orchestrator: sessions -> intent -> follow-up rewrite -> retrieval -> draft
-> self-argument (critic + verification) -> persist."""
import asyncio
import logging
import re
import uuid

from app.core.config import settings
from app.core.llm import get_llm
from app.schemas.chat import (ChatRequest, ChatResponse, ChatTurn, ClaimCheckOut, Coaching, EventTip, ResourceLink,
                              SelfCheck, SourceRef)
from app.services.chat_sessions import SessionStore
from app.services import guidance, wellbeing
from app.services.policy_rules import extract_facts
from app.services.rag_service import OUT_OF_SCOPE, rag_service
from app.services.self_check import argue_and_revise, verify
from app.services.smalltalk import RESPONSES, detect_intent, suggestions_for

logger = logging.getLogger(__name__)

_PRONOUNS = re.compile(r"\b(it|its|that|this|they|them|those|these|there|then|also|what about|how about)\b", re.I)
_REWRITE = ("Rewrite the FINAL user message as a standalone question about university policy, resolving pronouns "
            "and references using the conversation. Return only the question.\n\nConversation:\n<<H>>\n\nFinal message: <<Q>>")


def _catalogs():
    return guidance.load_catalogs(str(settings.data_dir))


def _profile(p) -> guidance.Profile:
    return guidance.Profile(**p.model_dump()) if p else guidance.Profile()


def to_coaching(c: guidance.CoachingResult) -> Coaching:
    return Coaching(motivation=c.motivation, next_steps=c.next_steps,
                    events=[EventTip(**vars(e)) for e in c.events], resources=[ResourceLink(**vars(r)) for r in c.resources])


class ChatService:
    def __init__(self) -> None:
        self.sessions = SessionStore(settings.session_ttl_seconds, settings.max_history_turns)

    # ---- helpers ------------------------------------------------------------
    @staticmethod
    def _needs_context(q: str) -> bool:
        return len(q.split()) < 6 or bool(_PRONOUNS.search(q))

    async def _rewrite(self, query: str, history: list[ChatTurn]) -> str:
        if not history or not self._needs_context(query):
            return query
        llm = get_llm()
        if llm is not None:
            h = "\n".join(f"{t.role}: {t.content}" for t in history[-6:])
            try:
                out = await asyncio.to_thread(lambda: llm.invoke(_REWRITE.replace("<<H>>", h).replace("<<Q>>", query)).content)
                if out.strip():
                    return out.strip().strip('"')
            except Exception:
                logger.exception("Query rewrite failed; using heuristic")
        prev = next((t.content for t in reversed(history) if t.role == "user"), "")
        return f"{prev} {query}".strip()

    def _finish(self, sid: str, req: ChatRequest, resp: ChatResponse) -> ChatResponse:
        self.sessions.append(sid, "user", req.query)
        self.sessions.append(sid, "assistant", resp.answer)
        return resp

    # ---- main entry ---------------------------------------------------------
    async def chat(self, req: ChatRequest) -> ChatResponse:
        sid = req.session_id or uuid.uuid4().hex
        history = req.history or [ChatTurn(**t) for t in self.sessions.get(sid)]

        if wellbeing.is_crisis(req.query):  # safety first: care + real support options, no coaching upsell
            return self._finish(sid, req, ChatResponse(
                session_id=sid, answer=wellbeing.CRISIS_RESPONSE, intent="guidance", sources=[], confidence=1.0,
                grounded=False, mode="guidance",
                coaching=Coaching(motivation="You matter, and support is available right now.", next_steps=[],
                                  events=[], resources=[ResourceLink(**wellbeing.TELEMANAS)])))

        intent = detect_intent(req.query)
        if intent:
            return self._finish(sid, req, ChatResponse(
                session_id=sid, answer=RESPONSES[intent], intent="smalltalk", sources=[], confidence=1.0,
                grounded=False, mode="smalltalk", suggested_questions=suggestions_for(None)))

        g = guidance.guidance_intent(req.query)
        if g:
            fn = {"events": guidance.events_reply, "resources": guidance.resources_reply,
                  "motivation": guidance.motivation_reply}[g]
            text, coach = fn(req.query, _profile(req.student_profile), sid, _catalogs())
            return self._finish(sid, req, ChatResponse(
                session_id=sid, answer=text, intent="guidance", sources=[], confidence=1.0, grounded=False,
                mode="guidance", coaching=to_coaching(coach) if req.coaching else None,
                suggested_questions=suggestions_for(None)))

        standalone = await self._rewrite(req.query, history)
        hits = await rag_service.retrieve(standalone, req.category)
        facts = extract_facts(req.query)
        if not hits and not facts:
            return self._finish(sid, req, ChatResponse(
                session_id=sid, answer=OUT_OF_SCOPE, rewritten_query=standalone, sources=[], confidence=0.0,
                grounded=False, mode="out_of_scope", suggested_questions=suggestions_for(None)))

        draft, mode = await rag_service.draft(standalone, history, hits, facts)
        answer, check, mode = await self._self_argue(req, standalone, draft, mode, hits, facts)

        base_conf = min(1.0, hits[0][1]) if hits else 1.0
        confidence = round(base_conf * (0.5 + 0.5 * check.supported_ratio), 3) if check else round(base_conf, 3)
        sources = [SourceRef(source=f"{c.source} \u203a {c.section}", category=c.category,
                             snippet=c.text.split("\n", 1)[-1][:220].replace("\n", " "), score=round(s, 3))
                   for c, s in hits]
        top_cat = hits[0][0].category if hits else None
        coach = (to_coaching(guidance.build_coaching(req.query, top_cat, _profile(req.student_profile), sid, _catalogs()))
                 if req.coaching else None)
        return self._finish(sid, req, ChatResponse(
            session_id=sid, answer=answer, rewritten_query=standalone if standalone != req.query else None,
            sources=sources, confidence=confidence, grounded=True, mode=mode, self_check=check, coaching=coach,
            suggested_questions=suggestions_for(top_cat)))

    async def _self_argue(self, req, question, draft, mode, hits, facts):
        if not req.self_check:
            return draft, None, mode
        evidence = [c.text for c, _ in hits] + facts
        arguments: list[str] = []
        rounds, revised = 0, False

        llm = get_llm()
        if llm is not None and mode == "llm" and settings.self_check_rounds > 0:
            draft, arguments, rounds, revised = await asyncio.to_thread(
                argue_and_revise, llm, question, rag_service.context_for(hits, facts), draft, settings.self_check_rounds)

        result = verify(draft, evidence, req.query)
        if result.verdict == "UNSUPPORTED" and mode == "llm":
            arguments.append("LLM answer rejected: fewer than half of its claims are supported by the knowledge base; "
                             "returned the source text instead.")
            draft, mode, revised = rag_service.extractive(question, hits, facts), "extractive", True
            result = verify(draft, evidence, req.query)

        arguments += [f"Not supported by the knowledge base: {c.claim}" for c in result.claims if not c.supported][:5]
        check = SelfCheck(verdict=result.verdict, supported_ratio=result.supported_ratio, arguments_against=arguments,
                          rounds=rounds, revised=revised,
                          claims=[ClaimCheckOut(**vars(c)) for c in result.claims])
        return draft, check, mode


chat_service = ChatService()
