type ParticipantSessionStorage = {
  roomCode: string;
  username: string;
  participantToken: string;
};

export type OrganizerSessionStorage = {
  roomCode: string;
  organizerToken: string;
};

const ACTIVE_PARTICIPANT_ROOM_KEY = "t2-quiz:active-participant-room";

const ACTIVE_ORGANIZER_ROOM_KEY = "t2-quiz:active-organizer-room";

function normalizeRoomCode(roomCode: string): string {
  return roomCode.trim().toUpperCase();
}

function participantSessionKey(roomCode: string): string {
  return `t2-quiz:participant-session:${normalizeRoomCode(roomCode)}`;
}

function organizerSessionKey(roomCode: string): string {
  return `t2-quiz:organizer-session:${normalizeRoomCode(roomCode)}`;
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

export function getParticipantSession(
  roomCode: string,
): ParticipantSessionStorage | null {
  const normalizedRoomCode = normalizeRoomCode(roomCode);

  const session = parseStorageValue<ParticipantSessionStorage>(
    localStorage.getItem(participantSessionKey(normalizedRoomCode)),
  );

  if (!session || session.roomCode !== normalizedRoomCode) {
    return null;
  }

  return session;
}

export function saveParticipantSession(
  session: ParticipantSessionStorage,
): void {
  const roomCode = normalizeRoomCode(session.roomCode);

  localStorage.setItem(
    participantSessionKey(roomCode),
    JSON.stringify({
      ...session,
      roomCode,
    }),
  );

  localStorage.setItem(ACTIVE_PARTICIPANT_ROOM_KEY, roomCode);
}

export function activateParticipantSession(
  roomCode: string,
): ParticipantSessionStorage | null {
  const normalizedRoomCode = normalizeRoomCode(roomCode);
  const session = getParticipantSession(normalizedRoomCode);

  if (!session) {
    return null;
  }

  localStorage.setItem(ACTIVE_PARTICIPANT_ROOM_KEY, normalizedRoomCode);

  return session;
}

export function getActiveParticipantSession(): ParticipantSessionStorage | null {
  const roomCode = localStorage.getItem(ACTIVE_PARTICIPANT_ROOM_KEY);

  if (!roomCode) {
    return null;
  }

  const session = getParticipantSession(roomCode);

  if (!session) {
    localStorage.removeItem(ACTIVE_PARTICIPANT_ROOM_KEY);
  }

  return session;
}

export function clearParticipantSession(roomCode: string): void {
  const normalizedRoomCode = normalizeRoomCode(roomCode);

  localStorage.removeItem(participantSessionKey(normalizedRoomCode));

  if (
    localStorage.getItem(ACTIVE_PARTICIPANT_ROOM_KEY) === normalizedRoomCode
  ) {
    localStorage.removeItem(ACTIVE_PARTICIPANT_ROOM_KEY);
  }
}

export function clearActiveParticipantSession(): void {
  const roomCode = localStorage.getItem(ACTIVE_PARTICIPANT_ROOM_KEY);

  if (roomCode) {
    clearParticipantSession(roomCode);
    return;
  }

  localStorage.removeItem(ACTIVE_PARTICIPANT_ROOM_KEY);
}

export function saveOrganizerSession(session: OrganizerSessionStorage): void {
  const roomCode = normalizeRoomCode(session.roomCode);

  localStorage.setItem(
    organizerSessionKey(roomCode),
    JSON.stringify({
      ...session,
      roomCode,
    }),
  );

  localStorage.setItem(ACTIVE_ORGANIZER_ROOM_KEY, roomCode);
}

export function getActiveOrganizerSession(): OrganizerSessionStorage | null {
  const roomCode = localStorage.getItem(ACTIVE_ORGANIZER_ROOM_KEY);

  if (!roomCode) {
    return null;
  }

  const session = parseStorageValue<OrganizerSessionStorage>(
    localStorage.getItem(organizerSessionKey(roomCode)),
  );

  if (!session) {
    localStorage.removeItem(ACTIVE_ORGANIZER_ROOM_KEY);
  }

  return session;
}

export function clearActiveOrganizerSession(): void {
  const roomCode = localStorage.getItem(ACTIVE_ORGANIZER_ROOM_KEY);

  if (roomCode) {
    localStorage.removeItem(organizerSessionKey(roomCode));
  }

  localStorage.removeItem(ACTIVE_ORGANIZER_ROOM_KEY);
}
