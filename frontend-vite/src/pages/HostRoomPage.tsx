import type { GamePhase } from "../lib/game-phase";
import type { RealtimeConnectionStatus } from "../lib/use-room-realtime";
import type { GameSession, QuizTemplate, RoomLobby } from "../types/api";
import { LeaderboardScene } from "../components/shared/LeaderboardScene";

type HostRoomPageProps = {
  lobby: RoomLobby;
  organizerToken: string;
  quizTemplates: QuizTemplate[];
  gameSession: GameSession | null;
  selectedTemplateId: string;
  defaultTimeLimit: number;
  allowLateJoin: boolean;
  showCorrectAnswer: boolean;
  currentGamePhase: GamePhase | null;
  nextGamePhase: GamePhase | null;
  realtimeStatus: RealtimeConnectionStatus;
  isLoading: boolean;
  message: string;
  gamePhaseLabel: string;
  onSelectedTemplateIdChange: (templateId: string) => void;
  onDefaultTimeLimitChange: (timeLimit: number) => void;
  onAllowLateJoinChange: (allowLateJoin: boolean) => void;
  onShowCorrectAnswerChange: (showCorrectAnswer: boolean) => void;
  onConfigureGame: () => void;
  onStartRoom: () => void;
  onTransitionGame: (targetPhase: GamePhase) => void;
  onClearSession: () => void;
};

export function HostRoomPage({
  lobby,
  organizerToken,
  quizTemplates,
  gameSession,
  selectedTemplateId,
  defaultTimeLimit,
  allowLateJoin,
  showCorrectAnswer,
  currentGamePhase,
  nextGamePhase,
  realtimeStatus,
  isLoading,
  message,
  gamePhaseLabel,
  onSelectedTemplateIdChange,
  onDefaultTimeLimitChange,
  onAllowLateJoinChange,
  onShowCorrectAnswerChange,
  onConfigureGame,
  onStartRoom,
  onTransitionGame,
  onClearSession,
}: HostRoomPageProps) {
  const canStartRoom = lobby.room.status === "lobby";

  const selectedTemplate = quizTemplates.find(
    (template) => template.id === selectedTemplateId,
  );

  const hasConfiguredGame = gameSession !== null;

  const currentQuestionPosition =
    typeof gameSession?.state.current_question_position === "number"
      ? gameSession.state.current_question_position
      : 0;

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
                onChange={(event) =>
                  onSelectedTemplateIdChange(event.target.value)
                }
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
                  onDefaultTimeLimitChange(Number(event.target.value))
                }
                type="number"
                value={defaultTimeLimit}
              />

              <label className="t2-checkbox">
                <input
                  checked={allowLateJoin}
                  onChange={(event) =>
                    onAllowLateJoinChange(event.target.checked)
                  }
                  type="checkbox"
                />
                Разрешить подключение после старта
              </label>

              <label className="t2-checkbox">
                <input
                  checked={showCorrectAnswer}
                  onChange={(event) =>
                    onShowCorrectAnswerChange(event.target.checked)
                  }
                  type="checkbox"
                />
                Показывать правильный ответ после вопроса
              </label>

              <button
                className="t2-button t2-button--outline"
                disabled={isLoading || !selectedTemplateId}
                onClick={onConfigureGame}
                type="button"
              >
                Сохранить настройки
              </button>

              {hasConfiguredGame && (
                <p className="t2-copy">Квиз настроен: можно запускать игру.</p>
              )}
            </section>
          )}

          {canStartRoom ? (
            <button
              className="t2-button t2-button--lime"
              disabled={isLoading || !hasConfiguredGame}
              onClick={onStartRoom}
              type="button"
            >
              Начать игру
            </button>
          ) : (
            <section className="t2-game-settings">
              <p className="t2-eyebrow">Управление игрой</p>

              <p className="t2-lead">
                Текущая сцена:{" "}
                {currentGamePhase ? gamePhaseLabel : "Не определена"}
              </p>

              <p className="t2-copy">Вопрос: {currentQuestionPosition}</p>

              {nextGamePhase && (
                <button
                  className="t2-button t2-button--lime"
                  disabled={isLoading}
                  onClick={() => onTransitionGame(nextGamePhase)}
                  type="button"
                >
                  {nextGamePhase === "presentation" && "Начать презентацию"}

                  {nextGamePhase === "question" &&
                    (currentGamePhase === "scoreboard"
                      ? "Следующий вопрос"
                      : "Показать вопрос")}

                  {nextGamePhase === "answers_closed" &&
                    "Закрыть приём ответов"}

                  {nextGamePhase === "answer_reveal" &&
                    "Показать правильный ответ"}

                  {nextGamePhase === "scoreboard" && "Показать таблицу"}
                </button>
              )}

              {currentGamePhase && currentGamePhase !== "finished" && (
                <button
                  className="t2-button t2-button--outline"
                  disabled={isLoading}
                  onClick={() => onTransitionGame("finished")}
                  type="button"
                >
                  Завершить квиз
                </button>
              )}

              {currentGamePhase === "finished" && (
                <p className="t2-copy">Квиз завершён.</p>
              )}
            </section>
          )}
        </article>

        <aside className="t2-tile t2-tile--magenta t2-span-4">
          <p className="t2-eyebrow">Статус</p>

          <p className="t2-title t2-title--stencil">{lobby.room.status}</p>
        </aside>

        <LeaderboardScene
          currentGamePhase={currentGamePhase}
          organizerToken={organizerToken}
          roomCode={lobby.room.code}
        />

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
            onClick={onClearSession}
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
