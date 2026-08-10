import { useEffect, useState } from "react";

import { apiRequest } from "../../api/client";
import type { GamePhase } from "../../lib/game-phase";

type AnswerStats = {
  phase: string;
  answered_count: number;
  participants_count: number;
};

type HostAnswerStatsProps = {
  roomCode: string;
  organizerToken: string;
  currentGamePhase: GamePhase | null;
  refreshKey: number;
};

const ANSWER_STATS_VISIBLE_PHASES = new Set<GamePhase>([
  "question",
  "answers_closed",
  "answer_reveal",
  "scoreboard",
  "finished",
]);

export function HostAnswerStats({
  roomCode,
  organizerToken,
  currentGamePhase,
  refreshKey,
}: HostAnswerStatsProps) {
  const [answeredCount, setAnsweredCount] = useState<number | null>(null);
  const [participantsCount, setParticipantsCount] = useState<number | null>(
    null,
  );

  useEffect(() => {
    const canLoadStats =
      currentGamePhase !== null &&
      ANSWER_STATS_VISIBLE_PHASES.has(currentGamePhase);

    if (!canLoadStats) {
      return;
    }

    const abortController = new AbortController();

    async function loadAnswerStats() {
      try {
        const response = await apiRequest<AnswerStats>(
          `/api/v1/rooms/${roomCode}/game/current-question/answer-stats`,
          {
            headers: {
              "X-Organizer-Token": organizerToken,
            },
            signal: abortController.signal,
          },
        );

        if (!abortController.signal.aborted) {
          setAnsweredCount(response.answered_count);
          setParticipantsCount(response.participants_count);
        }
      } catch {
        if (!abortController.signal.aborted) {
          setAnsweredCount(null);
          setParticipantsCount(null);
        }
      }
    }

    void loadAnswerStats();

    return () => {
      abortController.abort();
    };
  }, [currentGamePhase, organizerToken, refreshKey, roomCode]);

  if (
    !currentGamePhase ||
    !ANSWER_STATS_VISIBLE_PHASES.has(currentGamePhase) ||
    answeredCount === null ||
    participantsCount === null
  ) {
    return null;
  }

  return (
    <p className="t2-lead">
      Ответило: {answeredCount} / {participantsCount}
    </p>
  );
}
