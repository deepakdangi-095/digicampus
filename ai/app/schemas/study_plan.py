from datetime import date

from pydantic import BaseModel, Field


class WeakTopic(BaseModel):
    subject: str = Field(..., min_length=2, max_length=80)
    topic: str = Field(..., min_length=2, max_length=120)
    proficiency: int = Field(40, ge=0, le=100, description="Current self/AI-assessed mastery (0-100)")


class StudyPlanRequest(BaseModel):
    student_id: str | None = None
    weak_topics: list[WeakTopic] = Field(..., min_length=1, max_length=20)
    hours_per_day: float = Field(4, ge=1, le=12)
    start_date: date | None = None
    pyqs_per_topic: int = Field(3, ge=1, le=5)


class StudySession(BaseModel):
    subject: str
    topic: str
    activity: str
    minutes: int


class DayPlan(BaseModel):
    day: int
    date: date
    focus: str
    sessions: list[StudySession]
    total_minutes: int


class PYQItem(BaseModel):
    id: str
    subject: str
    topic: str
    question: str
    year: int
    marks: int
    difficulty: str
    relevance: float


class StudyPlanResponse(BaseModel):
    student_id: str | None
    summary: str
    timetable: list[DayPlan]
    pyqs: list[PYQItem]
