from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db_session
from app.schemas.participant import (
    ParticipantJoin,
    ParticipantJoined,
    ParticipantRead,
)
from app.schemas.room import RoomCreate, RoomCreated, RoomRead
from app.services.participants import (
    RoomNotFoundError,
    RoomNotJoinableError,
    UsernameAlreadyTakenError,
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
