from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.participant_answer import ParticipantAnswer
from app.models.quiz import QuizAnswerOption, QuizQuestion
from app.schemas.game_session import GamePhase
from app.schemas.gameplay import ParticipantAnswerSubmit
from app.services.game_session_queries import (
    get_latest_game_session_for_room,
)
from app.services.game_sessions import GameSessionNotFoundError
from app.services.participants import get_participant_session


class AnswerSubmissionNotAllowedError(Exception):
    pass


class QuestionDeadlineExpiredError(Exception):
    pass


class SelectedOptionNotAllowedError(Exception):
    pass


class AnswerAlreadySubmittedError(Exception):
    pass


async def submit_current_question_answer(
    session: AsyncSession,
    room_code: str,
    participant_token: str,
    payload: ParticipantAnswerSubmit,
) -> ParticipantAnswer:
    room, participant = await get_participant_session(
        session=session,
        room_code=room_code,
        participant_token=participant_token,
    )

    game_session = await get_latest_game_session_for_room(
        session=session,
        room_id=room.id,
        for_update=True,
    )

    if game_session is None or game_session.quiz_template_id is None:
        raise GameSessionNotFoundError

    phase = _get_phase(game_session.state)

    if phase != GamePhase.QUESTION:
        raise AnswerSubmissionNotAllowedError

    deadline = _get_deadline(game_session.state)
    now = datetime.now(UTC)

    if deadline is None or now >= deadline:
        raise QuestionDeadlineExpiredError

    question_position = _get_question_position(game_session.state)

    question = await session.scalar(
        select(QuizQuestion).where(
            QuizQuestion.quiz_template_id == game_session.quiz_template_id,
            QuizQuestion.position == question_position,
        )
    )

    if question is None:
        raise AnswerSubmissionNotAllowedError

    option = await session.scalar(
        select(QuizAnswerOption).where(
            QuizAnswerOption.id == payload.selected_option_id,
            QuizAnswerOption.quiz_question_id == question.id,
        )
    )

    if option is None:
        raise SelectedOptionNotAllowedError

    existing_answer_id = await session.scalar(
        select(ParticipantAnswer.id).where(
            ParticipantAnswer.game_session_id == game_session.id,
            ParticipantAnswer.participant_id == participant.id,
            ParticipantAnswer.quiz_question_id == question.id,
        )
    )

    if existing_answer_id is not None:
        raise AnswerAlreadySubmittedError

    answer = ParticipantAnswer(
        game_session_id=game_session.id,
        participant_id=participant.id,
        quiz_question_id=question.id,
        selected_option_id=option.id,
        is_correct=option.is_correct,
        points_awarded=question.points if option.is_correct else 0,
    )

    session.add(answer)

    try:
        await session.commit()
    except IntegrityError as error:
        await session.rollback()
        raise AnswerAlreadySubmittedError from error

    await session.refresh(answer)

    return answer


def _get_phase(state: dict[str, object]) -> GamePhase:
    raw_phase = state.get("phase")

    try:
        return GamePhase(str(raw_phase))
    except ValueError as error:
        raise AnswerSubmissionNotAllowedError from error


def _get_question_position(state: dict[str, object]) -> int:
    raw_position = state.get("current_question_position")

    if isinstance(raw_position, int) and raw_position > 0:
        return raw_position

    raise AnswerSubmissionNotAllowedError


def _get_deadline(state: dict[str, object]) -> datetime | None:
    raw_deadline = state.get("question_deadline_at")

    if raw_deadline is None:
        return None

    if not isinstance(raw_deadline, str):
        raise AnswerSubmissionNotAllowedError

    try:
        deadline = datetime.fromisoformat(raw_deadline)
    except ValueError as error:
        raise AnswerSubmissionNotAllowedError from error

    if deadline.tzinfo is None:
        raise AnswerSubmissionNotAllowedError

    return deadline
