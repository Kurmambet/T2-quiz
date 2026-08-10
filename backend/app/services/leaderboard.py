import hmac
import uuid

from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.game_session import GameSession
from app.models.participant import Participant
from app.models.participant_answer import ParticipantAnswer
from app.schemas.game_session import GamePhase
from app.services.game_sessions import GameSessionNotFoundError
from app.services.participants import get_participant_session
from app.services.rooms import OrganizerTokenInvalidError, get_room_by_code
from app.services.tokens import hash_session_token


class LeaderboardNotAvailableError(Exception):
    pass


LEADERBOARD_VISIBLE_PHASES = {
    GamePhase.SCOREBOARD,
    GamePhase.FINISHED,
}


async def get_leaderboard(
    session: AsyncSession,
    room_code: str,
    organizer_token: str | None,
    participant_token: str | None,
) -> tuple[
    GamePhase,
    list[tuple[uuid.UUID, str, int, int]],
]:
    room = await get_room_by_code(
        session=session,
        room_code=room_code,
    )

    await _ensure_leaderboard_access(
        session=session,
        room_code=room_code,
        organizer_token=organizer_token,
        participant_token=participant_token,
    )

    game_session = await session.scalar(
        select(GameSession).where(
            GameSession.room_id == room.id,
        )
    )

    if game_session is None:
        raise GameSessionNotFoundError

    phase = _get_phase(game_session.state)

    if phase not in LEADERBOARD_VISIBLE_PHASES:
        raise LeaderboardNotAvailableError

    total_points = func.coalesce(
        func.sum(ParticipantAnswer.points_awarded),
        0,
    ).label("total_points")

    answered_questions = func.count(
        ParticipantAnswer.id,
    ).label("answered_questions")

    rows = await session.execute(
        select(
            Participant.id,
            Participant.username,
            total_points,
            answered_questions,
        )
        .outerjoin(
            ParticipantAnswer,
            and_(
                ParticipantAnswer.participant_id == Participant.id,
                ParticipantAnswer.game_session_id == game_session.id,
            ),
        )
        .where(
            Participant.room_id == room.id,
            Participant.removed_at.is_(None),
        )
        .group_by(
            Participant.id,
            Participant.username,
            Participant.username_normalized,
        )
        .order_by(
            total_points.desc(),
            answered_questions.desc(),
            Participant.username_normalized.asc(),
        )
    )

    return (
        phase,
        [
            (
                row.id,
                row.username,
                int(row.total_points),
                int(row.answered_questions),
            )
            for row in rows
        ],
    )


async def _ensure_leaderboard_access(
    session: AsyncSession,
    room_code: str,
    organizer_token: str | None,
    participant_token: str | None,
) -> None:
    if organizer_token is not None:
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

        return

    if participant_token is not None:
        await get_participant_session(
            session=session,
            room_code=room_code,
            participant_token=participant_token,
        )
        return

    raise OrganizerTokenInvalidError


def _get_phase(state: dict[str, object]) -> GamePhase:
    raw_phase = state.get("phase")

    try:
        return GamePhase(str(raw_phase))
    except ValueError as error:
        raise LeaderboardNotAvailableError from error
