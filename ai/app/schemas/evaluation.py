from pydantic import BaseModel, Field


class RubricCriterion(BaseModel):
    name: str = Field(..., min_length=2, max_length=100)
    description: str = Field(..., min_length=5, max_length=500, description="What a full-marks answer says")
    keywords: list[str] = Field(default_factory=list, max_length=25)
    weight: float = Field(1.0, gt=0, le=100)


class EvaluationRequest(BaseModel):
    student_id: str | None = None
    question: str | None = None
    submission_text: str = Field(..., min_length=10, max_length=20000)
    rubric: list[RubricCriterion] = Field(..., min_length=1, max_length=20)
    max_score: float = Field(10, gt=0, le=1000)
    min_words: int = Field(0, ge=0, le=5000)


class CriterionResult(BaseModel):
    name: str
    score: float
    max_score: float
    coverage: float
    matched_keywords: list[str]
    missing_keywords: list[str]
    feedback: str


class EvaluationResponse(BaseModel):
    student_id: str | None
    total_score: float
    max_score: float
    percentage: float
    grade: str
    word_count: int
    criteria_results: list[CriterionResult]
    missing_concepts: list[str]
    strengths: list[str]
    overall_feedback: str
