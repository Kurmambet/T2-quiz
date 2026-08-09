import asyncio
import hmac
import json
import uuid
from dataclasses import dataclass

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from redis.asyncio.client import PubSub
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.db.session import async_session_factory
from app.realtime.events import room_events_channel
from app.realtime.presence import (
    register_presence,
    remove_presence,
    touch_presence,
)
from app.realtime.redis import redis_client
from app.services.participants import (
    ParticipantSessionNotFoundError,
    get_participant_session,
)
from app.services.rooms import RoomNotFoundError, get_room_by_code
from app.services.tokens import hash_session_token

settings = get_settings()

router = APIRouter(tags=["realtime"])


@dataclass(frozen=True)
class RealtimeIdentity:
    role: str
    participant_id: uuid.UUID | None


async def authenticate_websocket(
    session: AsyncSession,
    room_code: str,
    role: str | None,
    token: str | None,
) -> RealtimeIdentity | None:
    if role not in {"organizer", "participant"} or not token:
        return None

    try:
        if role == "organizer":
            room = await get_room_by_code(
                session=session,
                room_code=room_code,
            )
            received_token_hash = hash_session_token(token)
            if not hmac.compare_digest(
                received_token_hash,
                room.organizer_token_hash,
            ):
                return None

            return RealtimeIdentity(
                role="organizer",
                participant_id=None,
            )

        _, participant = await get_participant_session(
            session=session,
            room_code=room_code,
            participant_token=token,
        )
    except (RoomNotFoundError, ParticipantSessionNotFoundError):
        return None

    return RealtimeIdentity(
        role="participant",
        participant_id=participant.id,
    )


async def receive_client_messages(
    websocket: WebSocket,
    room_code: str,
    connection_id: uuid.UUID,
) -> None:
    while True:
        raw_message = await websocket.receive_text()

        try:
            message = json.loads(raw_message)
        except json.JSONDecodeError:
            continue

        if not isinstance(message, dict):
            continue

        if message.get("type") in {"heartbeat", "ping"}:
            await touch_presence(
                redis=redis_client,
                room_code=room_code,
                connection_id=connection_id,
            )


async def forward_room_events(
    websocket: WebSocket,
    pubsub: PubSub,
) -> None:
    while True:
        message = await pubsub.get_message(
            ignore_subscribe_messages=True,
            timeout=1.0,
        )
        if message is None:
            continue

        data = message.get("data")
        if not isinstance(data, str):
            continue

        await websocket.send_text(data)


@router.websocket("/ws/rooms/{code}")
async def room_realtime_endpoint(
    websocket: WebSocket,
    code: str,
) -> None:
    role = websocket.query_params.get("role")
    token = websocket.query_params.get("token")

    async with async_session_factory() as session:
        identity = await authenticate_websocket(
            session=session,
            room_code=code,
            role=role,
            token=token,
        )

    if identity is None:
        await websocket.close(code=1008)
        return

    room_code = code.strip().upper()
    connection_id = uuid.uuid4()
    pubsub = redis_client.pubsub()

    try:
        await websocket.accept()

        await register_presence(
            redis=redis_client,
            room_code=room_code,
            connection_id=connection_id,
            role=identity.role,
            participant_id=identity.participant_id,
        )

        await pubsub.subscribe(room_events_channel(room_code))

        await websocket.send_json(
            {
                "type": "realtime.connected",
                "room_code": room_code,
                "data": {
                    "heartbeat_interval_seconds": (
                        settings.realtime_heartbeat_interval_seconds
                    ),
                },
            },
        )

        async with asyncio.TaskGroup() as task_group:
            task_group.create_task(
                receive_client_messages(
                    websocket=websocket,
                    room_code=room_code,
                    connection_id=connection_id,
                )
            )
            task_group.create_task(
                forward_room_events(
                    websocket=websocket,
                    pubsub=pubsub,
                )
            )
    except* WebSocketDisconnect:
        pass
    finally:
        await pubsub.unsubscribe(room_events_channel(room_code))
        await pubsub.aclose()
        await remove_presence(
            redis=redis_client,
            room_code=room_code,
            connection_id=connection_id,
        )
