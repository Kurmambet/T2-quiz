from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db_session
from app.schemas.game_session import (
    GameSessionConfigure,
    GameSessionRead,
)
from app.services.game_sessions import (
    GameSessionNotFoundError,
    QuizTemplateNotFoundError,
    RoomNotConfigurableError,
    configure_quiz_game,
    get_game_session,
)
from app.services.rooms import (
    OrganizerTokenInvalidError,
    RoomNotFoundError,
)

router = APIRouter(
    prefix="/rooms",
    tags=["game sessions"],
)

DbSession = Annotated[
    AsyncSession,
    Depends(get_db_session),
]

OrganizerToken = Annotated[
    str | None,
    Header(alias="X-Organizer-Token"),
]


@router.get(
    "/{code}/game",
    response_model=GameSessionRead,
)
async def get_game_session_endpoint(
    code: str,
    session: DbSession,
) -> GameSessionRead:
    try:
        game_session = await get_game_session(
            session=session,
            room_code=code,
        )
    except RoomNotFoundError as error:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Room not found",
        ) from error
    except GameSessionNotFoundError as error:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Game is not configured",
        ) from error

    return GameSessionRead.model_validate(game_session)


@router.post(
    "/{code}/game",
    response_model=GameSessionRead,
)
async def configure_quiz_game_endpoint(
    code: str,
    payload: GameSessionConfigure,
    session: DbSession,
    organizer_token: OrganizerToken = None,
) -> GameSessionRead:
    if organizer_token is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Organizer token is required",
        )

    try:
        game_session = await configure_quiz_game(
            session=session,
            room_code=code,
            organizer_token=organizer_token,
            payload=payload,
        )
    except RoomNotFoundError as error:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Room not found",
        ) from error
    except OrganizerTokenInvalidError as error:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid organizer token",
        ) from error
    except RoomNotConfigurableError as error:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Game can only be configured in lobby",
        ) from error
    except QuizTemplateNotFoundError as error:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Published quiz template not found",
        ) from error

    return GameSessionRead.model_validate(game_session)
