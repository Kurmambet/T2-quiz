import { useQuestionCountdown } from "../../hooks/use-question-countdown";

type QuestionCountdownProps = {
  deadlineAt: string | null;
};

export function QuestionCountdown({ deadlineAt }: QuestionCountdownProps) {
  const countdown = useQuestionCountdown(deadlineAt);

  if (!countdown) {
    return null;
  }

  return (
    <p
      className={[
        "t2-question-countdown",
        countdown.isExpired ? "t2-question-countdown--expired" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      Осталось: {countdown.formattedTime}
    </p>
  );
}
