from pydantic import BaseModel

from app.schemas.participant import ParticipantRead
from app.schemas.room import RoomRead


class RoomLobby(BaseModel):
    room: RoomRead
    participants: list[ParticipantRead]
