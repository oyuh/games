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
export const imposterPhaseEnum = pgEnum("imposter_phase", ["lobby", "playing", "voting", "results", "finished", "ended"]);
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
    roundHistory: jsonb("round_history").$type<Array<{
      round: number;
      secretWord: string | null;
      imposters: string[];
      caught: boolean;
      clues: Array<{ sessionId: string; text: string }>;
      votes: Array<{ voterId: string; targetId: string }>;
    }>>().notNull().default([]),
    announcement: jsonb("announcement").$type<{ text: string; ts: number } | null>().default(null),
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
    rounds: jsonb("rounds").$type<Array<{ round: number; teamIndex: number; guesserId: string; word: string; clues: Array<{ sessionId: string; text: string }>; guess: string | null; correct: boolean }>>().notNull().default([]),
    scores: jsonb("scores").$type<Record<string, number>>().notNull().default({}),
    currentRound: integer("current_round").notNull().default(0),
    activeRounds: jsonb("active_rounds").$type<Array<{
      teamIndex: number;
      guesserId: string;
      word: string | null;
      clues: Array<{ sessionId: string; text: string }>;
      guess: string | null;
    }>>().notNull().default([]),
    kicked: jsonb("kicked").$type<string[]>().notNull().default([]),
    announcement: jsonb("announcement").$type<{ text: string; ts: number } | null>().default(null),
    settings: jsonb("settings").$type<{ targetScore: number; roundDurationSec: number; roundEndsAt: number | null; teamsLocked?: boolean }>().notNull().default({ targetScore: 10, roundDurationSec: 75, roundEndsAt: null }),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
    updatedAt: bigint("updated_at", { mode: "number" }).notNull()
  },
  (table) => ({
    codeUnique: uniqueIndex("password_code_unique").on(table.code)
  })
);

export const chatMessages = pgTable(
  "chat_messages",
  {
    id: text("id").primaryKey(),
    gameType: gameTypeEnum("game_type").notNull(),
    gameId: text("game_id").notNull(),
    senderId: text("sender_id").notNull(),
    senderName: text("sender_name").notNull(),
    badge: text("badge"),
    text: text("text").notNull(),
    createdAt: bigint("created_at", { mode: "number" }).notNull()
  },
  (table) => ({
    gameLookupIdx: index("chat_messages_game_lookup_idx").on(table.gameType, table.gameId)
  })
);

export type DrizzleSchema = {
  sessions: typeof sessions;
  imposterGames: typeof imposterGames;
  passwordGames: typeof passwordGames;
  chatMessages: typeof chatMessages;
};
