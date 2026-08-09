import { type FormEvent, useCallback, useEffect, useState } from "react";

import { apiRequest } from "./api/client";
import {
  GAME_PHASE_LABELS,
  getGamePhase,
  NEXT_GAME_PHASE,
  type GamePhase,
} from "./lib/game-phase";
import {
  clearActiveOrganizerSession,
  clearActiveParticipantSession,
  getActiveOrganizerSession,
  getActiveParticipantSession,
  saveOrganizerSession,
  saveParticipantSession,
  type OrganizerSessionStorage,
} from "./lib/game-session";
import { HostRoomPage } from "./pages/HostRoomPage";
import { JoinRoomPage } from "./pages/JoinRoomPage";
import { PlayerRoomPage } from "./pages/PlayerRoomPage";
import { RestoringSessionPage } from "./pages/RestoringSessionPage";

import { type RealtimeRole, useRoomRealtime } from "./lib/use-room-realtime";
import type {
  GameSession,
  ParticipantJoined,
  ParticipantSession,
  QuizTemplate,
  Room,
  RoomCreated,
  RoomLobby,
} from "./types/api";

function App() {
  const [roomTitle, setRoomTitle] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [username, setUsername] = useState("");

  const [participantSession, setParticipantSession] =
    useState<ParticipantSession | null>(null);

  const [organizerSession, setOrganizerSession] =
    useState<OrganizerSessionStorage | null>(null);

  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isRestoringSession, setIsRestoringSession] = useState(true);
  const [lobby, setLobby] = useState<RoomLobby | null>(null);

  const [quizTemplates, setQuizTemplates] = useState<QuizTemplate[]>([]);
  const [gameSession, setGameSession] = useState<GameSession | null>(null);

  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [defaultTimeLimit, setDefaultTimeLimit] = useState(30);
  const [allowLateJoin, setAllowLateJoin] = useState(true);
  const [showCorrectAnswer, setShowCorrectAnswer] = useState(true);

  useEffect(() => {
    async function restoreParticipantSession() {
      const savedSession = getActiveParticipantSession();

      if (!savedSession) {
        setIsRestoringSession(false);
        return;
      }

      try {
        const session = await apiRequest<ParticipantSession>(
          `/api/v1/rooms/${savedSession.roomCode}/me`,
          {
            headers: {
              "X-Participant-Token": savedSession.participantToken,
            },
          },
        );

        setRoomCode(session.room.code);
        setUsername(session.participant.username);
        setParticipantSession(session);

        const [roomLobby, loadedGameSession] = await Promise.all([
          apiRequest<RoomLobby>(`/api/v1/rooms/${session.room.code}`),
          apiRequest<GameSession>(
            `/api/v1/rooms/${session.room.code}/game`,
          ).catch(() => null),
        ]);

        setLobby(roomLobby);
        setGameSession(loadedGameSession);
      } catch {
        clearParticipantSession();
        setMessage("Предыдущая игровая сессия больше недоступна.");
      } finally {
        setIsRestoringSession(false);
      }
    }

    void restoreParticipantSession();
  }, []);

  useEffect(() => {
    async function restoreOrganizerSession() {
      const savedSession = getActiveOrganizerSession();

      if (!savedSession) {
        return;
      }

      try {
        const roomLobby = await apiRequest<RoomLobby>(
          `/api/v1/rooms/${savedSession.roomCode}`,
        );

        setOrganizerSession(savedSession);
        setLobby(roomLobby);
        try {
          const savedGameSession = await apiRequest<GameSession>(
            `/api/v1/rooms/${savedSession.roomCode}/game`,
          );

          setGameSession(savedGameSession);
          setSelectedTemplateId(savedGameSession.quiz_template_id ?? "");

          const configuredTimeLimit =
            savedGameSession.settings.default_time_limit_seconds;

          if (typeof configuredTimeLimit === "number") {
            setDefaultTimeLimit(configuredTimeLimit);
          }

          if (typeof savedGameSession.settings.allow_late_join === "boolean") {
            setAllowLateJoin(savedGameSession.settings.allow_late_join);
          }

          if (
            typeof savedGameSession.settings.show_correct_answer === "boolean"
          ) {
            setShowCorrectAnswer(savedGameSession.settings.show_correct_answer);
          }
        } catch {
          setGameSession(null);
        }
      } catch {
        clearActiveOrganizerSession();
        setOrganizerSession(null);
      }
    }

    void restoreOrganizerSession();
  }, []);

  useEffect(() => {
    async function loadQuizTemplates() {
      try {
        const templates = await apiRequest<QuizTemplate[]>(
          "/api/v1/quiz-templates",
        );

        setQuizTemplates(templates);
      } catch {
        setMessage("Не удалось загрузить список готовых квизов.");
      }
    }

    void loadQuizTemplates();
  }, []);

  const refreshRoomData = useCallback(async (): Promise<void> => {
    if (participantSession) {
      try {
        const [session, roomLobby, loadedGameSession] = await Promise.all([
          apiRequest<ParticipantSession>(
            `/api/v1/rooms/${participantSession.room.code}/me`,
            {
              headers: {
                "X-Participant-Token":
                  getActiveParticipantSession()?.participantToken ?? "",
              },
            },
          ),
          apiRequest<RoomLobby>(
            `/api/v1/rooms/${participantSession.room.code}`,
          ),
          apiRequest<GameSession>(
            `/api/v1/rooms/${participantSession.room.code}/game`,
          ).catch(() => null),
        ]);

        setParticipantSession(session);
        setLobby(roomLobby);
        setGameSession(loadedGameSession);
      } catch {
        clearActiveParticipantSession();
        setParticipantSession(null);
        setLobby(null);
        setMessage("Игровая сессия больше недоступна.");
      }

      return;
    }

    if (organizerSession) {
      try {
        const roomLobby = await apiRequest<RoomLobby>(
          `/api/v1/rooms/${organizerSession.roomCode}`,
        );

        setLobby(roomLobby);

        try {
          const loadedGameSession = await apiRequest<GameSession>(
            `/api/v1/rooms/${organizerSession.roomCode}/game`,
          );

          setGameSession(loadedGameSession);
        } catch {
          setGameSession(null);
        }
      } catch {
        clearActiveOrganizerSession();
        setOrganizerSession(null);
        setLobby(null);
        setMessage("Сессия ведущего больше недоступна.");
      }
    }
  }, [organizerSession, participantSession]);

  const realtimeRole: RealtimeRole | null = participantSession
    ? "participant"
    : organizerSession
      ? "organizer"
      : null;

  const realtimeRoomCode =
    participantSession?.room.code ?? organizerSession?.roomCode ?? null;

  const realtimeToken = participantSession
    ? (getActiveParticipantSession()?.participantToken ?? null)
    : (organizerSession?.organizerToken ?? null);

  const realtimeStatus = useRoomRealtime({
    roomCode: realtimeRoomCode,
    role: realtimeRole,
    token: realtimeToken,
    onRoomChanged: refreshRoomData,
  });

  const currentGamePhase = getGamePhase(gameSession);
  const nextGamePhase = currentGamePhase
    ? (NEXT_GAME_PHASE[currentGamePhase] ?? null)
    : null;

  function clearParticipantSession() {
    clearActiveParticipantSession();

    setParticipantSession(null);
    setRoomCode("");
    setUsername("");
  }

  async function handleCreateRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setIsLoading(true);
    setMessage("");

    try {
      const room = await apiRequest<RoomCreated>("/api/v1/rooms", {
        method: "POST",
        body: JSON.stringify({
          title: roomTitle,
        }),
      });

      saveOrganizerSession({
        roomCode: room.code,
        organizerToken: room.organizer_token,
      });
      setOrganizerSession({
        roomCode: room.code,
        organizerToken: room.organizer_token,
      });

      setGameSession(null);
      setSelectedTemplateId("");
      setDefaultTimeLimit(30);
      setAllowLateJoin(true);
      setShowCorrectAnswer(true);

      const roomLobby = await apiRequest<RoomLobby>(
        `/api/v1/rooms/${room.code}`,
      );

      setLobby(roomLobby);
      setRoomCode(room.code);
      setMessage(`Рум создан. Код для участников: ${room.code}`);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Ошибка создания room",
      );
    } finally {
      setIsLoading(false);
    }
  }

  async function handleJoinRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const normalizedRoomCode = roomCode.trim().toUpperCase();

    setIsLoading(true);
    setMessage("");

    try {
      const participant = await apiRequest<ParticipantJoined>(
        `/api/v1/rooms/${normalizedRoomCode}/join`,
        {
          method: "POST",
          body: JSON.stringify({
            username,
          }),
        },
      );

      saveParticipantSession({
        roomCode: normalizedRoomCode,
        username: participant.username,
        participantToken: participant.participant_token,
      });

      const session = await apiRequest<ParticipantSession>(
        `/api/v1/rooms/${normalizedRoomCode}/me`,
        {
          headers: {
            "X-Participant-Token": participant.participant_token,
          },
        },
      );

      setRoomCode(session.room.code);
      setUsername(session.participant.username);
      setParticipantSession(session);

      const roomLobby = await apiRequest<RoomLobby>(
        `/api/v1/rooms/${session.room.code}`,
      );

      setLobby(roomLobby);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Ошибка подключения к room",
      );
    } finally {
      setIsLoading(false);
    }
  }

  if (isRestoringSession) {
    return <RestoringSessionPage />;
  }

  if (participantSession) {
    return (
      <PlayerRoomPage
        participantSession={participantSession}
        participantToken={
          getActiveParticipantSession()?.participantToken ?? null
        }
        lobby={lobby}
        realtimeStatus={realtimeStatus}
        currentGamePhase={currentGamePhase}
        gamePhaseLabel={
          currentGamePhase
            ? GAME_PHASE_LABELS[currentGamePhase]
            : "Ожидаем настройки игры"
        }
        onClearSession={clearParticipantSession}
      />
    );
  }

  if (organizerSession && lobby) {
    return (
      <HostRoomPage
        allowLateJoin={allowLateJoin}
        currentGamePhase={currentGamePhase}
        defaultTimeLimit={defaultTimeLimit}
        gamePhaseLabel={
          currentGamePhase
            ? GAME_PHASE_LABELS[currentGamePhase]
            : "Не определена"
        }
        gameSession={gameSession}
        isLoading={isLoading}
        lobby={lobby}
        message={message}
        nextGamePhase={nextGamePhase}
        quizTemplates={quizTemplates}
        realtimeStatus={realtimeStatus}
        selectedTemplateId={selectedTemplateId}
        showCorrectAnswer={showCorrectAnswer}
        onAllowLateJoinChange={setAllowLateJoin}
        onClearSession={handleClearOrganizerSession}
        onConfigureGame={handleConfigureGame}
        onDefaultTimeLimitChange={setDefaultTimeLimit}
        onSelectedTemplateIdChange={(templateId) => {
          setSelectedTemplateId(templateId);
          setGameSession(null);
        }}
        onShowCorrectAnswerChange={setShowCorrectAnswer}
        onStartRoom={handleStartRoom}
        onTransitionGame={handleTransitionGame}
      />
    );
  }

  async function handleConfigureGame() {
    if (!organizerSession || !selectedTemplateId) {
      setMessage("Сначала выбери готовый квиз.");
      return;
    }

    setIsLoading(true);
    setMessage("");

    try {
      const configuredGame = await apiRequest<GameSession>(
        `/api/v1/rooms/${organizerSession.roomCode}/game`,
        {
          method: "POST",
          headers: {
            "X-Organizer-Token": organizerSession.organizerToken,
          },
          body: JSON.stringify({
            quiz_template_id: selectedTemplateId,
            settings: {
              allow_late_join: allowLateJoin,
              show_correct_answer: showCorrectAnswer,
              default_time_limit_seconds: defaultTimeLimit,
            },
          }),
        },
      );

      setGameSession(configuredGame);
      setMessage("Квиз выбран и настройки сохранены.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Не удалось настроить игру",
      );
    } finally {
      setIsLoading(false);
    }
  }

  async function handleStartRoom() {
    if (!organizerSession || !lobby) {
      return;
    }

    setIsLoading(true);
    setMessage("");

    try {
      const room = await apiRequest<Room>(
        `/api/v1/rooms/${organizerSession.roomCode}/start`,
        {
          method: "POST",
          headers: {
            "X-Organizer-Token": organizerSession.organizerToken,
          },
        },
      );

      setLobby({
        ...lobby,
        room,
      });

      const startedGame = await apiRequest<GameSession>(
        `/api/v1/rooms/${organizerSession.roomCode}/game`,
      );

      setGameSession(startedGame);

      setMessage(
        "Игра началась. Подключённые участники получат обновление автоматически.",
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Не удалось начать игру",
      );
    } finally {
      setIsLoading(false);
    }
  }

  async function handleTransitionGame(targetPhase: GamePhase) {
    if (!organizerSession) {
      return;
    }

    setIsLoading(true);
    setMessage("");

    try {
      const updatedGameSession = await apiRequest<GameSession>(
        `/api/v1/rooms/${organizerSession.roomCode}/game/transition`,
        {
          method: "POST",
          headers: {
            "X-Organizer-Token": organizerSession.organizerToken,
          },
          body: JSON.stringify({
            target_phase: targetPhase,
          }),
        },
      );

      setGameSession(updatedGameSession);

      const roomLobby = await apiRequest<RoomLobby>(
        `/api/v1/rooms/${organizerSession.roomCode}`,
      );

      setLobby(roomLobby);

      setMessage(`Сцена изменена: ${GAME_PHASE_LABELS[targetPhase]}.`);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Не удалось изменить игровую сцену",
      );
    } finally {
      setIsLoading(false);
    }
  }

  function handleClearOrganizerSession() {
    clearActiveOrganizerSession();
    setOrganizerSession(null);
    setLobby(null);
    setMessage("Локальная сессия ведущего очищена.");
  }

  return (
    <JoinRoomPage
      isLoading={isLoading}
      message={message}
      roomCode={roomCode}
      roomTitle={roomTitle}
      username={username}
      onCreateRoom={handleCreateRoom}
      onJoinRoom={handleJoinRoom}
      onRoomCodeChange={setRoomCode}
      onRoomTitleChange={setRoomTitle}
      onUsernameChange={setUsername}
    />
  );
}

export default App;
