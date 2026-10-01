from typing import Literal

from pydantic import BaseModel, Field

RiskLevel = Literal["LOW", "MEDIUM", "HIGH"]


class RiskRequest(BaseModel):
    student_id: str | None = None
    attendance_pct: float = Field(..., ge=0, le=100, description="Overall attendance %")
    midterm_pct: float = Field(..., ge=0, le=100, description="Average mid-term marks %")
    assignment_submission_rate: float = Field(..., ge=0, le=100, description="% of assignments submitted on time")
    fee_delay_days: int = Field(0, ge=0, le=365, description="Days the fee payment is overdue (0 = paid)")


class RiskFactor(BaseModel):
    feature: str
    value: float
    impact_pct: float = Field(..., description="Share of the risk attributable to this factor")


class RiskResponse(BaseModel):
    student_id: str | None
    risk_level: RiskLevel
    risk_percentage: float = Field(..., ge=0, le=100)
    probabilities: dict[str, float]
    top_factors: list[RiskFactor]
    warnings: list[str]
    recommended_actions: list[str]
    model_version: str
