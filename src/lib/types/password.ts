// Shared type definitions for Password Game
export interface PasswordGameData {
  round: number;
  phase: "category-selection" | "word-selection" | "clue-giving" | "guessing" | "round-results";
  teamPhases: Record<string, string>;
  categoryVotes: Record<string, string>;
  currentCategory: string | null;
  selectedWords: Record<string, string>;
  teamRoles: Record<string, { clueGiver: string; guesser: string }>;
  clues: Record<string, string[]>;
  guesses: Record<string, string[]>;
  currentTeam: string | null;
  scores: Record<string, number>;
  roundHistory: RoundHistoryEntry[];
  round_data?: Record<string, {
    category: string | null;
    word: string | null;
    guesser: string | null;
    clueGiver: string | null;
  }>;
  roundGuessCount?: Record<string, number>;
  roundSummary?: Record<number, { winningTeams: string[] }>;
  teamScores?: Record<string, number>;
  winningTeams?: string[];
  pointsToWin?: number;
  finished_at?: string;
  heartbeats?: Record<string, number>;
  disconnectionVotes?: Record<string, {
    votes: string[];
    startTime: number;
    targetPlayer: string;
  }>;
  playerLeft?: { id: string };
}

export interface PasswordRoundData {
  perTeam: Record<string, {
    category: string | null;
    word: string | null;
    guesser: string | null;
    clueGiver: string | null;
  }>;
  currentRound?: number;
  phase?: string;
  history?: RoundHistoryEntry[];
  teamScores?: Record<string, number>;
  votedCategories?: Record<string, string>;
  turnOrder?: string[];
  clues?: string[];
  guesses?: string[];
  roundWinner?: string;
  gameWinner?: string;
}

export interface RoundHistoryEntry {
  round: number;
  roundGuessCount: Record<string, number>;
  roundSummary: { winningTeams: string[] } | null;
  teamScores: Record<string, number>;
}

export interface PasswordGame {
  id: string;
  code: string;
  host_id: string;
  teams: {
    noTeam: string[];
    [key: string]: string[];
  };
  playerNames?: Record<string, string>;
  started_at: string | null;
  finished_at: string | null;
  game_data?: PasswordGameData;
  round_data?: PasswordRoundData;
}

export interface HeartbeatResponse {
  success: boolean;
  activePlayerIds: string[];
  disconnectedPlayers: string[];
  heartbeatReceived: boolean;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  game?: T;
  error?: string;
  details?: string;
}
