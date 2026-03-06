import {
  bigint,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  uniqueIndex
} from "drizzle-orm/pg-core";

export const gameTypeEnum = pgEnum("game_type", ["imposter", "password"]);
export const imposterPhaseEnum = pgEnum("imposter_phase", ["lobby", "playing", "voting", "results", "ended"]);
export const passwordPhaseEnum = pgEnum("password_phase", ["lobby", "playing", "results", "ended"]);

export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    name: text("name"),
    gameType: gameTypeEnum("game_type"),
    gameId: text("game_id"),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
    lastSeen: bigint("last_seen", { mode: "number" }).notNull()
  },
  (table) => ({
    gameLookupIdx: index("sessions_game_lookup_idx").on(table.gameType, table.gameId),
    lastSeenIdx: index("sessions_last_seen_idx").on(table.lastSeen)
  })
);

export const imposterGames = pgTable(
  "imposter_games",
  {
    id: text("id").primaryKey(),
    code: text("code").notNull(),
    hostId: text("host_id").notNull(),
    phase: imposterPhaseEnum("phase").notNull().default("lobby"),
    category: text("category"),
    secretWord: text("secret_word"),
    players: jsonb("players").$type<Array<{ sessionId: string; name: string | null; connected: boolean; role?: "imposter" | "player" }>>().notNull().default([]),
    clues: jsonb("clues").$type<Array<{ sessionId: string; text: string; createdAt: number }>>().notNull().default([]),
    votes: jsonb("votes").$type<Array<{ voterId: string; targetId: string }>>().notNull().default([]),
    kicked: jsonb("kicked").$type<string[]>().notNull().default([]),
    settings: jsonb("settings").$type<{
      rounds: number;
      imposters: number;
      currentRound: number;
      roundDurationSec: number;
      votingDurationSec: number;
      phaseEndsAt: number | null;
    }>().notNull().default({
      rounds: 3,
      imposters: 1,
      currentRound: 1,
      roundDurationSec: 75,
      votingDurationSec: 45,
      phaseEndsAt: null
    }),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
    updatedAt: bigint("updated_at", { mode: "number" }).notNull()
  },
  (table) => ({
    codeUnique: uniqueIndex("imposter_code_unique").on(table.code)
  })
);

export const passwordGames = pgTable(
  "password_games",
  {
    id: text("id").primaryKey(),
    code: text("code").notNull(),
    hostId: text("host_id").notNull(),
    phase: passwordPhaseEnum("phase").notNull().default("lobby"),
    teams: jsonb("teams").$type<Array<{ name: string; members: string[] }>>().notNull().default([]),
    rounds: jsonb("rounds").$type<Array<{ round: number; teamIndex: number; clueGiverId: string; guesserId: string; word: string; clue: string; guess: string | null; correct: boolean }>>().notNull().default([]),
    scores: jsonb("scores").$type<Record<string, number>>().notNull().default({}),
    currentRound: integer("current_round").notNull().default(0),
    activeRound: jsonb("active_round").$type<{
      teamIndex: number;
      clueGiverId: string;
      guesserId: string;
      word: string | null;
      clue: string | null;
      startedAt: number;
      endsAt: number;
    } | null>().default(null),
    kicked: jsonb("kicked").$type<string[]>().notNull().default([]),
    settings: jsonb("settings").$type<{ targetScore: number; turnTeamIndex: number; roundDurationSec: number; teamsLocked?: boolean }>().notNull().default({ targetScore: 10, turnTeamIndex: 0, roundDurationSec: 75 }),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
    updatedAt: bigint("updated_at", { mode: "number" }).notNull()
  },
  (table) => ({
    codeUnique: uniqueIndex("password_code_unique").on(table.code)
  })
);

export type DrizzleSchema = {
  sessions: typeof sessions;
  imposterGames: typeof imposterGames;
  passwordGames: typeof passwordGames;
};
