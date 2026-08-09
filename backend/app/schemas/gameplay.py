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
