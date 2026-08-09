from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db_session
from app.schemas.gameplay import (
    CurrentParticipantQuestionRead,
    ParticipantQuestionOptionRead,
    ParticipantQuestionRead,
)
from app.services.game_sessions import GameSessionNotFoundError
from app.services.gameplay import (
    CurrentQuestionNotAvailableError,
    get_current_question_for_participant,
)
from app.services.participants import ParticipantSessionNotFoundError
from app.services.rooms import RoomNotFoundError

router = APIRouter(
    prefix="/rooms",
    tags=["gameplay"],
)

DbSession = Annotated[
    AsyncSession,
    Depends(get_db_session),
]

ParticipantToken = Annotated[
    str | None,
    Header(alias="X-Participant-Token"),
]


@router.get(
    "/{code}/game/current-question",
    response_model=CurrentParticipantQuestionRead,
)
async def get_current_question_endpoint(
    code: str,
    session: DbSession,
    participant_token: ParticipantToken = None,
) -> CurrentParticipantQuestionRead:
    if participant_token is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Participant token is required",
        )

    try:
        phase, deadline, question, options = await get_current_question_for_participant(
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
    except GameSessionNotFoundError as error:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Game is not configured",
        ) from error
    except CurrentQuestionNotAvailableError as error:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Current question is not available in this game phase",
        ) from error

    return CurrentParticipantQuestionRead(
        phase=phase,
        question_deadline_at=deadline,
        question=ParticipantQuestionRead(
            id=question.id,
            position=question.position,
            content=question.content,
            time_limit_seconds=question.time_limit_seconds,
            points=question.points,
            options=[
                ParticipantQuestionOptionRead(
                    id=option.id,
                    position=option.position,
                    content=option.content,
                )
                for option in options
            ],
        ),
    )
