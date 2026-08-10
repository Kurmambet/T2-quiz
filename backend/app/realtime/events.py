import json
from datetime import UTC, datetime

from redis.asyncio import Redis

REDIS_KEY_PREFIX = "t2_quiz"
ROOM_EVENTS_CHANNEL_SUFFIX = "events"


def normalize_room_code(room_code: str) -> str:
    return room_code.strip().upper()


def room_events_channel(room_code: str) -> str:
    normalized_code = normalize_room_code(room_code)
    return f"{REDIS_KEY_PREFIX}:room:{normalized_code}:{ROOM_EVENTS_CHANNEL_SUFFIX}"


def build_room_state_changed_event(
    room_code: str,
    state: dict[str, object],
    reason: str,
) -> dict[str, object]:
    return {
        "type": "room.state_changed",
        "room_code": normalize_room_code(room_code),
        "occurred_at": datetime.now(UTC).isoformat(),
        "data": {
            "reason": reason,
            "state": state,
        },
    }


def build_room_lobby_changed_event(
    room_code: str,
    reason: str,
) -> dict[str, object]:
    return {
        "type": "room.lobby_changed",
        "room_code": normalize_room_code(room_code),
        "occurred_at": datetime.now(UTC).isoformat(),
        "data": {
            "reason": reason,
        },
    }


async def publish_room_event(
    redis: Redis,
    room_code: str,
    event: dict[str, object],
) -> None:
    await redis.publish(
        room_events_channel(room_code),
        json.dumps(event, ensure_ascii=False, separators=(",", ":")),
    )


def build_room_answer_submitted_event(
    room_code: str,
    question_id: str,
) -> dict[str, object]:
    return {
        "type": "room.answer_submitted",
        "room_code": normalize_room_code(room_code),
        "occurred_at": datetime.now(UTC).isoformat(),
        "data": {
            "question_id": question_id,
        },
    }


def build_participant_removed_event(
    room_code: str,
    participant_id: str,
) -> dict[str, object]:
    return {
        "type": "participant.removed",
        "room_code": normalize_room_code(room_code),
        "occurred_at": datetime.now(UTC).isoformat(),
        "data": {
            "participant_id": participant_id,
        },
    }
