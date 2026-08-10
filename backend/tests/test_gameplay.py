from typing import Any
from uuid import uuid4

from fastapi.testclient import TestClient

from app.main import app


def create_test_game(
    client: TestClient,
    *,
    allow_late_join: bool,
) -> dict[str, Any]:
    template_response = client.post(
        "/api/v1/quiz-templates",
        json={
            "title": f"pytest gameplay {uuid4()}",
            "description": "Integration test quiz",
            "questions": [
                {
                    "content": "Какой цвет является основным акцентом T2?",
                    "time_limit_seconds": 60,
                    "points": 100,
                    "options": [
                        {
                            "content": "Маджента",
                            "is_correct": True,
                        },
                        {
                            "content": "Оранжевый",
                            "is_correct": False,
                        },
                    ],
                },
                {
                    "content": "Сколько будет два плюс два?",
                    "time_limit_seconds": 60,
                    "points": 100,
                    "options": [
                        {
                            "content": "Четыре",
                            "is_correct": True,
                        },
                        {
                            "content": "Пять",
                            "is_correct": False,
                        },
                    ],
                },
            ],
        },
    )
    assert template_response.status_code == 201
    template = template_response.json()

    room_response = client.post(
        "/api/v1/rooms",
        json={
            "title": f"pytest room {uuid4()}",
        },
    )
    assert room_response.status_code == 201
    room = room_response.json()

    room_code = room["code"]
    organizer_token = room["organizer_token"]

    organizer_headers = {
        "X-Organizer-Token": organizer_token,
    }

    configure_response = client.post(
        f"/api/v1/rooms/{room_code}/game",
        headers=organizer_headers,
        json={
            "quiz_template_id": template["id"],
            "settings": {
                "allow_late_join": allow_late_join,
                "show_correct_answer": True,
                "default_time_limit_seconds": 60,
            },
        },
    )
    assert configure_response.status_code == 200

    participant_response = client.post(
        f"/api/v1/rooms/{room_code}/join",
        json={
            "username": "pytest player",
        },
    )
    assert participant_response.status_code == 201
    participant = participant_response.json()

    participant_headers = {
        "X-Participant-Token": participant["participant_token"],
    }

    start_response = client.post(
        f"/api/v1/rooms/{room_code}/start",
        headers=organizer_headers,
    )
    assert start_response.status_code == 200

    presentation_response = client.post(
        f"/api/v1/rooms/{room_code}/game/transition",
        headers=organizer_headers,
        json={
            "target_phase": "presentation",
        },
    )
    assert presentation_response.status_code == 200

    question_response = client.post(
        f"/api/v1/rooms/{room_code}/game/transition",
        headers=organizer_headers,
        json={
            "target_phase": "question",
        },
    )
    assert question_response.status_code == 200

    return {
        "organizer_headers": organizer_headers,
        "participant_headers": participant_headers,
        "room_code": room_code,
    }


def get_current_question(
    client: TestClient,
    game: dict[str, Any],
) -> dict[str, Any]:
    response = client.get(
        f"/api/v1/rooms/{game['room_code']}/game/current-question",
        headers=game["participant_headers"],
    )
    assert response.status_code == 200
    return response.json()


def move_to_answer_reveal(
    client: TestClient,
    game: dict[str, Any],
) -> None:
    answers_closed_response = client.post(
        f"/api/v1/rooms/{game['room_code']}/game/transition",
        headers=game["organizer_headers"],
        json={
            "target_phase": "answers_closed",
        },
    )
    assert answers_closed_response.status_code == 200

    reveal_response = client.post(
        f"/api/v1/rooms/{game['room_code']}/game/transition",
        headers=game["organizer_headers"],
        json={
            "target_phase": "answer_reveal",
        },
    )
    assert reveal_response.status_code == 200


def test_answer_submission_does_not_reveal_correctness() -> None:
    with TestClient(app) as client:
        game = create_test_game(
            client,
            allow_late_join=True,
        )

        question_response = get_current_question(client, game)

        assert "is_correct" not in question_response
        assert "correct_option_id" not in question_response
        assert "correct_answer" not in question_response

        options = question_response["question"]["options"]
        selected_option_id = options[0]["id"]

        answer_response = client.post(
            f"/api/v1/rooms/{game['room_code']}/game/current-question/answer",
            headers=game["participant_headers"],
            json={
                "selected_option_id": selected_option_id,
            },
        )

        assert answer_response.status_code == 201

        answer_data = answer_response.json()

        assert answer_data["selected_option_id"] == selected_option_id
        assert "is_correct" not in answer_data
        assert "points_awarded" not in answer_data
        assert "correct_option_id" not in answer_data

        duplicate_response = client.post(
            f"/api/v1/rooms/{game['room_code']}/game/current-question/answer",
            headers=game["participant_headers"],
            json={
                "selected_option_id": selected_option_id,
            },
        )

        assert duplicate_response.status_code == 409
        assert duplicate_response.json() == {
            "detail": "Answer has already been submitted for this question",
        }

        reveal_before_phase_response = client.get(
            f"/api/v1/rooms/{game['room_code']}/game/current-question/reveal",
            headers=game["participant_headers"],
        )

        assert reveal_before_phase_response.status_code == 409
        assert reveal_before_phase_response.json() == {
            "detail": "Answer reveal is not available in this game phase",
        }

        move_to_answer_reveal(client, game)

        reveal_after_phase_response = client.get(
            f"/api/v1/rooms/{game['room_code']}/game/current-question/reveal",
            headers=game["participant_headers"],
        )

        assert reveal_after_phase_response.status_code == 200

        reveal_data = reveal_after_phase_response.json()

        assert reveal_data["selected_option_id"] == selected_option_id
        assert reveal_data["is_correct"] is True
        assert reveal_data["points_awarded"] == 100
        assert reveal_data["correct_option_content"] == "Маджента"


def test_late_join_is_blocked_when_disabled() -> None:
    with TestClient(app) as client:
        game = create_test_game(
            client,
            allow_late_join=False,
        )

        late_join_response = client.post(
            f"/api/v1/rooms/{game['room_code']}/join",
            json={
                "username": "late pytest player",
            },
        )

        assert late_join_response.status_code == 409
        assert late_join_response.json() == {
            "detail": "Room is not accepting participants",
        }


def test_leaderboard_sums_awarded_points_after_scoreboard() -> None:
    with TestClient(app) as client:
        game = create_test_game(
            client,
            allow_late_join=True,
        )

        question_response = get_current_question(client, game)
        selected_option_id = question_response["question"]["options"][0]["id"]

        answer_response = client.post(
            f"/api/v1/rooms/{game['room_code']}/game/current-question/answer",
            headers=game["participant_headers"],
            json={
                "selected_option_id": selected_option_id,
            },
        )

        assert answer_response.status_code == 201

        leaderboard_before_scoreboard_response = client.get(
            f"/api/v1/rooms/{game['room_code']}/game/leaderboard",
            headers=game["participant_headers"],
        )

        assert leaderboard_before_scoreboard_response.status_code == 409
        assert leaderboard_before_scoreboard_response.json() == {
            "detail": "Leaderboard is not available in this game phase",
        }

        move_to_answer_reveal(client, game)

        scoreboard_response = client.post(
            f"/api/v1/rooms/{game['room_code']}/game/transition",
            headers=game["organizer_headers"],
            json={
                "target_phase": "scoreboard",
            },
        )
        assert scoreboard_response.status_code == 200

        leaderboard_response = client.get(
            f"/api/v1/rooms/{game['room_code']}/game/leaderboard",
            headers=game["participant_headers"],
        )

        assert leaderboard_response.status_code == 200

        leaderboard_data = leaderboard_response.json()

        assert leaderboard_data["phase"] == "scoreboard"
        assert leaderboard_data["entries"] == [
            {
                "participant_id": leaderboard_data["entries"][0]["participant_id"],
                "username": "pytest player",
                "total_points": 100,
                "answered_questions": 1,
            }
        ]
