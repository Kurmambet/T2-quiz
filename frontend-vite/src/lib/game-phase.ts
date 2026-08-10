import type { GameSession } from "../types/api";

export type GamePhase =
  | "setup"
  | "lobby"
  | "presentation"
  | "question"
  | "answers_closed"
  | "answer_reveal"
  | "scoreboard"
  | "finished";

export const GAME_PHASE_LABELS: Record<GamePhase, string> = {
  setup: "Настройка",
  lobby: "Лобби",
  presentation: "Презентация",
  question: "Вопрос",
  answers_closed: "Приём ответов закрыт",
  answer_reveal: "Правильный ответ",
  scoreboard: "Таблица результатов",
  finished: "Квиз завершён",
};

export const NEXT_GAME_PHASE: Partial<Record<GamePhase, GamePhase>> = {
  lobby: "presentation",
  presentation: "question",
  question: "answers_closed",
  answers_closed: "answer_reveal",
  answer_reveal: "scoreboard",
  scoreboard: "question",
};

export function getGamePhase(
  gameSession: GameSession | null,
): GamePhase | null {
  const phase = gameSession?.state.phase;

  if (
    phase === "setup" ||
    phase === "lobby" ||
    phase === "presentation" ||
    phase === "question" ||
    phase === "answers_closed" ||
    phase === "answer_reveal" ||
    phase === "scoreboard" ||
    phase === "finished"
  ) {
    return phase;
  }

  return null;
}
