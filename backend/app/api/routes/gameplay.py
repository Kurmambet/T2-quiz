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
    CurrentHostQuestionRead,
    CurrentParticipantQuestionRead,
    CurrentQuestionAnswerStatsRead,
    CurrentQuestionRevealRead,
    HostQuestionOptionRead,
    HostQuestionRead,
    LeaderboardEntryRead,
    LeaderboardRead,
    ParticipantAnswerSubmit,
    ParticipantAnswerSubmitted,
    ParticipantQuestionOptionRead,
    ParticipantQuestionRead,
)
from app.services.answer_stats import (
    CurrentQuestionAnswerStatsNotAvailableError,
    get_current_question_answer_stats,
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
from app.services.host_gameplay import (
    HostCurrentQuestionNotAvailableError,
    get_current_question_for_organizer,
)
from app.services.leaderboard import (
    LeaderboardNotAvailableError,
    get_leaderboard,
)
from app.services.participants import ParticipantSessionNotFoundError
from app.services.reveals import (
    CurrentQuestionRevealNotAvailableError,
    get_current_question_reveal_for_participant,
)
from app.services.rooms import OrganizerTokenInvalidError, RoomNotFoundError

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

OrganizerToken = Annotated[
    str | None,
    Header(alias="X-Organizer-Token"),
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
        (
            phase,
            deadline,
            time_limit_seconds,
            question,
            options,
        ) = await get_current_question_for_participant(
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
            time_limit_seconds=time_limit_seconds,
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


@router.get(
    "/{code}/game/current-question/host",
    response_model=CurrentHostQuestionRead,
)
async def get_current_question_for_organizer_endpoint(
    code: str,
    session: DbSession,
    organizer_token: OrganizerToken = None,
) -> CurrentHostQuestionRead:
    if organizer_token is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Organizer token is required",
        )

    try:
        (
            phase,
            deadline,
            time_limit_seconds,
            question,
            options,
            should_show_correctness,
        ) = await get_current_question_for_organizer(
            session=session,
            room_code=code,
            organizer_token=organizer_token,
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
    except GameSessionNotFoundError as error:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Game is not configured",
        ) from error
    except HostCurrentQuestionNotAvailableError as error:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Current question is not available in this game phase",
        ) from error

    return CurrentHostQuestionRead(
        phase=phase,
        question_deadline_at=deadline,
        question=HostQuestionRead(
            id=question.id,
            position=question.position,
            content=question.content,
            time_limit_seconds=time_limit_seconds,
            points=question.points,
            options=[
                HostQuestionOptionRead(
                    id=option.id,
                    position=option.position,
                    content=option.content,
                    is_correct=(option.is_correct if should_show_correctness else None),
                )
                for option in options
            ],
        ),
    )


@router.get(
    "/{code}/game/current-question/answer-stats",
    response_model=CurrentQuestionAnswerStatsRead,
)
async def get_current_question_answer_stats_endpoint(
    code: str,
    session: DbSession,
    organizer_token: OrganizerToken = None,
) -> CurrentQuestionAnswerStatsRead:
    if organizer_token is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Organizer token is required",
        )

    try:
        (
            phase,
            answered_count,
            participants_count,
        ) = await get_current_question_answer_stats(
            session=session,
            room_code=code,
            organizer_token=organizer_token,
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
    except GameSessionNotFoundError as error:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Game is not configured",
        ) from error
    except CurrentQuestionAnswerStatsNotAvailableError as error:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Answer stats are not available in this game phase",
        ) from error

    return CurrentQuestionAnswerStatsRead(
        phase=phase,
        answered_count=answered_count,
        participants_count=participants_count,
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


@router.get(
    "/{code}/game/leaderboard",
    response_model=LeaderboardRead,
)
async def get_leaderboard_endpoint(
    code: str,
    session: DbSession,
    organizer_token: OrganizerToken = None,
    participant_token: ParticipantToken = None,
) -> LeaderboardRead:
    if organizer_token is None and participant_token is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Organizer or participant token is required",
        )

    try:
        phase, entries = await get_leaderboard(
            session=session,
            room_code=code,
            organizer_token=organizer_token,
            participant_token=participant_token,
        )
    except RoomNotFoundError as error:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Room not found",
        ) from error
    except (OrganizerTokenInvalidError, ParticipantSessionNotFoundError) as error:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid room session token",
        ) from error
    except GameSessionNotFoundError as error:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Game is not configured",
        ) from error
    except LeaderboardNotAvailableError as error:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Leaderboard is not available in this game phase",
        ) from error

    return LeaderboardRead(
        phase=phase,
        entries=[
            LeaderboardEntryRead(
                participant_id=participant_id,
                username=username,
                total_points=total_points,
                answered_questions=answered_questions,
            )
            for (
                participant_id,
                username,
                total_points,
                answered_questions,
            ) in entries
        ],
    )
