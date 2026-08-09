import { type FormEvent, useCallback, useEffect, useState } from "react";
import {
  clearActiveOrganizerSession,
  clearActiveParticipantSession,
  getActiveOrganizerSession,
  getActiveParticipantSession,
  saveOrganizerSession,
  saveParticipantSession,
  type OrganizerSessionStorage,
} from "./lib/game-session";
import { useRoomRealtime, type RealtimeRole } from "./lib/use-room-realtime";

type Room = {
  id: string;
  code: string;
  title: string;
  status: string;
  created_at: string;
  updated_at: string;
};

type RoomCreated = Room & {
  organizer_token: string;
};

type Participant = {
  id: string;
  room_id: string;
  username: string;
  joined_at: string;
};

type ParticipantJoined = Participant & {
  participant_token: string;
};

type ParticipantSession = {
  room: Room;
  participant: Participant;
};

type RoomLobby = {
  room: Room;
  participants: Participant[];
};

type ApiError = {
  detail?: string;
};

type QuizTemplate = {
  id: string;
  title: string;
  description: string | null;
  is_published: boolean;
  created_at: string;
  questions_count: number;
};

type GameSession = {
  id: string;
  room_id: string;
  game_type: string;
  quiz_template_id: string | null;
  settings: Record<string, unknown>;
  state: Record<string, unknown>;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
};

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000";

async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      ...options.headers,
      "Content-Type": "application/json",
    },
  });

  const data: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const detail =
      typeof data === "object" &&
      data !== null &&
      "detail" in data &&
      typeof (data as ApiError).detail === "string"
        ? (data as ApiError).detail
        : "Не удалось выполнить запрос";

    throw new Error(detail);
  }

  return data as T;
}

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

        const roomLobby = await apiRequest<RoomLobby>(
          `/api/v1/rooms/${session.room.code}`,
        );

        setLobby(roomLobby);
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
        const [session, roomLobby] = await Promise.all([
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
        ]);

        setParticipantSession(session);
        setLobby(roomLobby);
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
    return (
      <main className="t2-page">
        <section className="t2-bento">
          <article className="t2-tile t2-tile--black t2-span-12">
            <p className="t2-eyebrow">T2 Quiz Rooms</p>
            <h1 className="t2-title">Восстанавливаем сессию</h1>
          </article>
        </section>
      </main>
    );
  }

  if (participantSession) {
    return (
      <main className="t2-page">
        <section className="t2-bento">
          <article className="t2-tile t2-tile--white t2-span-8">
            <p className="t2-eyebrow">Квиз-рум</p>
            <h1 className="t2-title">{participantSession.room.title}</h1>

            <p className="t2-lead">
              Ты подключён как {participantSession.participant.username}
            </p>

            <p className="t2-copy">
              Код комнаты: {participantSession.room.code}
            </p>
            <p className="t2-copy">Realtime: {realtimeStatus}</p>
          </article>

          <aside className="t2-tile t2-tile--magenta t2-span-4">
            <p className="t2-eyebrow">Статус</p>
            <p className="t2-title t2-title--stencil">
              {participantSession.room.status}
            </p>
          </aside>

          <article className="t2-tile t2-tile--blue t2-span-12">
            <p className="t2-eyebrow">Lobby</p>

            <p className="t2-lead">Ожидаем, когда ведущий запустит игру.</p>

            <p className="t2-copy">
              Игроков в комнате: {lobby?.participants.length ?? 0}
            </p>

            <div className="t2-participants">
              {lobby?.participants.map((participant) => (
                <span className="t2-participant" key={participant.id}>
                  {participant.username}
                </span>
              ))}
            </div>

            <button
              className="t2-button t2-button--mono"
              onClick={clearParticipantSession}
              type="button"
            >
              Очистить локальную сессию
            </button>
          </article>
        </section>
      </main>
    );
  }

  if (organizerSession && lobby) {
    const canStartRoom = lobby.room.status === "lobby";

    const selectedTemplate = quizTemplates.find(
      (template) => template.id === selectedTemplateId,
    );

    const hasConfiguredGame = gameSession !== null;

    return (
      <main className="t2-page">
        <section className="t2-bento">
          <article className="t2-tile t2-tile--white t2-span-8">
            <p className="t2-eyebrow">Панель ведущего</p>

            <h1 className="t2-title">{lobby.room.title}</h1>

            <p className="t2-lead">Код для подключения: {lobby.room.code}</p>
            <p className="t2-copy">Realtime: {realtimeStatus}</p>
            <p className="t2-copy">
              Игроков в lobby: {lobby.participants.length}
            </p>

            {canStartRoom && (
              <section className="t2-game-settings">
                <p className="t2-eyebrow">Настройка игры</p>

                <label className="t2-copy" htmlFor="quiz-template">
                  Готовый квиз
                </label>

                <select
                  id="quiz-template"
                  onChange={(event) => {
                    setSelectedTemplateId(event.target.value);
                    setGameSession(null);
                  }}
                  value={selectedTemplateId}
                >
                  <option value="">Выбери квиз</option>

                  {quizTemplates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.title} · {template.questions_count} вопросов
                    </option>
                  ))}
                </select>

                {selectedTemplate && (
                  <p className="t2-copy">
                    {selectedTemplate.description ??
                      "Описание для этого квиза пока не задано."}
                  </p>
                )}

                <label className="t2-copy" htmlFor="time-limit">
                  Время на вопрос: {defaultTimeLimit} сек.
                </label>

                <input
                  id="time-limit"
                  max="600"
                  min="5"
                  onChange={(event) =>
                    setDefaultTimeLimit(Number(event.target.value))
                  }
                  type="number"
                  value={defaultTimeLimit}
                />

                <label className="t2-checkbox">
                  <input
                    checked={allowLateJoin}
                    onChange={(event) => setAllowLateJoin(event.target.checked)}
                    type="checkbox"
                  />
                  Разрешить подключение после старта
                </label>

                <label className="t2-checkbox">
                  <input
                    checked={showCorrectAnswer}
                    onChange={(event) =>
                      setShowCorrectAnswer(event.target.checked)
                    }
                    type="checkbox"
                  />
                  Показывать правильный ответ после вопроса
                </label>

                <button
                  className="t2-button t2-button--outline"
                  disabled={isLoading || !selectedTemplateId}
                  onClick={handleConfigureGame}
                  type="button"
                >
                  Сохранить настройки
                </button>

                {hasConfiguredGame && (
                  <p className="t2-copy">
                    Квиз настроен: можно запускать игру.
                  </p>
                )}
              </section>
            )}

            {canStartRoom ? (
              <button
                className="t2-button t2-button--lime"
                disabled={isLoading || !hasConfiguredGame}
                onClick={handleStartRoom}
                type="button"
              >
                Начать игру
              </button>
            ) : (
              <p className="t2-copy">Игра уже запущена.</p>
            )}
          </article>

          <aside className="t2-tile t2-tile--magenta t2-span-4">
            <p className="t2-eyebrow">Статус</p>

            <p className="t2-title t2-title--stencil">{lobby.room.status}</p>
          </aside>

          <article className="t2-tile t2-tile--blue t2-span-12">
            <p className="t2-eyebrow">Участники</p>

            <div className="t2-participants">
              {lobby.participants.map((participant) => (
                <span className="t2-participant" key={participant.id}>
                  {participant.username}
                </span>
              ))}
            </div>

            <button
              className="t2-button t2-button--mono"
              onClick={handleClearOrganizerSession}
              type="button"
            >
              Очистить сессию ведущего
            </button>
          </article>

          {message && (
            <aside className="t2-tile t2-tile--black t2-span-12">
              <p className="t2-eyebrow">Статус действия</p>
              <p className="t2-lead">{message}</p>
            </aside>
          )}
        </section>
      </main>
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

  function handleClearOrganizerSession() {
    clearActiveOrganizerSession();
    setOrganizerSession(null);
    setLobby(null);
    setMessage("Локальная сессия ведущего очищена.");
  }

  return (
    <main className="t2-page">
      <section className="t2-bento">
        <article className="t2-tile t2-tile--white t2-span-6">
          <p className="t2-eyebrow">Для ведущего</p>
          <h1 className="t2-title">Создать рум</h1>

          <form onSubmit={handleCreateRoom}>
            <label className="t2-copy" htmlFor="room-title">
              Название квиза
            </label>

            <input
              id="room-title"
              maxLength={120}
              onChange={(event) => setRoomTitle(event.target.value)}
              placeholder="Например, Квиз команды T2"
              required
              value={roomTitle}
            />

            <button
              className="t2-button t2-button--lime"
              disabled={isLoading}
              type="submit"
            >
              Создать игру
            </button>
          </form>
        </article>

        <article className="t2-tile t2-tile--blue t2-span-6">
          <p className="t2-eyebrow">Для участника</p>
          <h2 className="t2-title">Войти в рум</h2>

          <form onSubmit={handleJoinRoom}>
            <label className="t2-copy" htmlFor="room-code">
              Код комнаты
            </label>

            <input
              id="room-code"
              maxLength={6}
              onChange={(event) => setRoomCode(event.target.value)}
              placeholder="ABC123"
              required
              value={roomCode}
            />

            <label className="t2-copy" htmlFor="username">
              Твоё имя
            </label>

            <input
              id="username"
              maxLength={40}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="Алексей"
              required
              value={username}
            />

            <button
              className="t2-button t2-button--mono"
              disabled={isLoading}
              type="submit"
            >
              Подключиться
            </button>
          </form>
        </article>

        {message && (
          <aside className="t2-tile t2-tile--magenta t2-span-12">
            <p className="t2-eyebrow">Статус</p>
            <p className="t2-lead">{message}</p>
          </aside>
        )}
      </section>
    </main>
  );
}

export default App;
