import hmac
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.game_session import GameSession
from app.models.quiz import QuizAnswerOption, QuizQuestion
from app.schemas.game_session import GamePhase
from app.services.game_sessions import GameSessionNotFoundError
from app.services.rooms import OrganizerTokenInvalidError, get_room_by_code
from app.services.tokens import hash_session_token


class HostCurrentQuestionNotAvailableError(Exception):
    pass


HOST_QUESTION_VISIBLE_PHASES = {
    GamePhase.QUESTION,
    GamePhase.ANSWERS_CLOSED,
    GamePhase.ANSWER_REVEAL,
    GamePhase.SCOREBOARD,
    GamePhase.FINISHED,
}

HOST_CORRECTNESS_VISIBLE_PHASES = {
    GamePhase.ANSWER_REVEAL,
    GamePhase.SCOREBOARD,
    GamePhase.FINISHED,
}


async def get_current_question_for_organizer(
    session: AsyncSession,
    room_code: str,
    organizer_token: str,
) -> tuple[
    GamePhase,
    datetime | None,
    int,
    QuizQuestion,
    list[QuizAnswerOption],
    bool,
]:
    room = await get_room_by_code(
        session=session,
        room_code=room_code,
    )

    received_token_hash = hash_session_token(organizer_token)

    if not hmac.compare_digest(
        received_token_hash,
        room.organizer_token_hash,
    ):
        raise OrganizerTokenInvalidError

    game_session = await session.scalar(
        select(GameSession).where(
            GameSession.room_id == room.id,
        )
    )

    if game_session is None or game_session.quiz_template_id is None:
        raise GameSessionNotFoundError

    phase = _get_phase(game_session.state)

    if phase not in HOST_QUESTION_VISIBLE_PHASES:
        raise HostCurrentQuestionNotAvailableError

    question_position = _get_question_position(game_session.state)

    question = await session.scalar(
        select(QuizQuestion).where(
            QuizQuestion.quiz_template_id == game_session.quiz_template_id,
            QuizQuestion.position == question_position,
        )
    )

    if question is None:
        raise HostCurrentQuestionNotAvailableError

    options = list(
        await session.scalars(
            select(QuizAnswerOption)
            .where(
                QuizAnswerOption.quiz_question_id == question.id,
            )
            .order_by(QuizAnswerOption.position)
        )
    )

    show_correct_answer = game_session.settings.get(
        "show_correct_answer",
        True,
    )

    should_show_correctness = (
        phase in HOST_CORRECTNESS_VISIBLE_PHASES and show_correct_answer is True
    )

    return (
        phase,
        _get_deadline(game_session.state),
        _get_current_question_time_limit(
            state=game_session.state,
            fallback_time_limit_seconds=question.time_limit_seconds,
        ),
        question,
        options,
        should_show_correctness,
    )


def _get_phase(state: dict[str, object]) -> GamePhase:
    raw_phase = state.get("phase")

    try:
        return GamePhase(str(raw_phase))
    except ValueError as error:
        raise HostCurrentQuestionNotAvailableError from error


def _get_question_position(state: dict[str, object]) -> int:
    raw_position = state.get("current_question_position")

    if isinstance(raw_position, int) and raw_position > 0:
        return raw_position

    raise HostCurrentQuestionNotAvailableError


def _get_deadline(state: dict[str, object]) -> datetime | None:
    raw_deadline = state.get("question_deadline_at")

    if raw_deadline is None:
        return None

    if not isinstance(raw_deadline, str):
        raise HostCurrentQuestionNotAvailableError

    try:
        return datetime.fromisoformat(raw_deadline)
    except ValueError as error:
        raise HostCurrentQuestionNotAvailableError from error


def _get_current_question_time_limit(
    state: dict[str, object],
    fallback_time_limit_seconds: int,
) -> int:
    raw_time_limit = state.get(
        "current_question_time_limit_seconds",
    )

    if (
        isinstance(raw_time_limit, int)
        and not isinstance(raw_time_limit, bool)
        and raw_time_limit > 0
    ):
        return raw_time_limit

    return fallback_time_limit_seconds
