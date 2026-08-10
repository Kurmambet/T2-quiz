import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.game_session import GameSession


async def get_latest_game_session_for_room(
    session: AsyncSession,
    room_id: uuid.UUID,
    *,
    for_update: bool = False,
) -> GameSession | None:
    statement = (
        select(GameSession)
        .where(GameSession.room_id == room_id)
        .order_by(GameSession.created_at.desc())
        .limit(1)
    )

    if for_update:
        statement = statement.with_for_update()

    return await session.scalar(statement)
