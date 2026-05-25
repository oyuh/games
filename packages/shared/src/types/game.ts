export type GameType = "imposter" | "password" | "chain_reaction" | "shade_signal" | "location_signal";

export const DEFAULT_IMPOSTER_CLUE_VISIBILITY = 0.65;
export const IMPOSTER_CLUE_VISIBILITY_OPTIONS = [0, 0.25, 0.5, DEFAULT_IMPOSTER_CLUE_VISIBILITY, 1] as const;

export type ImposterPhase = "lobby" | "playing" | "voting" | "results";
export type PasswordPhase = "lobby" | "playing" | "results";
export type ChainReactionPhase = "lobby" | "submitting" | "playing" | "finished" | "ended";
export type ShadeSignalPhase = "lobby" | "clue1" | "guess1" | "clue2" | "guess2" | "reveal" | "finished" | "ended";
export type LocationSignalPhase = "lobby" | "picking" | "clue1" | "guess1" | "clue2" | "guess2" | "clue3" | "guess3" | "clue4" | "guess4" | "reveal" | "finished" | "ended";

export type SessionRecord = {
  id: string;
  name: string | null;
  game_type: GameType | null;
  game_id: string | null;
  created_at: number;
  last_seen: number;
};

export type PlayerState = {
  sessionId: string;
  name: string | null;
  connected: boolean;
};
