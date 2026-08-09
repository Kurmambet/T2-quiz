import { useEffect, useState } from "react";

import { apiRequest } from "../../api/client";
import type { GamePhase } from "../../lib/game-phase";
import type { CurrentParticipantQuestion } from "../../types/api";

type PlayerQuestionSceneProps = {
  roomCode: string;
  participantToken: string | null;
  currentGamePhase: GamePhase | null;
};

const QUESTION_VISIBLE_PHASES = new Set<GamePhase>([
  "question",
  "answers_closed",
  "answer_reveal",
  "scoreboard",
]);

function getSceneMessage(phase: GamePhase): string {
  if (phase === "question") {
    return "Выбери вариант ответа. Отправка ответа будет добавлена следующим шагом.";
  }

  if (phase === "answers_closed") {
    return "Приём ответов закрыт.";
  }

  if (phase === "answer_reveal") {
    return "Ведущий показывает правильный ответ.";
  }

  return "Ведущий показывает таблицу результатов.";
}

function formatDeadline(value: string | null): string {
  if (!value) {
    return "Не задан";
  }

  const deadline = new Date(value);

  if (Number.isNaN(deadline.getTime())) {
    return "Не задан";
  }

  return deadline.toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function PlayerQuestionScene({
  roomCode,
  participantToken,
  currentGamePhase,
}: PlayerQuestionSceneProps) {
  const [currentQuestion, setCurrentQuestion] =
    useState<CurrentParticipantQuestion | null>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    const canLoadQuestion =
      participantToken !== null &&
      currentGamePhase !== null &&
      QUESTION_VISIBLE_PHASES.has(currentGamePhase);

    if (!canLoadQuestion) {
      return;
    }

    const token = participantToken;
    const abortController = new AbortController();

    async function loadCurrentQuestion() {
      setIsLoading(true);
      setErrorMessage("");

      try {
        const question = await apiRequest<CurrentParticipantQuestion>(
          `/api/v1/rooms/${roomCode}/game/current-question`,
          {
            headers: {
              "X-Participant-Token": token,
            },
            signal: abortController.signal,
          },
        );

        if (!abortController.signal.aborted) {
          setCurrentQuestion(question);
        }
      } catch (error) {
        if (abortController.signal.aborted) {
          return;
        }

        setCurrentQuestion(null);
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Не удалось загрузить текущий вопрос",
        );
      } finally {
        if (!abortController.signal.aborted) {
          setIsLoading(false);
        }
      }
    }

    void loadCurrentQuestion();

    return () => {
      abortController.abort();
    };
  }, [currentGamePhase, participantToken, roomCode]);

  if (!currentGamePhase || !QUESTION_VISIBLE_PHASES.has(currentGamePhase)) {
    return null;
  }

  if (isLoading) {
    return (
      <article className="t2-tile t2-tile--lime t2-span-12">
        <p className="t2-eyebrow">Вопрос</p>
        <p className="t2-lead">Загружаем вопрос…</p>
      </article>
    );
  }

  if (errorMessage) {
    return (
      <article className="t2-tile t2-tile--magenta t2-span-12">
        <p className="t2-eyebrow">Вопрос недоступен</p>
        <p className="t2-lead">{errorMessage}</p>
      </article>
    );
  }

  if (!currentQuestion) {
    return null;
  }

  const { question } = currentQuestion;

  return (
    <article className="t2-tile t2-tile--lime t2-span-12">
      <p className="t2-eyebrow">
        Вопрос {question.position} · {question.points} баллов
      </p>

      <h2 className="t2-title">{question.content}</h2>

      <p className="t2-copy">
        Дедлайн: {formatDeadline(currentQuestion.question_deadline_at)}
      </p>

      <p className="t2-lead">{getSceneMessage(currentGamePhase)}</p>

      <div className="t2-question-options">
        {question.options.map((option) => (
          <article className="t2-question-option" key={option.id}>
            <p className="t2-eyebrow">Вариант {option.position}</p>
            <p className="t2-lead">{option.content}</p>
          </article>
        ))}
      </div>
    </article>
  );
}
