from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.game_session import GameSession
from app.models.quiz import QuizAnswerOption, QuizQuestion
from app.schemas.game_session import GamePhase
from app.services.game_sessions import GameSessionNotFoundError
from app.services.participants import get_participant_session


class CurrentQuestionNotAvailableError(Exception):
    pass


ACTIVE_QUESTION_PHASES = {
    GamePhase.QUESTION,
    GamePhase.ANSWERS_CLOSED,
    GamePhase.ANSWER_REVEAL,
    GamePhase.SCOREBOARD,
}


async def get_current_question_for_participant(
    session: AsyncSession,
    room_code: str,
    participant_token: str,
) -> tuple[
    GamePhase,
    datetime | None,
    int,
    QuizQuestion,
    list[QuizAnswerOption],
]:
    room, _ = await get_participant_session(
        session=session,
        room_code=room_code,
        participant_token=participant_token,
    )

    game_session = await session.scalar(
        select(GameSession).where(
            GameSession.room_id == room.id,
        )
    )

    if game_session is None or game_session.quiz_template_id is None:
        raise GameSessionNotFoundError

    phase = _get_phase(game_session.state)

    if phase not in ACTIVE_QUESTION_PHASES:
        raise CurrentQuestionNotAvailableError

    question_position = _get_question_position(game_session.state)

    question = await session.scalar(
        select(QuizQuestion).where(
            QuizQuestion.quiz_template_id == game_session.quiz_template_id,
            QuizQuestion.position == question_position,
        )
    )

    if question is None:
        raise CurrentQuestionNotAvailableError

    options = list(
        await session.scalars(
            select(QuizAnswerOption)
            .where(
                QuizAnswerOption.quiz_question_id == question.id,
            )
            .order_by(QuizAnswerOption.position)
        )
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
    )


def _get_phase(state: dict[str, object]) -> GamePhase:
    raw_phase = state.get("phase")

    try:
        return GamePhase(str(raw_phase))
    except ValueError as error:
        raise CurrentQuestionNotAvailableError from error


def _get_question_position(state: dict[str, object]) -> int:
    raw_position = state.get("current_question_position")

    if isinstance(raw_position, int) and raw_position > 0:
        return raw_position

    raise CurrentQuestionNotAvailableError


def _get_deadline(state: dict[str, object]) -> datetime | None:
    raw_deadline = state.get("question_deadline_at")

    if raw_deadline is None:
        return None

    if not isinstance(raw_deadline, str):
        raise CurrentQuestionNotAvailableError

    try:
        return datetime.fromisoformat(raw_deadline)
    except ValueError as error:
        raise CurrentQuestionNotAvailableError from error


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
