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
  phase: enumeration<"lobby" | "playing" | "voting" | "results" | "ended">(),
  category: string().optional(),
  secret_word: string().optional(),
  players: json<Array<{ sessionId: string; name: string | null; connected: boolean; role?: "imposter" | "player" }>>(),
  clues: json<Array<{ sessionId: string; text: string; createdAt: number }>>(),
  votes: json<Array<{ voterId: string; targetId: string }>>(),
  kicked: json<string[]>(),
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
  rounds: json<Array<{ round: number; teamIndex: number; clueGiverId: string; guesserId: string; word: string; clue: string; guess: string | null; correct: boolean }>>(),
  scores: json<Record<string, number>>(),
  current_round: number(),
  active_round: json<{
    teamIndex: number;
    clueGiverId: string;
    guesserId: string;
    word: string | null;
    clue: string | null;
    startedAt: number;
    endsAt: number;
  } | null>(),
  kicked: json<string[]>(),
  settings: json<{ targetScore: number; turnTeamIndex: number; roundDurationSec: number; teamsLocked?: boolean }>(),
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
  })
}));

export const schema = createSchema({
  tables: [sessions, imposterGames, passwordGames],
  relationships: [sessionRelationships]
});

export type Schema = typeof schema;
export const zql = createBuilder(schema);

declare module "@rocicorp/zero" {
  interface DefaultTypes {
    schema: Schema;
  }
}
