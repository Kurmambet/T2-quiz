import { type FormEvent, useState } from "react";

import { apiRequest } from "../../api/client";
import type { QuizTemplate } from "../../types/api";

type DraftOption = {
  content: string;
};

type DraftQuestion = {
  content: string;
  timeLimitSeconds: number;
  points: number;
  options: DraftOption[];
  correctOptionIndex: number;
};

type CreateQuizTemplateFormProps = {
  onCreated: (template: QuizTemplate) => void;
};

const MAX_QUESTIONS = 100;
const MAX_OPTIONS = 8;
const MIN_OPTIONS = 2;

function createDraftQuestion(): DraftQuestion {
  return {
    content: "",
    timeLimitSeconds: 30,
    points: 100,
    options: [
      {
        content: "",
      },
      {
        content: "",
      },
    ],
    correctOptionIndex: 0,
  };
}

export function CreateQuizTemplateForm({
  onCreated,
}: CreateQuizTemplateFormProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [questions, setQuestions] = useState<DraftQuestion[]>([
    createDraftQuestion(),
  ]);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  function updateQuestion(
    questionIndex: number,
    updater: (question: DraftQuestion) => DraftQuestion,
  ) {
    setQuestions((currentQuestions) =>
      currentQuestions.map((question, index) =>
        index === questionIndex ? updater(question) : question,
      ),
    );
  }

  function updateOption(
    questionIndex: number,
    optionIndex: number,
    content: string,
  ) {
    updateQuestion(questionIndex, (question) => ({
      ...question,
      options: question.options.map((option, index) =>
        index === optionIndex
          ? {
              ...option,
              content,
            }
          : option,
      ),
    }));
  }

  function addQuestion() {
    if (questions.length >= MAX_QUESTIONS) {
      return;
    }

    setQuestions((currentQuestions) => [
      ...currentQuestions,
      createDraftQuestion(),
    ]);
  }

  function removeQuestion(questionIndex: number) {
    if (questions.length <= 1) {
      return;
    }

    setQuestions((currentQuestions) =>
      currentQuestions.filter((_, index) => index !== questionIndex),
    );
  }

  function addOption(questionIndex: number) {
    updateQuestion(questionIndex, (question) => {
      if (question.options.length >= MAX_OPTIONS) {
        return question;
      }

      return {
        ...question,
        options: [
          ...question.options,
          {
            content: "",
          },
        ],
      };
    });
  }

  function removeOption(questionIndex: number, optionIndex: number) {
    updateQuestion(questionIndex, (question) => {
      if (question.options.length <= MIN_OPTIONS) {
        return question;
      }

      const options = question.options.filter(
        (_, index) => index !== optionIndex,
      );

      let correctOptionIndex = question.correctOptionIndex;

      if (optionIndex < correctOptionIndex) {
        correctOptionIndex -= 1;
      }

      if (optionIndex === correctOptionIndex) {
        correctOptionIndex = 0;
      }

      return {
        ...question,
        options,
        correctOptionIndex,
      };
    });
  }

  function resetForm() {
    setTitle("");
    setDescription("");
    setQuestions([createDraftQuestion()]);
    setErrorMessage("");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!title.trim()) {
      setErrorMessage("Укажи название квиза.");
      return;
    }

    const hasEmptyQuestion = questions.some(
      (question) => !question.content.trim(),
    );

    if (hasEmptyQuestion) {
      setErrorMessage("Заполни текст каждого вопроса.");
      return;
    }

    const hasEmptyOption = questions.some((question) =>
      question.options.some((option) => !option.content.trim()),
    );

    if (hasEmptyOption) {
      setErrorMessage("Заполни текст каждого варианта.");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage("");

    try {
      const template = await apiRequest<QuizTemplate>(
        "/api/v1/quiz-templates",
        {
          method: "POST",
          body: JSON.stringify({
            title: title.trim(),
            description: description.trim() || null,
            questions: questions.map((question) => ({
              content: question.content.trim(),
              time_limit_seconds: question.timeLimitSeconds,
              points: question.points,
              options: question.options.map((option, optionIndex) => ({
                content: option.content.trim(),
                is_correct: optionIndex === question.correctOptionIndex,
              })),
            })),
          }),
        },
      );

      onCreated(template);
      resetForm();
      setIsOpen(false);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Не удалось создать квиз",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="t2-quiz-builder">
      <button
        className="t2-button t2-button--outline"
        onClick={() => {
          setIsOpen((currentValue) => !currentValue);
          setErrorMessage("");
        }}
        type="button"
      >
        {isOpen ? "Закрыть создание квиза" : "Создать новый квиз"}
      </button>

      {!isOpen && null}

      {isOpen && (
        <form className="t2-quiz-builder__form" onSubmit={handleSubmit}>
          <p className="t2-eyebrow">Новый глобальный квиз</p>

          <label className="t2-copy" htmlFor="new-quiz-title">
            Название квиза
          </label>

          <input
            id="new-quiz-title"
            maxLength={120}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Например, Технологии T2"
            required
            value={title}
          />

          <label className="t2-copy" htmlFor="new-quiz-description">
            Описание
          </label>

          <textarea
            id="new-quiz-description"
            maxLength={1000}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Необязательно"
            value={description}
          />

          {questions.map((question, questionIndex) => (
            <section className="t2-quiz-builder__question" key={questionIndex}>
              <p className="t2-eyebrow">Вопрос {questionIndex + 1}</p>

              <label
                className="t2-copy"
                htmlFor={`new-question-${questionIndex}`}
              >
                Текст вопроса
              </label>

              <textarea
                id={`new-question-${questionIndex}`}
                maxLength={5000}
                onChange={(event) =>
                  updateQuestion(questionIndex, (currentQuestion) => ({
                    ...currentQuestion,
                    content: event.target.value,
                  }))
                }
                placeholder="Введи вопрос"
                required
                value={question.content}
              />

              <label
                className="t2-copy"
                htmlFor={`new-question-time-${questionIndex}`}
              >
                Время на этот вопрос: {question.timeLimitSeconds} сек.
              </label>

              <input
                id={`new-question-time-${questionIndex}`}
                max="600"
                min="5"
                onChange={(event) =>
                  updateQuestion(questionIndex, (currentQuestion) => ({
                    ...currentQuestion,
                    timeLimitSeconds: Number(event.target.value),
                  }))
                }
                type="number"
                value={question.timeLimitSeconds}
              />

              <label
                className="t2-copy"
                htmlFor={`new-question-points-${questionIndex}`}
              >
                Баллы за вопрос: {question.points}
              </label>

              <input
                id={`new-question-points-${questionIndex}`}
                max="10000"
                min="1"
                onChange={(event) =>
                  updateQuestion(questionIndex, (currentQuestion) => ({
                    ...currentQuestion,
                    points: Number(event.target.value),
                  }))
                }
                type="number"
                value={question.points}
              />

              <div className="t2-quiz-builder__options">
                {question.options.map((option, optionIndex) => (
                  <label className="t2-quiz-builder__option" key={optionIndex}>
                    <input
                      checked={optionIndex === question.correctOptionIndex}
                      name={`correct-option-${questionIndex}`}
                      onChange={() =>
                        updateQuestion(questionIndex, (currentQuestion) => ({
                          ...currentQuestion,
                          correctOptionIndex: optionIndex,
                        }))
                      }
                      type="radio"
                    />

                    <span className="t2-copy">Правильный вариант</span>

                    <input
                      maxLength={500}
                      onChange={(event) =>
                        updateOption(
                          questionIndex,
                          optionIndex,
                          event.target.value,
                        )
                      }
                      placeholder={`Вариант ${optionIndex + 1}`}
                      required
                      value={option.content}
                    />

                    {question.options.length > MIN_OPTIONS && (
                      <button
                        className="t2-button t2-button--outline"
                        onClick={() => removeOption(questionIndex, optionIndex)}
                        type="button"
                      >
                        Удалить вариант
                      </button>
                    )}
                  </label>
                ))}
              </div>

              <button
                className="t2-button t2-button--outline"
                disabled={question.options.length >= MAX_OPTIONS}
                onClick={() => addOption(questionIndex)}
                type="button"
              >
                Добавить вариант
              </button>

              {questions.length > 1 && (
                <button
                  className="t2-button t2-button--outline"
                  onClick={() => removeQuestion(questionIndex)}
                  type="button"
                >
                  Удалить вопрос
                </button>
              )}
            </section>
          ))}

          <button
            className="t2-button t2-button--outline"
            disabled={questions.length >= MAX_QUESTIONS}
            onClick={addQuestion}
            type="button"
          >
            Добавить вопрос
          </button>

          {errorMessage && <p className="t2-copy">{errorMessage}</p>}

          <button
            className="t2-button t2-button--lime"
            disabled={isSubmitting}
            type="submit"
          >
            {isSubmitting ? "Создаём квиз…" : "Создать квиз"}
          </button>
        </form>
      )}
    </section>
  );
}
