export type GameType = "imposter" | "password";

export type ImposterPhase = "lobby" | "playing" | "voting" | "results";
export type PasswordPhase = "lobby" | "playing" | "results";

export type SessionRecord = {
  id: string;
  name: string | null;
  gameType: GameType | null;
  gameId: string | null;
  createdAt: number;
  lastSeen: number;
};

export type PlayerState = {
  sessionId: string;
  name: string | null;
  connected: boolean;
};
