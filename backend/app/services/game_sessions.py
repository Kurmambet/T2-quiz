import hmac
from datetime import UTC, datetime, timedelta
from typing import Final

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.game_session import GameSession
from app.models.quiz import QuizQuestion, QuizTemplate
from app.models.room import RoomStatus
from app.schemas.game_session import (
    GamePhase,
    GameSessionConfigure,
    GameSessionTransition,
)
from app.services.rooms import (
    OrganizerTokenInvalidError,
    get_room_by_code,
)
from app.services.tokens import hash_session_token

ALLOWED_GAME_TRANSITIONS: Final[dict[GamePhase, set[GamePhase]]] = {
    GamePhase.LOBBY: {
        GamePhase.PRESENTATION,
        GamePhase.FINISHED,
    },
    GamePhase.PRESENTATION: {
        GamePhase.QUESTION,
        GamePhase.FINISHED,
    },
    GamePhase.QUESTION: {
        GamePhase.ANSWERS_CLOSED,
        GamePhase.FINISHED,
    },
    GamePhase.ANSWERS_CLOSED: {
        GamePhase.ANSWER_REVEAL,
        GamePhase.FINISHED,
    },
    GamePhase.ANSWER_REVEAL: {
        GamePhase.SCOREBOARD,
        GamePhase.FINISHED,
    },
    GamePhase.SCOREBOARD: {
        GamePhase.QUESTION,
        GamePhase.FINISHED,
    },
}


class QuizTemplateNotFoundError(Exception):
    pass


class RoomNotConfigurableError(Exception):
    pass


class GameSessionNotFoundError(Exception):
    pass


class GameSessionNotActiveError(Exception):
    pass


class InvalidGameTransitionError(Exception):
    pass


class NoNextQuestionError(Exception):
    pass


async def configure_quiz_game(
    session: AsyncSession,
    room_code: str,
    organizer_token: str,
    payload: GameSessionConfigure,
) -> GameSession:
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

    if room.status != RoomStatus.LOBBY.value:
        raise RoomNotConfigurableError

    template = await session.scalar(
        select(QuizTemplate).where(
            QuizTemplate.id == payload.quiz_template_id,
            QuizTemplate.is_published.is_(True),
        )
    )

    if template is None:
        raise QuizTemplateNotFoundError

    game_session = await session.scalar(
        select(GameSession).where(
            GameSession.room_id == room.id,
        )
    )

    if game_session is None:
        game_session = GameSession(
            room_id=room.id,
            game_type="quiz",
            quiz_template_id=template.id,
            settings=payload.settings,
            state={
                "phase": GamePhase.SETUP.value,
                "current_question_position": 0,
                "question_deadline_at": None,
                "current_question_time_limit_seconds": None,
            },
        )

        session.add(game_session)
    else:
        game_session.game_type = "quiz"
        game_session.quiz_template_id = template.id
        game_session.settings = payload.settings
        game_session.state = {
            "phase": GamePhase.SETUP.value,
            "current_question_position": 0,
            "question_deadline_at": None,
            "current_question_time_limit_seconds": None,
        }

    await session.commit()
    await session.refresh(game_session)

    return game_session


async def get_game_session(
    session: AsyncSession,
    room_code: str,
) -> GameSession:
    room = await get_room_by_code(
        session=session,
        room_code=room_code,
    )

    game_session = await session.scalar(
        select(GameSession).where(
            GameSession.room_id == room.id,
        )
    )

    if game_session is None:
        raise GameSessionNotFoundError

    return game_session


async def transition_game_session(
    session: AsyncSession,
    room_code: str,
    organizer_token: str,
    payload: GameSessionTransition,
) -> GameSession:
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

    if room.status != RoomStatus.ACTIVE.value:
        raise GameSessionNotActiveError

    game_session = await session.scalar(
        select(GameSession)
        .where(
            GameSession.room_id == room.id,
        )
        .with_for_update()
    )

    if game_session is None or game_session.quiz_template_id is None:
        raise GameSessionNotFoundError

    current_phase = _get_current_phase(game_session.state)

    if payload.target_phase not in ALLOWED_GAME_TRANSITIONS.get(
        current_phase,
        set(),
    ):
        raise InvalidGameTransitionError

    now = datetime.now(UTC)
    next_question_position = _get_question_position(game_session.state)
    question_deadline_at: str | None = None
    current_question_time_limit_seconds: int | None = None

    if payload.target_phase == GamePhase.QUESTION:
        (
            next_question_position,
            question_deadline_at,
            current_question_time_limit_seconds,
        ) = await _prepare_question(
            session=session,
            game_session=game_session,
            current_phase=current_phase,
            current_question_position=next_question_position,
            now=now,
        )

    game_session.state = {
        **game_session.state,
        "phase": payload.target_phase.value,
        "current_question_position": next_question_position,
        "question_deadline_at": question_deadline_at,
        "current_question_time_limit_seconds": (current_question_time_limit_seconds),
    }

    if payload.target_phase == GamePhase.FINISHED:
        room.status = RoomStatus.FINISHED.value
        game_session.finished_at = now

    await session.commit()
    await session.refresh(game_session)

    return game_session


def _get_current_phase(state: dict[str, object]) -> GamePhase:
    raw_phase = state.get("phase")

    try:
        return GamePhase(str(raw_phase))
    except ValueError as error:
        raise InvalidGameTransitionError from error


def _get_question_position(state: dict[str, object]) -> int:
    raw_position = state.get("current_question_position", 0)

    if isinstance(raw_position, int) and raw_position >= 0:
        return raw_position

    raise InvalidGameTransitionError


async def _prepare_question(
    session: AsyncSession,
    game_session: GameSession,
    current_phase: GamePhase,
    current_question_position: int,
    now: datetime,
) -> tuple[int, str, int]:
    if current_phase == GamePhase.PRESENTATION:
        next_position = 1
    elif current_phase == GamePhase.SCOREBOARD:
        next_position = current_question_position + 1
    else:
        raise InvalidGameTransitionError

    question = await session.scalar(
        select(QuizQuestion).where(
            QuizQuestion.quiz_template_id == game_session.quiz_template_id,
            QuizQuestion.position == next_position,
        )
    )

    if question is None:
        raise NoNextQuestionError

    time_limit_seconds = _get_effective_time_limit(
        settings=game_session.settings,
        template_time_limit_seconds=question.time_limit_seconds,
    )

    deadline = now + timedelta(seconds=time_limit_seconds)

    return (
        next_position,
        deadline.isoformat(),
        time_limit_seconds,
    )


def _get_effective_time_limit(
    settings: dict[str, object],
    template_time_limit_seconds: int,
) -> int:
    configured_time_limit = settings.get(
        "default_time_limit_seconds",
    )

    if (
        isinstance(configured_time_limit, int)
        and not isinstance(configured_time_limit, bool)
        and 5 <= configured_time_limit <= 600
    ):
        return configured_time_limit

    return template_time_limit_seconds
