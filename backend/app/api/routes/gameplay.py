import logging
from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException, status
from redis.exceptions import RedisError
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db_session
from app.realtime.events import (
    build_room_answer_submitted_event,
    publish_room_event,
)
from app.realtime.redis import redis_client
from app.schemas.gameplay import (
    CurrentParticipantQuestionRead,
    CurrentQuestionRevealRead,
    ParticipantAnswerSubmit,
    ParticipantAnswerSubmitted,
    ParticipantQuestionOptionRead,
    ParticipantQuestionRead,
)
from app.services.answers import (
    AnswerAlreadySubmittedError,
    AnswerSubmissionNotAllowedError,
    QuestionDeadlineExpiredError,
    SelectedOptionNotAllowedError,
    submit_current_question_answer,
)
from app.services.game_sessions import GameSessionNotFoundError
from app.services.gameplay import (
    CurrentQuestionNotAvailableError,
    get_current_question_for_participant,
)
from app.services.participants import ParticipantSessionNotFoundError
from app.services.reveals import (
    CurrentQuestionRevealNotAvailableError,
    get_current_question_reveal_for_participant,
)
from app.services.rooms import RoomNotFoundError

logger = logging.getLogger(__name__)

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


@router.post(
    "/{code}/game/current-question/answer",
    response_model=ParticipantAnswerSubmitted,
    status_code=status.HTTP_201_CREATED,
)
async def submit_current_question_answer_endpoint(
    code: str,
    payload: ParticipantAnswerSubmit,
    session: DbSession,
    participant_token: ParticipantToken = None,
) -> ParticipantAnswerSubmitted:
    if participant_token is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Participant token is required",
        )

    try:
        answer = await submit_current_question_answer(
            session=session,
            room_code=code,
            participant_token=participant_token,
            payload=payload,
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
    except AnswerSubmissionNotAllowedError as error:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Answers are not accepted in this game phase",
        ) from error
    except QuestionDeadlineExpiredError as error:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Question deadline has expired",
        ) from error
    except SelectedOptionNotAllowedError as error:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Selected option does not belong to the current question",
        ) from error
    except AnswerAlreadySubmittedError as error:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Answer has already been submitted for this question",
        ) from error

    try:
        await publish_room_event(
            redis=redis_client,
            room_code=code,
            event=build_room_answer_submitted_event(
                room_code=code,
                question_id=str(answer.quiz_question_id),
            ),
        )
    except RedisError:
        logger.exception(
            "Answer was persisted but realtime event was not published",
        )

    return ParticipantAnswerSubmitted(
        id=answer.id,
        quiz_question_id=answer.quiz_question_id,
        selected_option_id=answer.selected_option_id,
        submitted_at=answer.submitted_at,
    )


@router.get(
    "/{code}/game/current-question/reveal",
    response_model=CurrentQuestionRevealRead,
)
async def get_current_question_reveal_endpoint(
    code: str,
    session: DbSession,
    participant_token: ParticipantToken = None,
) -> CurrentQuestionRevealRead:
    if participant_token is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Participant token is required",
        )

    try:
        (
            question,
            correct_option,
            answer,
        ) = await get_current_question_reveal_for_participant(
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
    except CurrentQuestionRevealNotAvailableError as error:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Answer reveal is not available in this game phase",
        ) from error

    if correct_option is None:
        return CurrentQuestionRevealRead(
            question_id=question.id,
            correct_option_id=None,
            correct_option_content=None,
            selected_option_id=None,
            is_correct=None,
            points_awarded=None,
        )

    return CurrentQuestionRevealRead(
        question_id=question.id,
        correct_option_id=correct_option.id,
        correct_option_content=correct_option.content,
        selected_option_id=answer.selected_option_id if answer else None,
        is_correct=answer.is_correct if answer else None,
        points_awarded=answer.points_awarded if answer else None,
    )
