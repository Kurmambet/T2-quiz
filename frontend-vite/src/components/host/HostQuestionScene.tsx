import { useEffect, useState } from "react";

import { apiRequest } from "../../api/client";
import type { GamePhase } from "../../lib/game-phase";
import type { CurrentHostQuestion } from "../../types/api";
import { HostAnswerStats } from "./HostAnswerStats";
import { QuestionCountdown } from "../shared/QuestionCountdown";
type HostQuestionSceneProps = {
  refreshKey: number;
  roomCode: string;
  organizerToken: string;
  currentGamePhase: GamePhase | null;
};

const HOST_QUESTION_VISIBLE_PHASES = new Set<GamePhase>([
  "question",
  "answers_closed",
  "answer_reveal",
  "scoreboard",
  "finished",
]);

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

function getPhaseDescription(phase: GamePhase): string {
  if (phase === "question") {
    return "Игроки могут отправлять ответы.";
  }

  if (phase === "answers_closed") {
    return "Приём ответов закрыт.";
  }

  if (phase === "answer_reveal") {
    return "Игрокам показывается правильный ответ.";
  }

  if (phase === "scoreboard") {
    return "Игрокам показывается таблица результатов.";
  }

  return "Квиз завершён.";
}

export function HostQuestionScene({
  roomCode,
  organizerToken,
  currentGamePhase,
  refreshKey,
}: HostQuestionSceneProps) {
  const [currentQuestion, setCurrentQuestion] =
    useState<CurrentHostQuestion | null>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    const canLoadQuestion =
      currentGamePhase !== null &&
      HOST_QUESTION_VISIBLE_PHASES.has(currentGamePhase);

    if (!canLoadQuestion) {
      return;
    }

    const abortController = new AbortController();

    async function loadCurrentQuestion() {
      setIsLoading(true);
      setErrorMessage("");

      try {
        const response = await apiRequest<CurrentHostQuestion>(
          `/api/v1/rooms/${roomCode}/game/current-question/host`,
          {
            headers: {
              "X-Organizer-Token": organizerToken,
            },
            signal: abortController.signal,
          },
        );

        if (!abortController.signal.aborted) {
          setCurrentQuestion(response);
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
  }, [currentGamePhase, organizerToken, roomCode]);

  if (
    !currentGamePhase ||
    !HOST_QUESTION_VISIBLE_PHASES.has(currentGamePhase)
  ) {
    return null;
  }

  if (isLoading) {
    return (
      <article className="t2-tile t2-tile--electric t2-span-12">
        <p className="t2-eyebrow">Текущий вопрос</p>
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
  const isQuestionOpen = currentGamePhase === "question";

  return (
    <article className="t2-tile t2-tile--gray t2-span-12">
      <p className="t2-eyebrow">
        Вопрос {question.position} · {question.points} баллов
      </p>

      <h2 className="t2-title">{question.content}</h2>

      {isQuestionOpen && (
        <>
          <p className="t2-copy">
            До окончания приёма ответов:{" "}
            {formatDeadline(currentQuestion.question_deadline_at)}
          </p>

          <QuestionCountdown
            deadlineAt={currentQuestion.question_deadline_at}
          />
        </>
      )}

      <HostAnswerStats
        currentGamePhase={currentGamePhase}
        organizerToken={organizerToken}
        refreshKey={refreshKey}
        roomCode={roomCode}
      />
      <p className="t2-lead">{getPhaseDescription(currentGamePhase)}</p>

      <div className="t2-host-question-options">
        {question.options.map((option) => (
          <article
            className={[
              "t2-host-question-option",
              option.is_correct === true
                ? "t2-host-question-option--correct"
                : "",
              option.is_correct === false
                ? "t2-host-question-option--incorrect"
                : "",
            ]
              .filter(Boolean)
              .join(" ")}
            key={option.id}
          >
            <p className="t2-eyebrow">Вариант {option.position}</p>

            <p className="t2-lead">{option.content}</p>

            {option.is_correct === true && (
              <p className="t2-copy">Правильный ответ</p>
            )}
          </article>
        ))}
      </div>
    </article>
  );
}
