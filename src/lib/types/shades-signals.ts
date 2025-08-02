// Shared type definitions for Shades & Signals Game
export interface ShadesSignalsPlayer {
  id: string;
  name: string;
  score: number;
  isHost: boolean;
  isConnected: boolean;
  lastHeartbeat?: number;
}

export interface ShadesSignalsClue {
  id: string;
  clueGiverId: string;
  clueText: string;
  timestamp: number;
  roundNumber: number;
}

export interface ShadesSignalsGuess {
  id: string;
  playerId: string;
  guessedHex: string;
  isCorrect: boolean;
  timestamp: number;
  roundNumber: number;
  distanceFromTarget?: number;
}

export interface ShadesSignalsRound {
  roundNumber: number;
  clueGiverId: string;
  targetHex: string;
  targetColor: string;
  clues: ShadesSignalsClue[];
  guesses: ShadesSignalsGuess[];
  winnerId?: string | null;
  startTime: number;
  endTime?: number;
  status: "waiting" | "active" | "completed";
  maxClues: number;
  timeLimit?: number; // in seconds
}

export interface ShadesSignalsGameData {
  players: ShadesSignalsPlayer[];
  gameStarted: boolean;
  currentPhase: "waiting" | "active" | "roundEnd" | "finished";
  maxPlayers: number;
  totalRounds: number;
  currentRound: number;
  rounds: ShadesSignalsRound[];
  playerScores: Record<string, number>;
  settings: {
    maxPlayersPerGame: number;
    roundTimeLimit: number; // in seconds
    maxCluesPerRound: number;
    pointsForCorrectGuess: number;
    pointsForClueGiver: number;
  };
  heartbeats?: Record<string, number>;
  disconnectionVotes?: Record<string, {
    votes: string[];
    startTime: number;
    targetPlayer: string;
  }>;
  playerLeft?: { id: string };
  roundStartDelay?: number; // Delay before starting next round
}

export interface ShadesSignalsGame {
  id: string;
  code: string;
  host_id: string;
  player_ids: string[];
  playerNames?: Record<string, string>;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  expires_at: string;
  game_data?: ShadesSignalsGameData;
}

export interface HexCoordinate {
  id: string; // e.g., "A1", "B5"
  color: string;
  row: string; // A-L
  col: number; // 1-24
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
  message?: string;
}

export interface GameSettings {
  maxPlayersPerGame: number;
  roundTimeLimit: number;
  maxCluesPerRound: number;
  pointsForCorrectGuess: number;
  pointsForClueGiver: number;
}

export const DEFAULT_GAME_SETTINGS: GameSettings = {
  maxPlayersPerGame: 8,
  roundTimeLimit: 300, // 5 minutes
  maxCluesPerRound: 5,
  pointsForCorrectGuess: 10,
  pointsForClueGiver: 5,
};

// Utility functions for hex coordinates
export function parseHexId(hexId: string): { row: string; col: number } | null {
  const regex = /^([A-L])(\d+)$/;
  const match = regex.exec(hexId);
  if (!match?.[1] || !match?.[2]) return null;
  return {
    row: match[1],
    col: parseInt(match[2], 10)
  };
}

export function isValidHexId(hexId: string): boolean {
  const parsed = parseHexId(hexId);
  if (!parsed) return false;
  return parsed.col >= 1 && parsed.col <= 24;
}

export function calculateHexDistance(hex1: string, hex2: string): number {
  const parsed1 = parseHexId(hex1);
  const parsed2 = parseHexId(hex2);

  if (!parsed1 || !parsed2) return Infinity;

  // Simple distance calculation (can be improved for hex grid)
  const rowDiff = Math.abs(parsed1.row.charCodeAt(0) - parsed2.row.charCodeAt(0));
  const colDiff = Math.abs(parsed1.col - parsed2.col);

  return Math.sqrt(rowDiff * rowDiff + colDiff * colDiff);
}

// API Response Types
export interface ShadesSignalsCreateResponse {
  success: boolean;
  gameId?: string;
  gameCode?: string;
  error?: string;
}

export interface ShadesSignalsJoinResponse {
  success: boolean;
  gameData?: ShadesSignalsGameData;
  error?: string;
}

export interface ShadesSignalsHeartbeatResponse {
  success: boolean;
  gameData?: ShadesSignalsGameData;
  error?: string;
}

export interface ShadesSignalsActionResponse {
  success: boolean;
  gameData?: ShadesSignalsGameData;
  error?: string;
}
