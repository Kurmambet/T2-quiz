import hashlib
import hmac
import secrets
from typing import Final

from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.models.room import Room, RoomStatus
from app.schemas.room import RoomCreate

ROOM_CODE_ALPHABET: Final[str] = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
ROOM_CODE_LENGTH: Final[int] = 6
ROOM_CODE_ATTEMPTS: Final[int] = 5


def generate_room_code() -> str:
    return "".join(secrets.choice(ROOM_CODE_ALPHABET) for _ in range(ROOM_CODE_LENGTH))


def generate_organizer_token() -> str:
    return secrets.token_urlsafe(32)


def hash_organizer_token(token: str) -> str:
    settings = get_settings()

    return hmac.new(
        settings.app_secret_key.encode(),
        token.encode(),
        hashlib.sha256,
    ).hexdigest()


async def create_room(
    session: AsyncSession,
    payload: RoomCreate,
) -> tuple[Room, str]:
    organizer_token = generate_organizer_token()
    organizer_token_hash = hash_organizer_token(organizer_token)

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
