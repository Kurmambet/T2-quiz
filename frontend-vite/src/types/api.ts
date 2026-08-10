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

export type ParticipantQuestionOption = {
  id: string;
  position: number;
  content: string;
};

export type ParticipantQuestion = {
  id: string;
  position: number;
  content: string;
  time_limit_seconds: number;
  points: number;
  options: ParticipantQuestionOption[];
};

export type CurrentParticipantQuestion = {
  phase: string;
  question_deadline_at: string | null;
  question: ParticipantQuestion;
};
export type ParticipantAnswerSubmitted = {
  id: string;
  quiz_question_id: string;
  selected_option_id: string;
  submitted_at: string;
};
export type CurrentQuestionReveal = {
  question_id: string;
  correct_option_id: string | null;
  correct_option_content: string | null;
  selected_option_id: string | null;
  is_correct: boolean | null;
  points_awarded: number | null;
};

export type LeaderboardEntry = {
  participant_id: string;
  username: string;
  total_points: number;
  answered_questions: number;
};

export type Leaderboard = {
  phase: string;
  entries: LeaderboardEntry[];
};
export type HostQuestionOption = {
  id: string;
  position: number;
  content: string;
  is_correct: boolean | null;
};

export type HostQuestion = {
  id: string;
  position: number;
  content: string;
  time_limit_seconds: number;
  points: number;
  options: HostQuestionOption[];
};

export type CurrentHostQuestion = {
  phase: string;
  question_deadline_at: string | null;
  question: HostQuestion;
};
