import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


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
