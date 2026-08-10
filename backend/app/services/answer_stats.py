import hmac

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.participant import Participant
from app.models.participant_answer import ParticipantAnswer
from app.models.quiz import QuizQuestion
from app.schemas.game_session import GamePhase
from app.services.game_session_queries import (
    get_latest_game_session_for_room,
)
from app.services.game_sessions import GameSessionNotFoundError
from app.services.rooms import OrganizerTokenInvalidError, get_room_by_code
from app.services.tokens import hash_session_token


class CurrentQuestionAnswerStatsNotAvailableError(Exception):
    pass


ANSWER_STATS_VISIBLE_PHASES = {
    GamePhase.QUESTION,
    GamePhase.ANSWERS_CLOSED,
    GamePhase.ANSWER_REVEAL,
    GamePhase.SCOREBOARD,
    GamePhase.FINISHED,
}


async def get_current_question_answer_stats(
    session: AsyncSession,
    room_code: str,
    organizer_token: str,
) -> tuple[GamePhase, int, int]:
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

    game_session = await get_latest_game_session_for_room(
        session=session,
        room_id=room.id,
    )

    if game_session is None or game_session.quiz_template_id is None:
        raise GameSessionNotFoundError

    phase = _get_phase(game_session.state)

    if phase not in ANSWER_STATS_VISIBLE_PHASES:
        raise CurrentQuestionAnswerStatsNotAvailableError

    question_position = _get_question_position(game_session.state)

    question = await session.scalar(
        select(QuizQuestion).where(
            QuizQuestion.quiz_template_id == game_session.quiz_template_id,
            QuizQuestion.position == question_position,
        )
    )

    if question is None:
        raise CurrentQuestionAnswerStatsNotAvailableError

    answered_count = int(
        await session.scalar(
            select(func.count())
            .select_from(ParticipantAnswer)
            .where(
                ParticipantAnswer.game_session_id == game_session.id,
                ParticipantAnswer.quiz_question_id == question.id,
            )
        )
        or 0
    )

    participants_count = int(
        await session.scalar(
            select(func.count())
            .select_from(Participant)
            .where(
                Participant.room_id == room.id,
                Participant.removed_at.is_(None),
            )
        )
        or 0
    )

    return phase, answered_count, participants_count


def _get_phase(state: dict[str, object]) -> GamePhase:
    raw_phase = state.get("phase")

    try:
        return GamePhase(str(raw_phase))
    except ValueError as error:
        raise CurrentQuestionAnswerStatsNotAvailableError from error


def _get_question_position(state: dict[str, object]) -> int:
    raw_position = state.get("current_question_position")

    if isinstance(raw_position, int) and raw_position > 0:
        return raw_position

    raise CurrentQuestionAnswerStatsNotAvailableError
