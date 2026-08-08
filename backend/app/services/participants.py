from typing import Final

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.participant import Participant
from app.models.room import Room, RoomStatus
from app.schemas.participant import ParticipantJoin
from app.services.tokens import generate_session_token, hash_session_token

JOINABLE_ROOM_STATUSES: Final[set[str]] = {
    RoomStatus.LOBBY.value,
    RoomStatus.ACTIVE.value,
}


class RoomNotFoundError(Exception):
    pass


class RoomNotJoinableError(Exception):
    pass


class UsernameAlreadyTakenError(Exception):
    pass


class ParticipantSessionNotFoundError(Exception):
    pass


async def get_room_by_code(
    session: AsyncSession,
    room_code: str,
) -> Room:
    normalized_code = room_code.strip().upper()

    room = await session.scalar(select(Room).where(Room.code == normalized_code))

    if room is None:
        raise RoomNotFoundError

    return room


async def join_room(
    session: AsyncSession,
    room_code: str,
    payload: ParticipantJoin,
) -> tuple[Participant, str]:
    room = await get_room_by_code(
        session=session,
        room_code=room_code,
    )

    if room.status not in JOINABLE_ROOM_STATUSES:
        raise RoomNotJoinableError

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
