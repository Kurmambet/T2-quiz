type ParticipantSessionStorage = {
  roomCode: string;
  username: string;
  participantToken: string;
};

type OrganizerSessionStorage = {
  roomCode: string;
  organizerToken: string;
};

const ACTIVE_PARTICIPANT_ROOM_KEY = "t2-quiz:active-participant-room";

const ACTIVE_ORGANIZER_ROOM_KEY = "t2-quiz:active-organizer-room";

function participantSessionKey(roomCode: string): string {
  return `t2-quiz:participant-session:${roomCode}`;
}

function organizerSessionKey(roomCode: string): string {
  return `t2-quiz:organizer-session:${roomCode}`;
}

function parseStorageValue<T>(value: string | null): T | null {
  if (value === null) {
    return null;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

export function saveParticipantSession(
  session: ParticipantSessionStorage,
): void {
  const roomCode = session.roomCode.trim().toUpperCase();

  localStorage.setItem(
    participantSessionKey(roomCode),
    JSON.stringify({
      ...session,
      roomCode,
    }),
  );

  localStorage.setItem(ACTIVE_PARTICIPANT_ROOM_KEY, roomCode);
}

export function getActiveParticipantSession(): ParticipantSessionStorage | null {
  const roomCode = localStorage.getItem(ACTIVE_PARTICIPANT_ROOM_KEY);

  if (!roomCode) {
    return null;
  }

  const session = parseStorageValue<ParticipantSessionStorage>(
    localStorage.getItem(participantSessionKey(roomCode)),
  );

  if (!session) {
    localStorage.removeItem(ACTIVE_PARTICIPANT_ROOM_KEY);
  }

  return session;
}

export function clearActiveParticipantSession(): void {
  const roomCode = localStorage.getItem(ACTIVE_PARTICIPANT_ROOM_KEY);

  if (roomCode) {
    localStorage.removeItem(participantSessionKey(roomCode));
  }

  localStorage.removeItem(ACTIVE_PARTICIPANT_ROOM_KEY);
}

export function saveOrganizerSession(session: OrganizerSessionStorage): void {
  const roomCode = session.roomCode.trim().toUpperCase();

  localStorage.setItem(
    organizerSessionKey(roomCode),
    JSON.stringify({
      ...session,
      roomCode,
    }),
  );

  localStorage.setItem(ACTIVE_ORGANIZER_ROOM_KEY, roomCode);
}
