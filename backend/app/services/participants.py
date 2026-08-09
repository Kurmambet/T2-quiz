from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.game_session import GameSession
from app.models.participant import Participant
from app.models.room import Room, RoomStatus
from app.schemas.participant import ParticipantJoin
from app.services.rooms import get_room_by_code
from app.services.tokens import generate_session_token, hash_session_token


class RoomNotJoinableError(Exception):
    pass


class UsernameAlreadyTakenError(Exception):
    pass


class ParticipantSessionNotFoundError(Exception):
    pass


async def join_room(
    session: AsyncSession,
    room_code: str,
    payload: ParticipantJoin,
) -> tuple[Participant, str]:
    room = await get_room_by_code(
        session=session,
        room_code=room_code,
    )

    await _ensure_room_is_joinable(
        session=session,
        room=room,
    )

    participant_token = generate_session_token()

    participant = Participant(
        room_id=room.id,
        username=payload.username,
        username_normalized=payload.username.casefold(),
        participant_token_hash=hash_session_token(participant_token),
    )

    session.add(participant)

    try:
        await session.commit()
    except IntegrityError as error:
        await session.rollback()
        raise UsernameAlreadyTakenError from error

    await session.refresh(participant)

    return participant, participant_token


async def get_participant_session(
    session: AsyncSession,
    room_code: str,
    participant_token: str,
) -> tuple[Room, Participant]:
    room = await get_room_by_code(
        session=session,
        room_code=room_code,
    )

    token_hash = hash_session_token(participant_token)

    participant = await session.scalar(
        select(Participant).where(
            Participant.room_id == room.id,
            Participant.participant_token_hash == token_hash,
        )
    )

    if participant is None:
        raise ParticipantSessionNotFoundError

    return room, participant


async def get_room_lobby(
    session: AsyncSession,
    room_code: str,
) -> tuple[Room, list[Participant]]:
    room = await get_room_by_code(
        session=session,
        room_code=room_code,
    )

    participants = list(
        await session.scalars(
            select(Participant)
            .where(Participant.room_id == room.id)
            .order_by(Participant.joined_at)
        )
    )

    return room, participants


async def _ensure_room_is_joinable(
    session: AsyncSession,
    room: Room,
) -> None:
    if room.status == RoomStatus.LOBBY.value:
        return

    if room.status != RoomStatus.ACTIVE.value:
        raise RoomNotJoinableError

    game_session = await session.scalar(
        select(GameSession).where(
            GameSession.room_id == room.id,
        )
    )

    if game_session is None:
        raise RoomNotJoinableError

    allow_late_join = game_session.settings.get(
        "allow_late_join",
        True,
    )

    if allow_late_join is not True:
        raise RoomNotJoinableError
