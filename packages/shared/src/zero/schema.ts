import {
  createBuilder,
  createSchema,
  relationships,
  string,
  number,
  json,
  table,
  enumeration
} from "@rocicorp/zero";

const sessions = table("sessions").columns({
  id: string(),
  name: string().optional(),
  game_type: enumeration<"imposter" | "password" | "chain_reaction" | "shade_signal">().optional(),
  game_id: string().optional(),
  created_at: number(),
  last_seen: number()
}).primaryKey("id");

const imposterGames = table("imposter_games").columns({
  id: string(),
  code: string(),
  host_id: string(),
  phase: enumeration<"lobby" | "playing" | "voting" | "results" | "finished" | "ended">(),
  category: string().optional(),
  secret_word: string().optional(),
  players: json<Array<{ sessionId: string; name: string | null; connected: boolean; role?: "imposter" | "player" }>>(),
  clues: json<Array<{ sessionId: string; text: string; createdAt: number }>>(),
  votes: json<Array<{ voterId: string; targetId: string }>>(),
  kicked: json<string[]>(),
  round_history: json<Array<{
    round: number;
    secretWord: string | null;
    imposters: string[];
    caught: boolean;
    clues: Array<{ sessionId: string; text: string }>;
    votes: Array<{ voterId: string; targetId: string }>;
  }>>(),
  announcement: json<{ text: string; ts: number } | null>(),
  settings: json<{
    rounds: number;
    imposters: number;
    currentRound: number;
    roundDurationSec: number;
    votingDurationSec: number;
    phaseEndsAt: number | null;
  }>(),
  created_at: number(),
  updated_at: number()
}).primaryKey("id");

const passwordGames = table("password_games").columns({
  id: string(),
  code: string(),
  host_id: string(),
  phase: enumeration<"lobby" | "playing" | "results" | "ended">(),
  teams: json<Array<{ name: string; members: string[] }>>(),
  rounds: json<Array<{ round: number; teamIndex: number; guesserId: string; word: string; clues: Array<{ sessionId: string; text: string }>; guess: string | null; correct: boolean }>>(),
  scores: json<Record<string, number>>(),
  current_round: number(),
  active_rounds: json<Array<{
    teamIndex: number;
    guesserId: string;
    word: string | null;
    clues: Array<{ sessionId: string; text: string }>;
    guess: string | null;
  }>>(),
  kicked: json<string[]>(),
  announcement: json<{ text: string; ts: number } | null>(),
  settings: json<{ targetScore: number; roundDurationSec: number; roundEndsAt: number | null; teamsLocked?: boolean; skipsRemaining?: Record<string, number>; category?: string }>(),
  created_at: number(),
  updated_at: number()
}).primaryKey("id");

const chatMessages = table("chat_messages").columns({
  id: string(),
  game_type: enumeration<"imposter" | "password" | "chain_reaction" | "shade_signal">(),
  game_id: string(),
  sender_id: string(),
  sender_name: string(),
  badge: string().optional(),
  text: string(),
  created_at: number()
}).primaryKey("id");

const chainReactionGames = table("chain_reaction_games").columns({
  id: string(),
  code: string(),
  host_id: string(),
  phase: enumeration<"lobby" | "submitting" | "playing" | "finished" | "ended">(),
  players: json<Array<{ sessionId: string; name: string | null; connected: boolean }>>(),
  chain: json<Record<string, Array<{ word: string; revealed: boolean; lettersShown: number; solvedBy?: string | null }>>>(),
  submitted_chains: json<Record<string, string[]>>(),
  current_turn: string().optional(),
  scores: json<Record<string, number>>(),
  round_history: json<Array<{
    round: number;
    chains: Record<string, Array<{ word: string; solvedBy: string | null; lettersShown: number }>>;
    scores: Record<string, number>;
  }>>(),
  kicked: json<string[]>(),
  announcement: json<{ text: string; ts: number } | null>(),
  settings: json<{
    chainLength: number;
    rounds: number;
    currentRound: number;
    turnTimeSec: number | null;
    phaseEndsAt: number | null;
    chainMode: "premade" | "custom";
    category?: string;
  }>(),
  created_at: number(),
  updated_at: number()
}).primaryKey("id");

const shadeSignalGames = table("shade_signal_games").columns({
  id: string(),
  code: string(),
  host_id: string(),
  phase: enumeration<"lobby" | "picking" | "clue1" | "guess1" | "clue2" | "guess2" | "reveal" | "finished" | "ended">(),
  players: json<Array<{ sessionId: string; name: string | null; connected: boolean; totalScore: number }>>(),
  leader_id: string().optional(),
  leader_order: json<string[]>(),
  current_leader_index: number(),
  grid_seed: number(),
  grid_rows: number(),
  grid_cols: number(),
  target_row: number().optional(),
  target_col: number().optional(),
  clue1: string().optional(),
  clue2: string().optional(),
  guesses: json<Array<{ sessionId: string; round: 1 | 2; row: number; col: number }>>(),
  round_history: json<Array<{
    round: number;
    leaderId: string;
    target: { row: number; col: number };
    clue1: string | null;
    clue2: string | null;
    guesses: Array<{ sessionId: string; round: 1 | 2; row: number; col: number }>;
    scores: Record<string, number>;
    leaderScore: number;
  }>>(),
  kicked: json<string[]>(),
  announcement: json<{ text: string; ts: number } | null>(),
  settings: json<{
    hardMode: boolean;
    clueDurationSec: number;
    guessDurationSec: number;
    roundsPerPlayer: number;
    currentRound: number;
    phaseEndsAt: number | null;
    leaderPick?: boolean;
  }>(),
  created_at: number(),
  updated_at: number()
}).primaryKey("id");

const sessionRelationships = relationships(sessions, ({ one }) => ({
  imposterGame: one({
    sourceField: ["game_id"],
    destSchema: imposterGames,
    destField: ["id"]
  }),
  passwordGame: one({
    sourceField: ["game_id"],
    destSchema: passwordGames,
    destField: ["id"]
  }),
  chainReactionGame: one({
    sourceField: ["game_id"],
    destSchema: chainReactionGames,
    destField: ["id"]
  }),
  shadeSignalGame: one({
    sourceField: ["game_id"],
    destSchema: shadeSignalGames,
    destField: ["id"]
  })
}));

export const schema = createSchema({
  tables: [sessions, imposterGames, passwordGames, chatMessages, chainReactionGames, shadeSignalGames],
  relationships: [sessionRelationships]
});

export type Schema = typeof schema;
export const zql = createBuilder(schema);

declare module "@rocicorp/zero" {
  interface DefaultTypes {
    schema: Schema;
  }
}
