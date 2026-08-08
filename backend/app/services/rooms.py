import secrets
from typing import Final

from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.room import Room, RoomStatus
from app.schemas.room import RoomCreate
from app.services.tokens import generate_session_token, hash_session_token

ROOM_CODE_ALPHABET: Final[str] = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
ROOM_CODE_LENGTH: Final[int] = 6
ROOM_CODE_ATTEMPTS: Final[int] = 5


def generate_room_code() -> str:
    return "".join(secrets.choice(ROOM_CODE_ALPHABET) for _ in range(ROOM_CODE_LENGTH))


async def create_room(
    session: AsyncSession,
    payload: RoomCreate,
) -> tuple[Room, str]:
    organizer_token = generate_session_token()
    organizer_token_hash = hash_session_token(organizer_token)

    for _ in range(ROOM_CODE_ATTEMPTS):
        room = Room(
            code=generate_room_code(),
            title=payload.title.strip(),
            status=RoomStatus.LOBBY.value,
            organizer_token_hash=organizer_token_hash,
        )

        session.add(room)

        try:
            await session.commit()
        except IntegrityError:
            await session.rollback()
            continue

        await session.refresh(room)
        return room, organizer_token

    raise RuntimeError("Could not generate a unique room code")
