import { FormEvent, useState } from "react";

type RoomCreated = {
  id: string;
  code: string;
  title: string;
  status: string;
  organizer_token: string;
};

type ParticipantJoined = {
  id: string;
  room_id: string;
  username: string;
  participant_token: string;
};

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

async function request<T>(path: string, body: object): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const data: unknown = await response.json();

  if (!response.ok) {
    const detail =
      typeof data === "object" &&
      data !== null &&
      "detail" in data &&
      typeof data.detail === "string"
        ? data.detail
        : "Не удалось выполнить запрос";

    throw new Error(detail);
  }

  return data as T;
}

function App() {
  const [roomTitle, setRoomTitle] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [username, setUsername] = useState("");
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  async function handleCreateRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsLoading(true);
    setMessage("");

    try {
      const room = await request<RoomCreated>("/api/v1/rooms", {
        title: roomTitle,
      });

      sessionStorage.setItem("organizer_token", room.organizer_token);
      sessionStorage.setItem("room_code", room.code);

      setRoomCode(room.code);
      setMessage(`Рум создан. Код для участников: ${room.code}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Ошибка сервера");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleJoinRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsLoading(true);
    setMessage("");

    try {
      const participant = await request<ParticipantJoined>(
        `/api/v1/rooms/${roomCode.trim().toUpperCase()}/join`,
        { username },
      );

      sessionStorage.setItem(
        "participant_token",
        participant.participant_token,
      );
      sessionStorage.setItem("room_code", roomCode.trim().toUpperCase());
      sessionStorage.setItem("username", participant.username);

      setMessage(`Добро пожаловать, ${participant.username}! Ты в квиз-руме.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Ошибка сервера");
    } finally {
      setIsLoading(false);
    }
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
              value={roomTitle}
              onChange={(event) => setRoomTitle(event.target.value)}
              placeholder="Например, Квиз команды T2"
              required
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
