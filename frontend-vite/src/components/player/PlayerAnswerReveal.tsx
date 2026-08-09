import { useEffect, useState } from "react";

import { apiRequest } from "../../api/client";
import type { GamePhase } from "../../lib/game-phase";
import type { CurrentQuestionReveal } from "../../types/api";

type PlayerAnswerRevealProps = {
  roomCode: string;
  participantToken: string | null;
  currentGamePhase: GamePhase | null;
};

const REVEAL_VISIBLE_PHASES = new Set<GamePhase>([
  "answer_reveal",
  "scoreboard",
  "finished",
]);

export function PlayerAnswerReveal({
  roomCode,
  participantToken,
  currentGamePhase,
}: PlayerAnswerRevealProps) {
  const [reveal, setReveal] = useState<CurrentQuestionReveal | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    const canLoadReveal =
      participantToken !== null &&
      currentGamePhase !== null &&
      REVEAL_VISIBLE_PHASES.has(currentGamePhase);

    if (!canLoadReveal) {
      return;
    }

    const token = participantToken;
    const abortController = new AbortController();

    async function loadReveal() {
      setIsLoading(true);
      setErrorMessage("");

      try {
        const response = await apiRequest<CurrentQuestionReveal>(
          `/api/v1/rooms/${roomCode}/game/current-question/reveal`,
          {
            headers: {
              "X-Participant-Token": token,
            },
            signal: abortController.signal,
          },
        );

        if (!abortController.signal.aborted) {
          setReveal(response);
        }
      } catch (error) {
        if (abortController.signal.aborted) {
          return;
        }

        setReveal(null);
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Не удалось загрузить результат вопроса",
        );
      } finally {
        if (!abortController.signal.aborted) {
          setIsLoading(false);
        }
      }
    }

    void loadReveal();

    return () => {
      abortController.abort();
    };
  }, [currentGamePhase, participantToken, roomCode]);

  if (!currentGamePhase || !REVEAL_VISIBLE_PHASES.has(currentGamePhase)) {
    return null;
  }

  if (isLoading) {
    return (
      <article className="t2-tile t2-tile--electric t2-span-12">
        <p className="t2-eyebrow">Результат вопроса</p>
        <p className="t2-lead">Проверяем ответ…</p>
      </article>
    );
  }

  if (errorMessage) {
    return (
      <article className="t2-tile t2-tile--magenta t2-span-12">
        <p className="t2-eyebrow">Результат недоступен</p>
        <p className="t2-lead">{errorMessage}</p>
      </article>
    );
  }

  if (!reveal) {
    return null;
  }

  if (
    reveal.correct_option_id === null ||
    reveal.correct_option_content === null
  ) {
    return (
      <article className="t2-tile t2-tile--electric t2-span-12">
        <p className="t2-eyebrow">Результат вопроса</p>
        <h2 className="t2-title">Ответы скрыты</h2>
        <p className="t2-lead">
          Ведущий решил не показывать правильный вариант.
        </p>
      </article>
    );
  }

  if (reveal.selected_option_id === null) {
    return (
      <article className="t2-tile t2-tile--electric t2-span-12">
        <p className="t2-eyebrow">Правильный ответ</p>
        <h2 className="t2-title">{reveal.correct_option_content}</h2>
        <p className="t2-lead">Ты не отправил ответ на этот вопрос.</p>
      </article>
    );
  }

  if (reveal.is_correct) {
    return (
      <article className="t2-tile t2-tile--lime t2-span-12">
        <p className="t2-eyebrow">Правильный ответ</p>
        <h2 className="t2-title">{reveal.correct_option_content}</h2>
        <p className="t2-lead">
          Верно! Получено баллов: {reveal.points_awarded ?? 0}
        </p>
      </article>
    );
  }

  return (
    <article className="t2-tile t2-tile--magenta t2-span-12">
      <p className="t2-eyebrow">Правильный ответ</p>
      <h2 className="t2-title">{reveal.correct_option_content}</h2>
      <p className="t2-lead">
        Неверно. Получено баллов: {reveal.points_awarded ?? 0}
      </p>
    </article>
  );
}
