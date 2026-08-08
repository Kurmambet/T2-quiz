import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator


class ParticipantJoin(BaseModel):
    username: str = Field(
        min_length=1,
        max_length=40,
        examples=["Алексей"],
    )

    @field_validator("username")
    @classmethod
    def normalize_username(cls, value: str) -> str:
        normalized = " ".join(value.split())

        if not normalized:
            raise ValueError("Username must not be empty")

        return normalized


class ParticipantRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    room_id: uuid.UUID
    username: str
    joined_at: datetime


class ParticipantJoined(ParticipantRead):
    participant_token: str = Field(
        description=(
            "Токен участника для текущей игровой сессии. в sessionStorage его."
        ),
    )
