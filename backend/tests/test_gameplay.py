from typing import Any
from uuid import uuid4

from fastapi.testclient import TestClient

from app.main import app


def create_test_game(
    client: TestClient,
    *,
    allow_late_join: bool,
    default_time_limit_seconds: int = 60,
    template_time_limit_seconds: int = 60,
) -> dict[str, Any]:
    template_response = client.post(
        "/api/v1/quiz-templates",
        json={
            "title": f"pytest gameplay {uuid4()}",
            "description": "Integration test quiz",
            "questions": [
                {
                    "content": "Какой цвет является основным акцентом T2?",
                    "time_limit_seconds": template_time_limit_seconds,
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
                    "time_limit_seconds": template_time_limit_seconds,
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
                "default_time_limit_seconds": default_time_limit_seconds,
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


def test_game_setting_overrides_template_question_time_limit() -> None:
    with TestClient(app) as client:
        game = create_test_game(
            client,
            allow_late_join=True,
            default_time_limit_seconds=120,
            template_time_limit_seconds=20,
        )

        question_response = get_current_question(client, game)

        assert question_response["question"]["time_limit_seconds"] == 120

        game_session_response = client.get(
            f"/api/v1/rooms/{game['room_code']}/game",
        )

        assert game_session_response.status_code == 200

        game_state = game_session_response.json()["state"]

        assert game_state["current_question_time_limit_seconds"] == 120
        assert game_state["question_deadline_at"] is not None


def test_answer_rejects_option_from_another_question() -> None:
    with TestClient(app) as client:
        game = create_test_game(
            client,
            allow_late_join=True,
        )

        invalid_option_id = uuid4()

        answer_response = client.post(
            f"/api/v1/rooms/{game['room_code']}/game/current-question/answer",
            headers=game["participant_headers"],
            json={
                "selected_option_id": str(invalid_option_id),
            },
        )

        assert answer_response.status_code == 422
        assert answer_response.json() == {
            "detail": ("Selected option does not belong to the current question"),
        }


def test_finished_room_can_start_a_new_quiz_with_same_players() -> None:
    with TestClient(app) as client:
        game = create_test_game(
            client,
            allow_late_join=True,
        )

        first_game_response = client.get(
            f"/api/v1/rooms/{game['room_code']}/game",
        )

        assert first_game_response.status_code == 200

        first_game = first_game_response.json()

        first_question = get_current_question(
            client,
            game,
        )

        first_answer_response = client.post(
            f"/api/v1/rooms/{game['room_code']}/game/current-question/answer",
            headers=game["participant_headers"],
            json={
                "selected_option_id": first_question["question"]["options"][0]["id"],
            },
        )

        assert first_answer_response.status_code == 201

        finish_first_game_response = client.post(
            f"/api/v1/rooms/{game['room_code']}/game/transition",
            headers=game["organizer_headers"],
            json={"target_phase": "finished"},
        )

        assert finish_first_game_response.status_code == 200

        configure_second_game_response = client.post(
            f"/api/v1/rooms/{game['room_code']}/game",
            headers=game["organizer_headers"],
            json={
                "quiz_template_id": first_game["quiz_template_id"],
                "settings": {
                    "allow_late_join": True,
                    "show_correct_answer": True,
                    "default_time_limit_seconds": 60,
                },
            },
        )

        assert configure_second_game_response.status_code == 200

        second_game = configure_second_game_response.json()

        assert second_game["id"] != first_game["id"]
        assert second_game["room_id"] == first_game["room_id"]
        assert second_game["quiz_template_id"] == first_game["quiz_template_id"]
        assert second_game["state"]["phase"] == "setup"
        assert second_game["state"]["current_question_position"] == 0
        assert second_game["started_at"] is None
        assert second_game["finished_at"] is None

        lobby_response = client.get(
            f"/api/v1/rooms/{game['room_code']}",
        )

        assert lobby_response.status_code == 200

        lobby = lobby_response.json()

        assert lobby["room"]["code"] == game["room_code"]
        assert lobby["room"]["status"] == "lobby"
        assert len(lobby["participants"]) == 1
        assert lobby["participants"][0]["username"] == "pytest player"

        start_second_game_response = client.post(
            f"/api/v1/rooms/{game['room_code']}/start",
            headers=game["organizer_headers"],
        )

        assert start_second_game_response.status_code == 200

        for target_phase in (
            "presentation",
            "question",
            "answers_closed",
            "answer_reveal",
            "scoreboard",
        ):
            transition_response = client.post(
                f"/api/v1/rooms/{game['room_code']}/game/transition",
                headers=game["organizer_headers"],
                json={"target_phase": target_phase},
            )

            assert transition_response.status_code == 200

        leaderboard_response = client.get(
            f"/api/v1/rooms/{game['room_code']}/game/leaderboard",
            headers=game["participant_headers"],
        )

        assert leaderboard_response.status_code == 200

        leaderboard = leaderboard_response.json()

        assert leaderboard["phase"] == "scoreboard"
        assert len(leaderboard["entries"]) == 1
        assert leaderboard["entries"][0]["username"] == "pytest player"
        assert leaderboard["entries"][0]["total_points"] == 0
        assert leaderboard["entries"][0]["answered_questions"] == 0
