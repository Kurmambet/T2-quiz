import { useEffect, useRef, useState } from "react";

export type RealtimeRole = "organizer" | "participant";

type RoomRealtimeEvent = {
  type: string;
  room_code?: string;
  data?: Record<string, unknown>;
};

type UseRoomRealtimeOptions = {
  roomCode: string | null;
  role: RealtimeRole | null;
  token: string | null;
  participantId: string | null;
  onRoomChanged: () => void | Promise<void>;
  onParticipantRemoved: () => void;
};

export type RealtimeConnectionStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "unauthorized";

const HEARTBEAT_INTERVAL_MS = 15_000;
const MAX_RECONNECT_DELAY_MS = 15_000;

function getWebSocketUrl(
  roomCode: string,
  role: RealtimeRole,
  token: string,
): string {
  const apiBaseUrl =
    import.meta.env.VITE_API_BASE_URL || window.location.origin;

  const url = new URL(`/ws/rooms/${roomCode}`, apiBaseUrl);

  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.searchParams.set("role", role);
  url.searchParams.set("token", token);

  return url.toString();
}

function parseRealtimeEvent(rawMessage: string): RoomRealtimeEvent | null {
  try {
    const value: unknown = JSON.parse(rawMessage);

    if (
      typeof value !== "object" ||
      value === null ||
      !("type" in value) ||
      typeof value.type !== "string"
    ) {
      return null;
    }

    return value as RoomRealtimeEvent;
  } catch {
    return null;
  }
}

export function useRoomRealtime({
  roomCode,
  role,
  token,
  participantId,
  onRoomChanged,
  onParticipantRemoved,
}: UseRoomRealtimeOptions): RealtimeConnectionStatus {
  const [connectionStatus, setConnectionStatus] =
    useState<RealtimeConnectionStatus>("idle");

  const onRoomChangedRef = useRef(onRoomChanged);
  const onParticipantRemovedRef = useRef(onParticipantRemoved);
  useEffect(() => {
    onRoomChangedRef.current = onRoomChanged;
  }, [onRoomChanged]);

  useEffect(() => {
    onParticipantRemovedRef.current = onParticipantRemoved;
  }, [onParticipantRemoved]);

  useEffect(() => {
    if (!roomCode || !role || !token) {
      return;
    }

    let socket: WebSocket | null = null;
    let heartbeatTimer: number | null = null;
    let reconnectTimer: number | null = null;
    let reconnectAttempt = 0;
    let stopped = false;

    const clearHeartbeat = (): void => {
      if (heartbeatTimer !== null) {
        window.clearInterval(heartbeatTimer);
        heartbeatTimer = null;
      }
    };

    const clearReconnect = (): void => {
      if (reconnectTimer !== null) {
        window.clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
    };

    const scheduleReconnect = (): void => {
      if (stopped) {
        return;
      }

      reconnectAttempt += 1;

      const delay = Math.min(
        1_000 * 2 ** (reconnectAttempt - 1),
        MAX_RECONNECT_DELAY_MS,
      );

      setConnectionStatus("reconnecting");

      reconnectTimer = window.setTimeout(() => {
        connect();
      }, delay);
    };

    const connect = (): void => {
      if (stopped) {
        return;
      }

      clearReconnect();
      clearHeartbeat();

      setConnectionStatus(
        reconnectAttempt === 0 ? "connecting" : "reconnecting",
      );

      socket = new WebSocket(getWebSocketUrl(roomCode, role, token));

      socket.addEventListener("open", () => {
        reconnectAttempt = 0;
        setConnectionStatus("connected");

        heartbeatTimer = window.setInterval(() => {
          if (socket?.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ type: "heartbeat" }));
          }
        }, HEARTBEAT_INTERVAL_MS);
      });

      socket.addEventListener("message", (message: MessageEvent<string>) => {
        const event = parseRealtimeEvent(message.data);

        if (!event) {
          return;
        }

        if (event.type === "participant.removed") {
          const removedParticipantId = event.data?.participant_id;

          if (
            typeof removedParticipantId === "string" &&
            removedParticipantId === participantId
          ) {
            onParticipantRemovedRef.current();
            return;
          }

          void onRoomChangedRef.current();
          return;
        }

        if (
          event.type === "room.state_changed" ||
          event.type === "room.lobby_changed" ||
          event.type === "room.answer_submitted"
        ) {
          void onRoomChangedRef.current();
        }
      });

      socket.addEventListener("close", (event: CloseEvent) => {
        clearHeartbeat();

        if (stopped || event.code === 1000) {
          return;
        }

        if (event.code === 1008) {
          setConnectionStatus("unauthorized");
          return;
        }

        scheduleReconnect();
      });

      socket.addEventListener("error", () => {
        socket?.close();
      });
    };

    connect();

    return () => {
      stopped = true;
      clearHeartbeat();
      clearReconnect();
      socket?.close(1000);
    };
  }, [participantId, roomCode, role, token]);

  if (!roomCode || !role || !token) {
    return "idle";
  }

  return connectionStatus;
}
