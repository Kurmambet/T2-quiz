import uuid
from datetime import datetime
from enum import StrEnum

from pydantic import BaseModel, ConfigDict, Field


class GamePhase(StrEnum):
    SETUP = "setup"
    LOBBY = "lobby"
    PRESENTATION = "presentation"
    QUESTION = "question"
    ANSWERS_CLOSED = "answers_closed"
    ANSWER_REVEAL = "answer_reveal"
    SCOREBOARD = "scoreboard"
    FINISHED = "finished"


class GameSessionConfigure(BaseModel):
    quiz_template_id: uuid.UUID
    settings: dict[str, object] = Field(
        default_factory=dict,
        examples=[
            {
                "show_correct_answer": True,
                "allow_late_join": True,
                "default_time_limit_seconds": 30,
            }
        ],
    )


class GameSessionTransition(BaseModel):
    target_phase: GamePhase


class GameSessionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    room_id: uuid.UUID
    game_type: str
    quiz_template_id: uuid.UUID | None
    settings: dict[str, object]
    state: dict[str, object]
    created_at: datetime
    started_at: datetime | None
    finished_at: datetime | None
