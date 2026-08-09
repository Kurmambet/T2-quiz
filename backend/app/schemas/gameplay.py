import uuid
from datetime import datetime

from pydantic import BaseModel

from app.schemas.game_session import GamePhase


class ParticipantQuestionOptionRead(BaseModel):
    id: uuid.UUID
    position: int
    content: str


class ParticipantQuestionRead(BaseModel):
    id: uuid.UUID
    position: int
    content: str
    time_limit_seconds: int
    points: int
    options: list[ParticipantQuestionOptionRead]


class CurrentParticipantQuestionRead(BaseModel):
    phase: GamePhase
    question_deadline_at: datetime | None
    question: ParticipantQuestionRead


class ParticipantAnswerSubmit(BaseModel):
    selected_option_id: uuid.UUID


class ParticipantAnswerSubmitted(BaseModel):
    id: uuid.UUID
    quiz_question_id: uuid.UUID
    selected_option_id: uuid.UUID
    submitted_at: datetime


class CurrentQuestionRevealRead(BaseModel):
    question_id: uuid.UUID
    correct_option_id: uuid.UUID | None
    correct_option_content: str | None
    selected_option_id: uuid.UUID | None
    is_correct: bool | None
    points_awarded: int | None
