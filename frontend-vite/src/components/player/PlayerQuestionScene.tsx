import { useEffect, useState } from "react";

import { apiRequest } from "../../api/client";
import type { GamePhase } from "../../lib/game-phase";
import type {
  CurrentParticipantQuestion,
  ParticipantAnswerSubmitted,
  ParticipantQuestionOption,
} from "../../types/api";
import { QuestionCountdown } from "../shared/QuestionCountdown";
type PlayerQuestionSceneProps = {
  roomCode: string;
  participantToken: string | null;
  currentGamePhase: GamePhase | null;
};

type QuestionContentProps = {
  roomCode: string;
  participantToken: string;
  currentGamePhase: GamePhase;
  currentQuestion: CurrentParticipantQuestion;
};

const QUESTION_VISIBLE_PHASES = new Set<GamePhase>([
  "question",
  "answers_closed",
  "answer_reveal",
  "scoreboard",
]);

function getSceneMessage(phase: GamePhase): string {
  if (phase === "question") {
    return "Выбери вариант и отправь ответ до истечения времени.";
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

function QuestionContent({
  roomCode,
  participantToken,
  currentGamePhase,
  currentQuestion,
}: QuestionContentProps) {
  const [selectedOption, setSelectedOption] =
    useState<ParticipantQuestionOption | null>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittedOptionId, setSubmittedOptionId] = useState<string | null>(
    null,
  );

  const [errorMessage, setErrorMessage] = useState("");

  const canSubmit =
    currentGamePhase === "question" &&
    submittedOptionId === null &&
    !isSubmitting;

  async function submitAnswer() {
    if (!selectedOption || !canSubmit) {
      return;
    }

    setIsSubmitting(true);
    setErrorMessage("");

    try {
      const submittedAnswer = await apiRequest<ParticipantAnswerSubmitted>(
        `/api/v1/rooms/${roomCode}/game/current-question/answer`,
        {
          method: "POST",
          headers: {
            "X-Participant-Token": participantToken,
          },
          body: JSON.stringify({
            selected_option_id: selectedOption.id,
          }),
        },
      );

      setSubmittedOptionId(submittedAnswer.selected_option_id);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Не удалось отправить ответ";

      if (message === "Answer has already been submitted for this question") {
        setSubmittedOptionId("already-submitted");
        setErrorMessage("");
      } else {
        setErrorMessage(message);
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  const { question } = currentQuestion;
  const isQuestionOpen = currentGamePhase === "question";
  const answerWasSubmitted = submittedOptionId !== null;

  return (
    <article className="t2-tile t2-tile--lime t2-span-12">
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

      <p className="t2-lead">{getSceneMessage(currentGamePhase)}</p>

      <div className="t2-question-options">
        {question.options.map((option) => {
          const isSelected = selectedOption?.id === option.id;
          const isSubmitted = submittedOptionId === option.id;

          return (
            <button
              aria-pressed={isSelected}
              className={[
                "t2-question-option",
                isSelected ? "t2-question-option--selected" : "",
                isSubmitted ? "t2-question-option--submitted" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              disabled={!canSubmit}
              key={option.id}
              onClick={() => setSelectedOption(option)}
              type="button"
            >
              <span className="t2-eyebrow">Вариант {option.position}</span>
              <span className="t2-lead">{option.content}</span>
            </button>
          );
        })}
      </div>

      {currentGamePhase === "question" && !answerWasSubmitted && (
        <button
          className="t2-button t2-button--blue"
          disabled={!selectedOption || isSubmitting}
          onClick={submitAnswer}
          type="button"
        >
          {isSubmitting ? "Отправляем ответ…" : "Ответить"}
        </button>
      )}

      {submittedOptionId !== null && (
        <p className="t2-lead">
          Ответ принят. Ждём, когда ведущий покажет результат.
        </p>
      )}

      {errorMessage && <p className="t2-copy">{errorMessage}</p>}
    </article>
  );
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

  if (!currentQuestion || !participantToken) {
    return null;
  }

  return (
    <QuestionContent
      currentGamePhase={currentGamePhase}
      currentQuestion={currentQuestion}
      key={currentQuestion.question.id}
      participantToken={participantToken}
      roomCode={roomCode}
    />
  );
}
