import hmac
import secrets
from datetime import UTC, datetime
from typing import Final

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.game_session import GameSession
from app.models.room import Room, RoomStatus
from app.schemas.room import RoomCreate
from app.services.tokens import generate_session_token, hash_session_token

ROOM_CODE_ALPHABET: Final[str] = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
ROOM_CODE_LENGTH: Final[int] = 6
ROOM_CODE_ATTEMPTS: Final[int] = 5


class RoomNotFoundError(Exception):
    pass


class OrganizerTokenInvalidError(Exception):
    pass


class RoomNotStartableError(Exception):
    pass


class GameNotConfiguredError(Exception):
    pass


def generate_room_code() -> str:
    return "".join(secrets.choice(ROOM_CODE_ALPHABET) for _ in range(ROOM_CODE_LENGTH))


async def get_room_by_code(
    session: AsyncSession,
    room_code: str,
) -> Room:
    normalized_code = room_code.strip().upper()

    room = await session.scalar(select(Room).where(Room.code == normalized_code))

    if room is None:
        raise RoomNotFoundError

    return room


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


async def start_room(
    session: AsyncSession,
    room_code: str,
    organizer_token: str,
) -> Room:
    room = await get_room_by_code(
        session=session,
        room_code=room_code,
    )

    received_token_hash = hash_session_token(organizer_token)

    if not hmac.compare_digest(
        received_token_hash,
        room.organizer_token_hash,
    ):
        raise OrganizerTokenInvalidError

    if room.status != RoomStatus.LOBBY.value:
        raise RoomNotStartableError

    game_session = await session.scalar(
        select(GameSession).where(
            GameSession.room_id == room.id,
        )
    )

    if game_session is None or game_session.quiz_template_id is None:
        raise GameNotConfiguredError

    now = datetime.now(UTC)

    room.status = RoomStatus.ACTIVE.value

    game_session.started_at = now
    game_session.state = {
        **game_session.state,
        "phase": "lobby",
        "current_question_position": 0,
        "question_deadline_at": None,
        "current_question_time_limit_seconds": None,
    }

    await session.commit()
    await session.refresh(room)

    return room
