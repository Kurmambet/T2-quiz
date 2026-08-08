from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db_session
from app.schemas.lobby import RoomLobby
from app.schemas.participant import (
    ParticipantJoin,
    ParticipantJoined,
    ParticipantRead,
    ParticipantSession,
)
from app.schemas.room import RoomCreate, RoomCreated, RoomRead
from app.services.participants import (
    ParticipantSessionNotFoundError,
    RoomNotFoundError,
    RoomNotJoinableError,
    UsernameAlreadyTakenError,
    get_participant_session,
    get_room_lobby,
    join_room,
)
from app.services.rooms import create_room

router = APIRouter(
    prefix="/rooms",
    tags=["rooms"],
)

DbSession = Annotated[
    AsyncSession,
    Depends(get_db_session),
]

ParticipantToken = Annotated[
    str | None,
    Header(alias="X-Participant-Token"),
]


@router.post(
    "",
    response_model=RoomCreated,
    status_code=status.HTTP_201_CREATED,
)
async def create_room_endpoint(
    payload: RoomCreate,
    session: DbSession,
) -> RoomCreated:
    room, organizer_token = await create_room(
        session=session,
        payload=payload,
    )

    room_data = RoomRead.model_validate(room)

    return RoomCreated(
        **room_data.model_dump(),
        organizer_token=organizer_token,
    )


@router.get(
    "/{code}",
    response_model=RoomLobby,
)
async def get_room_lobby_endpoint(
    code: str,
    session: DbSession,
) -> RoomLobby:
    try:
        room, participants = await get_room_lobby(
            session=session,
            room_code=code,
        )
    except RoomNotFoundError as error:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Room not found",
        ) from error

    return RoomLobby(
        room=RoomRead.model_validate(room),
        participants=[
            ParticipantRead.model_validate(participant) for participant in participants
        ],
    )


@router.get(
    "/{code}/me",
    response_model=ParticipantSession,
)
async def get_current_participant_endpoint(
    code: str,
    session: DbSession,
    participant_token: ParticipantToken = None,
) -> ParticipantSession:
    if participant_token is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Participant token is required",
        )

    try:
        room, participant = await get_participant_session(
            session=session,
            room_code=code,
            participant_token=participant_token,
        )
    except RoomNotFoundError as error:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Room not found",
        ) from error
    except ParticipantSessionNotFoundError as error:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid participant token",
        ) from error

    return ParticipantSession(
        room=RoomRead.model_validate(room),
        participant=ParticipantRead.model_validate(participant),
    )


@router.post(
    "/{code}/join",
    response_model=ParticipantJoined,
    status_code=status.HTTP_201_CREATED,
)
async def join_room_endpoint(
    code: str,
    payload: ParticipantJoin,
    session: DbSession,
) -> ParticipantJoined:
    try:
        participant, participant_token = await join_room(
            session=session,
            room_code=code,
            payload=payload,
        )
    except RoomNotFoundError as error:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Room not found",
        ) from error
    except RoomNotJoinableError as error:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Room is not accepting participants",
        ) from error
    except UsernameAlreadyTakenError as error:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Username is already taken in this room",
        ) from error

    participant_data = ParticipantRead.model_validate(participant)

    return ParticipantJoined(
        **participant_data.model_dump(),
        participant_token=participant_token,
    )
