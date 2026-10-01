import asyncio
import json
import re

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse

from app.core.security import require_api_key
from app.schemas.career import CareerRequest, CareerResponse
from app.schemas.chat import ChatRequest, ChatResponse, ChatTurn, GuidanceRequest, GuidanceResponse, SessionHistory
from app.schemas.evaluation import EvaluationRequest, EvaluationResponse
from app.schemas.risk import RiskRequest, RiskResponse
from app.schemas.study_plan import StudyPlanRequest, StudyPlanResponse
from app.services import career_service, evaluator_service, study_plan_service
from app.services import guidance as guidance_service
from app.services.chat_service import _catalogs, _profile, chat_service, to_coaching
from app.services.rag_service import rag_service
from app.services.risk_service import risk_service

router = APIRouter(prefix="/ai", tags=["AI Engine"], dependencies=[Depends(require_api_key)])


@router.post("/predict-risk", response_model=RiskResponse)
def predict_risk(req: RiskRequest):
    return risk_service.predict(req)


@router.post("/recommend-study-plan", response_model=StudyPlanResponse)
def recommend_study_plan(req: StudyPlanRequest):
    return study_plan_service.build_plan(req)


@router.post("/career-advisor", response_model=CareerResponse)
def career_advisor(req: CareerRequest):
    return career_service.get_advice(req)


@router.post("/chat", response_model=ChatResponse)
async def chat(req: ChatRequest):
    return await chat_service.chat(req)


def _sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


@router.post("/chat/stream", summary="Server-sent events: meta -> token* -> done. The answer is verified before streaming.")
async def chat_stream(req: ChatRequest):
    resp = await chat_service.chat(req)

    async def gen():
        yield _sse("meta", {"session_id": resp.session_id, "mode": resp.mode, "sources": [s.model_dump() for s in resp.sources]})
        parts = re.findall(r"\S+\s*", resp.answer)
        for i in range(0, len(parts), 4):
            yield _sse("token", {"text": "".join(parts[i:i + 4])})
            await asyncio.sleep(0.02)
        yield _sse("done", resp.model_dump())

    return StreamingResponse(gen(), media_type="text/event-stream", headers={"Cache-Control": "no-cache"})


@router.get("/chat/sessions/{session_id}", response_model=SessionHistory)
def get_session(session_id: str):
    if not chat_service.sessions.exists(session_id):
        raise HTTPException(404, "Session not found or expired")
    return SessionHistory(session_id=session_id, turns=[ChatTurn(**t) for t in chat_service.sessions.get(session_id)])


@router.delete("/chat/sessions/{session_id}", status_code=204)
def delete_session(session_id: str):
    chat_service.sessions.delete(session_id)


@router.post("/chat/reindex", summary="Rebuild the FAISS index after updating knowledge files")
async def reindex():
    import asyncio
    try:
        n = await asyncio.to_thread(rag_service.build_index)
    except RuntimeError as e:
        raise HTTPException(422, str(e))
    return {"status": "ok", "chunks_indexed": n}


@router.post("/evaluate-assignment", response_model=EvaluationResponse)
def evaluate_assignment(req: EvaluationRequest):
    return evaluator_service.evaluate(req)


@router.post("/guidance", response_model=GuidanceResponse, summary="Motivation, event nudges and web resources for a student's home screen")
def guidance(req: GuidanceRequest):
    prof = _profile(req.student_profile)
    coach = guidance_service.build_coaching(req.focus or "", None, prof, req.student_id or "anon", _catalogs())
    if not coach.events:
        coach.events = guidance_service.pick_events(req.focus or "", None, prof, _catalogs(), k=2)
    return GuidanceResponse(student_id=req.student_id, coaching=to_coaching(coach))
