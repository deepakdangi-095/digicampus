from typing import Literal

from pydantic import BaseModel, Field


class CareerRequest(BaseModel):
    student_id: str | None = None
    branch: str = Field(..., min_length=2, max_length=80, examples=["Computer Science"])
    current_semester: int = Field(..., ge=1, le=8)
    strong_skills: list[str] = Field(default_factory=list, max_length=40)
    weak_skills: list[str] = Field(default_factory=list, max_length=40)
    target_job_role: str = Field(..., min_length=2, max_length=80, examples=["Data Scientist"])
    projects_count: int = Field(0, ge=0, le=50)
    internships_count: int = Field(0, ge=0, le=10)
    cgpa: float | None = Field(None, ge=0, le=10)
    active_backlogs: int = Field(0, ge=0, le=50)
    ats_score: float | None = Field(None, ge=0, le=100, description="Latest Digi Campus AI Resume ATS score")
    current_offer_ctc: float | None = Field(None, ge=0, description="CTC of an existing campus offer, if any")


class SkillGap(BaseModel):
    skill: str
    priority: Literal["HIGH", "MEDIUM", "LOW"]
    reason: str
    suggested_action: str


class EventSuggestion(BaseModel):
    name: str
    type: str
    why_relevant: str
    match_score: float
    how_to_join: str | None = None
    url: str | None = None


class CareerResponse(BaseModel):
    student_id: str | None
    matched_role: str
    role_readiness_pct: float
    stage: str
    skill_gaps: list[SkillGap]
    resume_recommendations: list[str]
    events: list[EventSuggestion]
    placement_eligibility: list[str]
    daily_nudge: str
