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


async def join_room(
    session: AsyncSession,
    room_code: str,
    payload: ParticipantJoin,
) -> tuple[Participant, str]:
    normalized_code = room_code.strip().upper()

    room = await session.scalar(select(Room).where(Room.code == normalized_code))

    if room is None:
        raise RoomNotFoundError

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
