import { useEffect, useState } from "react";

type QuestionCountdown = {
  remainingSeconds: number;
  formattedTime: string;
  isExpired: boolean;
};

function formatRemainingTime(remainingSeconds: number): string {
  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function useQuestionCountdown(
  deadlineAt: string | null,
): QuestionCountdown | null {
  const [nowMilliseconds, setNowMilliseconds] = useState<number | null>(null);

  useEffect(() => {
    if (!deadlineAt) {
      return;
    }

    const updateNow = () => {
      setNowMilliseconds(Date.now());
    };

    const initialTimeoutId = window.setTimeout(updateNow, 0);

    const intervalId = window.setInterval(updateNow, 1_000);

    return () => {
      window.clearTimeout(initialTimeoutId);
      window.clearInterval(intervalId);
    };
  }, [deadlineAt]);

  if (!deadlineAt || nowMilliseconds === null) {
    return null;
  }

  const deadlineMilliseconds = new Date(deadlineAt).getTime();

  if (Number.isNaN(deadlineMilliseconds)) {
    return null;
  }

  const remainingSeconds = Math.max(
    0,
    Math.ceil((deadlineMilliseconds - nowMilliseconds) / 1_000),
  );

  return {
    remainingSeconds,
    formattedTime: formatRemainingTime(remainingSeconds),
    isExpired: remainingSeconds === 0,
  };
}
