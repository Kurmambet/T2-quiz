import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models.room import RoomStatus


class RoomCreate(BaseModel):
    title: str = Field(
        min_length=1,
        max_length=120,
        examples=["Пятничный корпоративный квиз"],
    )


class RoomRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    code: str
    title: str
    status: RoomStatus
    created_at: datetime
    updated_at: datetime


class RoomCreated(RoomRead):
    organizer_token: str = Field(
        description=(
            "Секрет ведущего. Сохрани его на клиенте: сервер не хранит "
            "исходное значение и не сможет показать его повторно."
        ),
    )
