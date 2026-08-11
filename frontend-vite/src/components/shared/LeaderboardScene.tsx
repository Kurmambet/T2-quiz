import { useEffect, useState } from "react";

import { apiRequest } from "../../api/client";
import type { GamePhase } from "../../lib/game-phase";
import type { Leaderboard } from "../../types/api";

type LeaderboardSceneProps = {
  roomCode: string;
  currentGamePhase: GamePhase | null;
  organizerToken?: string;
  participantToken?: string;
};

const LEADERBOARD_VISIBLE_PHASES = new Set<GamePhase>([
  "scoreboard",
  "finished",
]);

export function LeaderboardScene({
  roomCode,
  currentGamePhase,
  organizerToken,
  participantToken,
}: LeaderboardSceneProps) {
  const [leaderboard, setLeaderboard] = useState<Leaderboard | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    const canLoadLeaderboard =
      currentGamePhase !== null &&
      LEADERBOARD_VISIBLE_PHASES.has(currentGamePhase) &&
      (organizerToken !== undefined || participantToken !== undefined);

    if (!canLoadLeaderboard) {
      return;
    }

    const abortController = new AbortController();

    async function loadLeaderboard() {
      setIsLoading(true);
      setErrorMessage("");

      const headers: HeadersInit = organizerToken
        ? {
            "X-Organizer-Token": organizerToken,
          }
        : {
            "X-Participant-Token": participantToken ?? "",
          };

      try {
        const response = await apiRequest<Leaderboard>(
          `/api/v1/rooms/${roomCode}/game/leaderboard`,
          {
            headers,
            signal: abortController.signal,
          },
        );

        if (!abortController.signal.aborted) {
          setLeaderboard(response);
        }
      } catch (error) {
        if (abortController.signal.aborted) {
          return;
        }

        setLeaderboard(null);
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Не удалось загрузить таблицу результатов",
        );
      } finally {
        if (!abortController.signal.aborted) {
          setIsLoading(false);
        }
      }
    }

    void loadLeaderboard();

    return () => {
      abortController.abort();
    };
  }, [currentGamePhase, organizerToken, participantToken, roomCode]);

  if (!currentGamePhase || !LEADERBOARD_VISIBLE_PHASES.has(currentGamePhase)) {
    return null;
  }

  if (isLoading) {
    return (
      <article className="t2-tile t2-tile--gray t2-span-12">
        <p className="t2-eyebrow">Результаты</p>
        <p className="t2-lead">Считаем баллы…</p>
      </article>
    );
  }

  if (errorMessage) {
    return (
      <article className="t2-tile t2-tile--magenta t2-span-12">
        <p className="t2-eyebrow">Результаты недоступны</p>
        <p className="t2-lead">{errorMessage}</p>
      </article>
    );
  }

  if (!leaderboard) {
    return null;
  }

  return (
    <article className="t2-tile t2-tile--gray t2-span-12">
      <p className="t2-eyebrow">
        {currentGamePhase === "finished"
          ? "Итоговые результаты"
          : "Таблица результатов"}
      </p>

      {leaderboard.entries.length === 0 ? (
        <p className="t2-lead">В комнате пока нет участников.</p>
      ) : (
        <ol className="t2-leaderboard">
          {leaderboard.entries.map((entry, index) => (
            <li className="t2-leaderboard__entry" key={entry.participant_id}>
              <span className="t2-leaderboard__place">{index + 1}</span>

              <span className="t2-leaderboard__username">{entry.username}</span>

              <span className="t2-leaderboard__score">
                {entry.total_points} баллов
              </span>
            </li>
          ))}
        </ol>
      )}
    </article>
  );
}
