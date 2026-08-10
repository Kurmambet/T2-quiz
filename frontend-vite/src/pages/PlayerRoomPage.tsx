import type { GamePhase } from "../lib/game-phase";
import type { RealtimeConnectionStatus } from "../lib/use-room-realtime";
import type { ParticipantSession, RoomLobby } from "../types/api";
import { PlayerQuestionScene } from "../components/player/PlayerQuestionScene";
import { PlayerAnswerReveal } from "../components/player/PlayerAnswerReveal";
import { LeaderboardScene } from "../components/shared/LeaderboardScene";

type PlayerRoomPageProps = {
  participantSession: ParticipantSession;
  participantToken: string | null;
  lobby: RoomLobby | null;
  realtimeStatus: RealtimeConnectionStatus;
  currentGamePhase: GamePhase | null;
  onClearSession: () => void;
};

function getPlayerStatusText(
  currentGamePhase: GamePhase | null,
  realtimeStatus: RealtimeConnectionStatus,
): string {
  if (realtimeStatus === "connecting" || realtimeStatus === "reconnecting") {
    return "Подключаемся к комнате...";
  }

  if (realtimeStatus === "unauthorized") {
    return "Сессия недоступна. Откройте ссылку-приглашение ещё раз.";
  }

  if (currentGamePhase === "question") {
    return "Вопрос открыт - выберите ответ.";
  }

  if (currentGamePhase === "answers_closed") {
    return "Приём ответов завершён.";
  }

  if (currentGamePhase === "answer_reveal") {
    return "Показываем правильный ответ.";
  }

  if (currentGamePhase === "scoreboard") {
    return "Смотрим результаты.";
  }

  if (currentGamePhase === "finished") {
    return "Квиз завершён. Ожидаем следующую игру.";
  }

  return "Ожидаем начала квиза.";
}

export function PlayerRoomPage({
  participantSession,
  participantToken,
  lobby,
  realtimeStatus,
  currentGamePhase,
  onClearSession,
}: PlayerRoomPageProps) {
  const statusText = getPlayerStatusText(currentGamePhase, realtimeStatus);
  return (
    <main className="t2-page">
      <section className="t2-bento">
        <article className="t2-tile t2-tile--white t2-span-8">
          <p className="t2-eyebrow">Квиз-рум</p>

          <h1 className="t2-title">{participantSession.room.title}</h1>

          <p className="t2-lead">
            Ты подключён как {participantSession.participant.username}
          </p>

          <p className="t2-copy">Код комнаты: {participantSession.room.code}</p>
        </article>

        <aside className="t2-tile t2-tile--magenta t2-span-4">
          <p className="t2-eyebrow">Статус</p>

          <p className="t2-lead">{statusText}</p>
        </aside>

        <PlayerQuestionScene
          currentGamePhase={currentGamePhase}
          participantToken={participantToken}
          roomCode={participantSession.room.code}
        />

        <PlayerAnswerReveal
          currentGamePhase={currentGamePhase}
          participantToken={participantToken}
          roomCode={participantSession.room.code}
        />

        <LeaderboardScene
          currentGamePhase={currentGamePhase}
          participantToken={participantToken ?? undefined}
          roomCode={participantSession.room.code}
        />

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
            onClick={onClearSession}
            type="button"
          >
            Выйти из комнаты
          </button>
        </article>
      </section>
    </main>
  );
}
