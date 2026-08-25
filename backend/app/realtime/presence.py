import json
import uuid
from datetime import UTC, datetime

from prometheus_client import Counter
from redis.asyncio import Redis

from app.core.config import get_settings
from app.realtime.events import REDIS_KEY_PREFIX, normalize_room_code

settings = get_settings()

websocket_connections_total = Counter(
    "websocket_connections_total",
    "WebSocket connect/disconnect events",
    ["event"],
)


def room_presence_key(
    room_code: str,
    connection_id: uuid.UUID,
) -> str:
    normalized_code = normalize_room_code(room_code)
    return f"{REDIS_KEY_PREFIX}:room:{normalized_code}:connections:{connection_id}"


async def register_presence(
    redis: Redis,
    room_code: str,
    connection_id: uuid.UUID,
    role: str,
    participant_id: uuid.UUID | None,
) -> None:
    payload = {
        "role": role,
        "participant_id": str(participant_id) if participant_id else None,
        "connected_at": datetime.now(UTC).isoformat(),
    }
    await redis.set(
        room_presence_key(room_code, connection_id),
        json.dumps(payload, ensure_ascii=False, separators=(",", ":")),
        ex=settings.realtime_presence_ttl_seconds,
    )
    websocket_connections_total.labels(event="connect").inc()


async def touch_presence(
    redis: Redis,
    room_code: str,
    connection_id: uuid.UUID,
) -> None:
    await redis.expire(
        room_presence_key(room_code, connection_id),
        settings.realtime_presence_ttl_seconds,
    )


async def remove_presence(
    redis: Redis,
    room_code: str,
    connection_id: uuid.UUID,
) -> None:
    await redis.delete(room_presence_key(room_code, connection_id))
    websocket_connections_total.labels(event="disconnect").inc()
