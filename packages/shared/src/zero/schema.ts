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
  game_type: enumeration<"imposter" | "password">().optional(),
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
  rounds: json<Array<{ round: number; teamIndex: number; wordPickerId: string; guesserId: string; word: string; clues: Array<{ sessionId: string; text: string }>; guess: string | null; correct: boolean }>>(),
  scores: json<Record<string, number>>(),
  current_round: number(),
  active_rounds: json<Array<{
    teamIndex: number;
    wordPickerId: string;
    guesserId: string;
    word: string | null;
    clues: Array<{ sessionId: string; text: string }>;
    guess: string | null;
  }>>(),
  kicked: json<string[]>(),
  announcement: json<{ text: string; ts: number } | null>(),
  settings: json<{ targetScore: number; roundDurationSec: number; roundEndsAt: number | null; teamsLocked?: boolean }>(),
  created_at: number(),
  updated_at: number()
}).primaryKey("id");

const chatMessages = table("chat_messages").columns({
  id: string(),
  game_type: enumeration<"imposter" | "password">(),
  game_id: string(),
  sender_id: string(),
  sender_name: string(),
  badge: string().optional(),
  text: string(),
  created_at: number()
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
  })
}));

export const schema = createSchema({
  tables: [sessions, imposterGames, passwordGames, chatMessages],
  relationships: [sessionRelationships]
});

export type Schema = typeof schema;
export const zql = createBuilder(schema);

declare module "@rocicorp/zero" {
  interface DefaultTypes {
    schema: Schema;
  }
}
