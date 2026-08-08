import { FormEvent, useEffect, useState } from "react";

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

type ApiError = {
  detail?: string;
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

  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isRestoringSession, setIsRestoringSession] = useState(true);

  useEffect(() => {
    async function restoreParticipantSession() {
      const savedRoomCode = sessionStorage.getItem("room_code");
      const participantToken = sessionStorage.getItem("participant_token");

      if (!savedRoomCode || !participantToken) {
        setIsRestoringSession(false);
        return;
      }

      try {
        const session = await apiRequest<ParticipantSession>(
          `/api/v1/rooms/${savedRoomCode}/me`,
          {
            headers: {
              "X-Participant-Token": participantToken,
            },
          },
        );

        setRoomCode(session.room.code);
        setUsername(session.participant.username);
        setParticipantSession(session);
      } catch {
        clearParticipantSession();
        setMessage("Предыдущая игровая сессия больше недоступна.");
      } finally {
        setIsRestoringSession(false);
      }
    }

    void restoreParticipantSession();
  }, []);

  function clearParticipantSession() {
    sessionStorage.removeItem("room_code");
    sessionStorage.removeItem("username");
    sessionStorage.removeItem("participant_token");

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

      sessionStorage.setItem("organizer_token", room.organizer_token);
      sessionStorage.setItem("organizer_room_code", room.code);

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

      sessionStorage.setItem("room_code", normalizedRoomCode);
      sessionStorage.setItem("username", participant.username);
      sessionStorage.setItem(
        "participant_token",
        participant.participant_token,
      );

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
