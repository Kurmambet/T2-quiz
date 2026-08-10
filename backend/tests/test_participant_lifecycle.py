from typing import Any
from uuid import uuid4

from fastapi.testclient import TestClient

from app.main import app


def create_room(client: TestClient) -> dict[str, Any]:
    response = client.post(
        "/api/v1/rooms",
        json={
            "title": f"pytest participant lifecycle {uuid4()}",
        },
    )

    assert response.status_code == 201

    return response.json()


def join_room(
    client: TestClient,
    room_code: str,
    username: str,
) -> dict[str, Any]:
    response = client.post(
        f"/api/v1/rooms/{room_code}/join",
        json={"username": username},
    )

    assert response.status_code == 201

    return response.json()


def test_participant_can_leave_and_rejoin_with_same_username() -> None:
    with TestClient(app) as client:
        room = create_room(client)
        room_code = room["code"]

        first_join = join_room(
            client=client,
            room_code=room_code,
            username="u1",
        )

        participant_headers = {
            "X-Participant-Token": first_join["participant_token"],
        }

        leave_response = client.delete(
            f"/api/v1/rooms/{room_code}/me",
            headers=participant_headers,
        )

        assert leave_response.status_code == 204

        stale_session_response = client.get(
            f"/api/v1/rooms/{room_code}/me",
            headers=participant_headers,
        )

        assert stale_session_response.status_code == 401

        lobby_response = client.get(
            f"/api/v1/rooms/{room_code}",
        )

        assert lobby_response.status_code == 200
        assert lobby_response.json()["participants"] == []

        second_join = client.post(
            f"/api/v1/rooms/{room_code}/join",
            json={"username": "u1"},
        )

        assert second_join.status_code == 201
        assert second_join.json()["username"] == "u1"


def test_host_removal_invalidates_token_and_allows_new_join() -> None:
    with TestClient(app) as client:
        room = create_room(client)
        room_code = room["code"]

        participant = join_room(
            client=client,
            room_code=room_code,
            username="u1",
        )

        participant_headers = {
            "X-Participant-Token": participant["participant_token"],
        }

        organizer_headers = {
            "X-Organizer-Token": room["organizer_token"],
        }

        removal_response = client.delete(
            f"/api/v1/rooms/{room_code}/participants/{participant['id']}",
            headers=organizer_headers,
        )

        assert removal_response.status_code == 204

        stale_session_response = client.get(
            f"/api/v1/rooms/{room_code}/me",
            headers=participant_headers,
        )

        assert stale_session_response.status_code == 401

        new_join_response = client.post(
            f"/api/v1/rooms/{room_code}/join",
            json={"username": "u2"},
        )

        assert new_join_response.status_code == 201
        assert new_join_response.json()["username"] == "u2"


def test_participant_token_cannot_access_another_room() -> None:
    with TestClient(app) as client:
        first_room = create_room(client)
        second_room = create_room(client)

        participant = join_room(
            client=client,
            room_code=first_room["code"],
            username="u1",
        )

        response = client.get(
            f"/api/v1/rooms/{second_room['code']}/me",
            headers={
                "X-Participant-Token": participant["participant_token"],
            },
        )

        assert response.status_code == 401
