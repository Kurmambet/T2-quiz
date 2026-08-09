export type Room = {
  id: string;
  code: string;
  title: string;
  status: string;
  created_at: string;
  updated_at: string;
};

export type RoomCreated = Room & {
  organizer_token: string;
};

export type Participant = {
  id: string;
  room_id: string;
  username: string;
  joined_at: string;
};

export type ParticipantJoined = Participant & {
  participant_token: string;
};

export type ParticipantSession = {
  room: Room;
  participant: Participant;
};

export type RoomLobby = {
  room: Room;
  participants: Participant[];
};

export type QuizTemplate = {
  id: string;
  title: string;
  description: string | null;
  is_published: boolean;
  created_at: string;
  questions_count: number;
};

export type GameSession = {
  id: string;
  room_id: string;
  game_type: string;
  quiz_template_id: string | null;
  settings: Record<string, unknown>;
  state: Record<string, unknown>;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
};
