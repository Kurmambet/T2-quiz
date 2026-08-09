import hmac

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.game_session import GameSession
from app.models.quiz import QuizTemplate
from app.models.room import RoomStatus
from app.schemas.game_session import GameSessionConfigure
from app.services.rooms import (
    OrganizerTokenInvalidError,
    get_room_by_code,
)
from app.services.tokens import hash_session_token


class QuizTemplateNotFoundError(Exception):
    pass


class RoomNotConfigurableError(Exception):
    pass


class GameSessionNotFoundError(Exception):
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
                "phase": "setup",
                "current_question_position": 0,
                "question_deadline_at": None,
            },
        )

        session.add(game_session)
    else:
        game_session.game_type = "quiz"
        game_session.quiz_template_id = template.id
        game_session.settings = payload.settings
        game_session.state = {
            "phase": "setup",
            "current_question_position": 0,
            "question_deadline_at": None,
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
