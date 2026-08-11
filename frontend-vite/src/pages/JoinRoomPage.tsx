import type { FormEvent } from "react";

type JoinRoomPageProps = {
  roomTitle: string;
  roomCode: string;
  username: string;
  message: string;
  isLoading: boolean;
  onRoomTitleChange: (value: string) => void;
  onRoomCodeChange: (value: string) => void;
  onUsernameChange: (value: string) => void;
  onCreateRoom: (event: FormEvent<HTMLFormElement>) => void;
  onJoinRoom: (event: FormEvent<HTMLFormElement>) => void;
};

export function JoinRoomPage({
  roomTitle,
  roomCode,
  username,
  message,
  isLoading,
  onRoomTitleChange,
  onRoomCodeChange,
  onUsernameChange,
  onCreateRoom,
  onJoinRoom,
}: JoinRoomPageProps) {
  return (
    <main className="t2-page">
      <section className="t2-bento">
        <article className="t2-tile t2-tile--white t2-span-6">
          <p className="t2-eyebrow">Для ведущего</p>

          <h1 className="t2-title mb-4">Создать комнату</h1>
          
          <form onSubmit={onCreateRoom}>
            <label className="t2-copy" htmlFor="room-title">
              Название квиза
            </label>

            <input
              id="room-title"
              maxLength={120}
              onChange={(event) => onRoomTitleChange(event.target.value)}
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

        <article className="t2-tile t2-tile--gray t2-span-6">
          <p className="t2-eyebrow">Для участника</p>

          <h2 className="t2-title mb-4">Войти в комнату</h2>
          <b></b>
          <form onSubmit={onJoinRoom}>
            <label className="t2-copy" htmlFor="room-code">
              Код комнаты
            </label>

            <input
              id="room-code"
              maxLength={6}
              onChange={(event) => onRoomCodeChange(event.target.value)}
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
              onChange={(event) => onUsernameChange(event.target.value)}
              placeholder="Алексей"
              required
              value={username}
            />

            <button
              className="t2-button t2-button--lime"
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
