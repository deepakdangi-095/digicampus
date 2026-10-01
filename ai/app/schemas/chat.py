from typing import Literal

from pydantic import BaseModel, Field


class StudentProfile(BaseModel):
    branch: str | None = Field(None, max_length=80)
    semester: int | None = Field(None, ge=1, le=8)
    interests: list[str] = Field(default_factory=list, max_length=15, description="e.g. python, robotics, music")
    target_role: str | None = Field(None, max_length=80)


class ResourceLink(BaseModel):
    title: str
    url: str
    why: str


class EventTip(BaseModel):
    name: str
    type: str
    why_relevant: str
    how_to_join: str
    url: str | None = None


class Coaching(BaseModel):
    motivation: str
    next_steps: list[str]
    events: list[EventTip]
    resources: list[ResourceLink]


class ChatTurn(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(..., max_length=4000)


class ChatRequest(BaseModel):
    query: str = Field(..., min_length=1, max_length=1000)
    session_id: str | None = Field(None, max_length=64, description="Omit to start a new conversation; reuse the returned id to continue it")
    history: list[ChatTurn] = Field(default_factory=list, max_length=10, description="Optional client-side history; overrides server memory")
    category: Literal["regulations", "exams", "hostel", "career", "workflow"] | None = None
    self_check: bool = Field(True, description="Argue against and verify the answer before returning it")
    coaching: bool = Field(True, description="Attach motivation, next steps, event suggestions and web resources")
    student_profile: StudentProfile | None = Field(None, description="Optional; personalises events and resources")


class SourceRef(BaseModel):
    source: str
    category: str
    snippet: str
    score: float


class ClaimCheckOut(BaseModel):
    claim: str
    supported: bool
    evidence: str | None = None
    coverage: float


class SelfCheck(BaseModel):
    verdict: Literal["SUPPORTED", "PARTIAL", "UNSUPPORTED"]
    supported_ratio: float
    arguments_against: list[str]
    rounds: int
    revised: bool
    claims: list[ClaimCheckOut]


class ChatResponse(BaseModel):
    session_id: str
    answer: str
    intent: Literal["question", "smalltalk", "guidance"] = "question"
    rewritten_query: str | None = None
    sources: list[SourceRef]
    confidence: float
    grounded: bool
    mode: Literal["llm", "extractive", "out_of_scope", "smalltalk", "guidance"]
    self_check: SelfCheck | None = None
    coaching: Coaching | None = None
    suggested_questions: list[str] = Field(default_factory=list)


class SessionHistory(BaseModel):
    session_id: str
    turns: list[ChatTurn]


class GuidanceRequest(BaseModel):
    student_id: str | None = None
    student_profile: StudentProfile = Field(default_factory=StudentProfile)
    focus: str | None = Field(None, max_length=200, description="Optional topic, e.g. 'machine learning internships'")


class GuidanceResponse(BaseModel):
    student_id: str | None
    coaching: Coaching
