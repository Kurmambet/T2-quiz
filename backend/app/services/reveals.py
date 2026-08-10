from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.participant_answer import ParticipantAnswer
from app.models.quiz import QuizAnswerOption, QuizQuestion
from app.schemas.game_session import GamePhase
from app.services.game_session_queries import (
    get_latest_game_session_for_room,
)
from app.services.game_sessions import GameSessionNotFoundError
from app.services.participants import get_participant_session


class CurrentQuestionRevealNotAvailableError(Exception):
    pass


REVEAL_VISIBLE_PHASES = {
    GamePhase.ANSWER_REVEAL,
    GamePhase.SCOREBOARD,
    GamePhase.FINISHED,
}


async def get_current_question_reveal_for_participant(
    session: AsyncSession,
    room_code: str,
    participant_token: str,
) -> tuple[
    QuizQuestion,
    QuizAnswerOption | None,
    ParticipantAnswer | None,
]:
    room, participant = await get_participant_session(
        session=session,
        room_code=room_code,
        participant_token=participant_token,
    )

    game_session = await get_latest_game_session_for_room(
        session=session,
        room_id=room.id,
    )

    if game_session is None or game_session.quiz_template_id is None:
        raise GameSessionNotFoundError

    phase = _get_phase(game_session.state)

    if phase not in REVEAL_VISIBLE_PHASES:
        raise CurrentQuestionRevealNotAvailableError

    question_position = _get_question_position(game_session.state)

    question = await session.scalar(
        select(QuizQuestion).where(
            QuizQuestion.quiz_template_id == game_session.quiz_template_id,
            QuizQuestion.position == question_position,
        )
    )

    if question is None:
        raise CurrentQuestionRevealNotAvailableError

    answer = await session.scalar(
        select(ParticipantAnswer).where(
            ParticipantAnswer.game_session_id == game_session.id,
            ParticipantAnswer.participant_id == participant.id,
            ParticipantAnswer.quiz_question_id == question.id,
        )
    )

    show_correct_answer = game_session.settings.get(
        "show_correct_answer",
        True,
    )

    if show_correct_answer is not True:
        return question, None, None

    correct_option = await session.scalar(
        select(QuizAnswerOption).where(
            QuizAnswerOption.quiz_question_id == question.id,
            QuizAnswerOption.is_correct.is_(True),
        )
    )

    if correct_option is None:
        raise CurrentQuestionRevealNotAvailableError

    return question, correct_option, answer


def _get_phase(state: dict[str, object]) -> GamePhase:
    raw_phase = state.get("phase")

    try:
        return GamePhase(str(raw_phase))
    except ValueError as error:
        raise CurrentQuestionRevealNotAvailableError from error


def _get_question_position(state: dict[str, object]) -> int:
    raw_position = state.get("current_question_position")

    if isinstance(raw_position, int) and raw_position > 0:
        return raw_position

    raise CurrentQuestionRevealNotAvailableError
