from typing import Annotated

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db_session
from app.schemas.room import RoomCreate, RoomCreated, RoomRead
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
