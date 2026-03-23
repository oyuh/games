import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  real,
  text,
  uniqueIndex
} from "drizzle-orm/pg-core";

export const gameTypeEnum = pgEnum("game_type", ["imposter", "password", "chain_reaction", "shade_signal", "location_signal"]);
export const imposterPhaseEnum = pgEnum("imposter_phase", ["lobby", "playing", "voting", "results", "finished", "ended"]);
export const passwordPhaseEnum = pgEnum("password_phase", ["lobby", "playing", "results", "ended"]);
export const chainReactionPhaseEnum = pgEnum("chain_reaction_phase", ["lobby", "submitting", "playing", "finished", "ended"]);
export const shadeSignalPhaseEnum = pgEnum("shade_signal_phase", ["lobby", "picking", "clue1", "guess1", "clue2", "guess2", "reveal", "finished", "ended"]);
export const locationSignalPhaseEnum = pgEnum("location_signal_phase", ["lobby", "picking", "clue1", "guess1", "clue2", "guess2", "clue3", "guess3", "clue4", "guess4", "reveal", "finished", "ended"]);

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

export const statusTable = pgTable(
  "status",
  {
    key: text("key").primaryKey(),
    value: text("value").notNull(),
    updatedAt: bigint("updated_at", { mode: "number" }).notNull()
  }
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
    players: jsonb("players").$type<Array<{ sessionId: string; name: string | null; connected: boolean; role?: "imposter" | "player"; eliminated?: boolean }>>().notNull().default([]),
    clues: jsonb("clues").$type<Array<{ sessionId: string; text: string; createdAt: number }>>().notNull().default([]),
    votes: jsonb("votes").$type<Array<{ voterId: string; targetId: string }>>().notNull().default([]),
    spectators: jsonb("spectators").$type<Array<{ sessionId: string; name: string | null }>>().notNull().default([]),
    kicked: jsonb("kicked").$type<string[]>().notNull().default([]),
    roundHistory: jsonb("round_history").$type<Array<{
      round: number;
      secretWord: string | null;
      votedOutId: string | null;
      votedOutName: string | null;
      wasImposter: boolean;
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
      skipVotes?: string[];
    }>().notNull().default({
      rounds: 3,
      imposters: 1,
      currentRound: 1,
      roundDurationSec: 75,
      votingDurationSec: 45,
      phaseEndsAt: null
    }),
    isPublic: boolean("is_public").notNull().default(false),
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
      encryptedWord?: string | null;
      clues: Array<{ sessionId: string; text: string }>;
      guess: string | null;
    }>>().notNull().default([]),
    spectators: jsonb("spectators").$type<Array<{ sessionId: string; name: string | null }>>().notNull().default([]),
    kicked: jsonb("kicked").$type<string[]>().notNull().default([]),
    announcement: jsonb("announcement").$type<{ text: string; ts: number } | null>().default(null),
    settings: jsonb("settings").$type<{ targetScore: number; roundDurationSec: number; roundEndsAt: number | null; teamsLocked?: boolean }>().notNull().default({ targetScore: 10, roundDurationSec: 75, roundEndsAt: null }),
    isPublic: boolean("is_public").notNull().default(false),
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
    channel: text("channel").notNull().default("all"),
    text: text("text").notNull(),
    createdAt: bigint("created_at", { mode: "number" }).notNull()
  },
  (table) => ({
    gameLookupIdx: index("chat_messages_game_lookup_idx").on(table.gameType, table.gameId)
  })
);

export const chainReactionGames = pgTable(
  "chain_reaction_games",
  {
    id: text("id").primaryKey(),
    code: text("code").notNull(),
    hostId: text("host_id").notNull(),
    phase: chainReactionPhaseEnum("phase").notNull().default("lobby"),
    players: jsonb("players").$type<Array<{ sessionId: string; name: string | null; connected: boolean }>>().notNull().default([]),
    chain: jsonb("chain").$type<Record<string, Array<{ word: string; revealed: boolean; lettersShown: number; solvedBy?: string | null }>>>().notNull().default({}),
    submittedChains: jsonb("submitted_chains").$type<Record<string, string[]>>().notNull().default({}),
    currentTurn: text("current_turn"),
    scores: jsonb("scores").$type<Record<string, number>>().notNull().default({}),
    roundHistory: jsonb("round_history").$type<Array<{
      round: number;
      chains: Record<string, Array<{ word: string; solvedBy: string | null; lettersShown: number }>>;
      scores: Record<string, number>;
    }>>().notNull().default([]),
    spectators: jsonb("spectators").$type<Array<{ sessionId: string; name: string | null }>>().notNull().default([]),
    kicked: jsonb("kicked").$type<string[]>().notNull().default([]),
    announcement: jsonb("announcement").$type<{ text: string; ts: number } | null>().default(null),
    settings: jsonb("settings").$type<{
      chainLength: number;
      rounds: number;
      currentRound: number;
      turnTimeSec: number | null;
      phaseEndsAt: number | null;
      chainMode: "premade" | "custom";
    }>().notNull().default({
      chainLength: 5,
      rounds: 3,
      currentRound: 1,
      turnTimeSec: null,
      phaseEndsAt: null,
      chainMode: "premade"
    }),
    isPublic: boolean("is_public").notNull().default(false),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
    updatedAt: bigint("updated_at", { mode: "number" }).notNull()
  },
  (table) => ({
    codeUnique: uniqueIndex("chain_reaction_code_unique").on(table.code)
  })
);

export const shadeSignalGames = pgTable(
  "shade_signal_games",
  {
    id: text("id").primaryKey(),
    code: text("code").notNull(),
    hostId: text("host_id").notNull(),
    phase: shadeSignalPhaseEnum("phase").notNull().default("lobby"),
    players: jsonb("players").$type<Array<{ sessionId: string; name: string | null; connected: boolean; totalScore: number }>>().notNull().default([]),
    leaderId: text("leader_id"),
    leaderOrder: jsonb("leader_order").$type<string[]>().notNull().default([]),
    currentLeaderIndex: integer("current_leader_index").notNull().default(0),
    gridSeed: integer("grid_seed").notNull().default(0),
    gridRows: integer("grid_rows").notNull().default(10),
    gridCols: integer("grid_cols").notNull().default(12),
    targetRow: integer("target_row"),
    targetCol: integer("target_col"),
    encryptedTarget: text("encrypted_target"),
    clue1: text("clue1"),
    clue2: text("clue2"),
    guesses: jsonb("guesses").$type<Array<{ sessionId: string; round: 1 | 2; row: number; col: number }>>().notNull().default([]),
    roundHistory: jsonb("round_history").$type<Array<{
      round: number;
      leaderId: string;
      target: { row: number; col: number };
      clue1: string | null;
      clue2: string | null;
      guesses: Array<{ sessionId: string; round: 1 | 2; row: number; col: number }>;
      scores: Record<string, number>;
      leaderScore: number;
    }>>().notNull().default([]),
    spectators: jsonb("spectators").$type<Array<{ sessionId: string; name: string | null }>>().notNull().default([]),
    kicked: jsonb("kicked").$type<string[]>().notNull().default([]),
    announcement: jsonb("announcement").$type<{ text: string; ts: number } | null>().default(null),
    settings: jsonb("settings").$type<{
      hardMode: boolean;
      leaderPick?: boolean;
      clueDurationSec: number;
      guessDurationSec: number;
      roundsPerPlayer: number;
      currentRound: number;
      phaseEndsAt: number | null;
    }>().notNull().default({
      hardMode: false,
      clueDurationSec: 45,
      guessDurationSec: 30,
      roundsPerPlayer: 1,
      currentRound: 1,
      phaseEndsAt: null
    }),
    isPublic: boolean("is_public").notNull().default(false),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
    updatedAt: bigint("updated_at", { mode: "number" }).notNull()
  },
  (table) => ({
    codeUnique: uniqueIndex("shade_signal_code_unique").on(table.code)
  })
);

export const locationSignalGames = pgTable(
  "location_signal_games",
  {
    id: text("id").primaryKey(),
    code: text("code").notNull(),
    hostId: text("host_id").notNull(),
    phase: locationSignalPhaseEnum("phase").notNull().default("lobby"),
    players: jsonb("players").$type<Array<{ sessionId: string; name: string | null; connected: boolean; totalScore: number }>>().notNull().default([]),
    leaderId: text("leader_id"),
    leaderOrder: jsonb("leader_order").$type<string[]>().notNull().default([]),
    currentLeaderIndex: integer("current_leader_index").notNull().default(0),
    targetLat: real("target_lat"),
    targetLng: real("target_lng"),
    encryptedTarget: text("encrypted_target"),
    clue1: text("clue1"),
    clue2: text("clue2"),
    clue3: text("clue3"),
    clue4: text("clue4"),
    guesses: jsonb("guesses").$type<Array<{ sessionId: string; round: 1 | 2 | 3 | 4; lat: number; lng: number }>>().notNull().default([]),
    roundHistory: jsonb("round_history").$type<Array<{
      round: number;
      leaderId: string;
      target: { lat: number; lng: number };
      clue1: string | null;
      clue2: string | null;
      clue3: string | null;
      clue4: string | null;
      guesses: Array<{ sessionId: string; round: 1 | 2 | 3 | 4; lat: number; lng: number }>;
      scores: Record<string, number>;
    }>>().notNull().default([]),
    spectators: jsonb("spectators").$type<Array<{ sessionId: string; name: string | null }>>().notNull().default([]),
    kicked: jsonb("kicked").$type<string[]>().notNull().default([]),
    announcement: jsonb("announcement").$type<{ text: string; ts: number } | null>().default(null),
    settings: jsonb("settings").$type<{
      clueDurationSec: number;
      guessDurationSec: number;
      roundsPerPlayer: number;
      currentRound: number;
      phaseEndsAt: number | null;
      cluePairs: number;
    }>().notNull().default({
      clueDurationSec: 45,
      guessDurationSec: 45,
      roundsPerPlayer: 1,
      currentRound: 1,
      phaseEndsAt: null,
      cluePairs: 2
    }),
    isPublic: boolean("is_public").notNull().default(false),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
    updatedAt: bigint("updated_at", { mode: "number" }).notNull()
  },
  (table) => ({
    codeUnique: uniqueIndex("location_signal_code_unique").on(table.code)
  })
);

export const gameEncryptionKeys = pgTable(
  "game_encryption_keys",
  {
    id: text("id").primaryKey(),
    gameId: text("game_id").notNull(),
    gameType: gameTypeEnum("game_type").notNull(),
    encryptionKey: text("encryption_key").notNull(),
    createdAt: bigint("created_at", { mode: "number" }).notNull()
  },
  (table) => ({
    gameLookupUnique: uniqueIndex("game_encryption_keys_game_lookup_unique").on(table.gameType, table.gameId)
  })
);

// ─── Admin tables ───────────────────────────────────────────

export const adminBans = pgTable(
  "admin_bans",
  {
    id: text("id").primaryKey(),
    type: text("type").notNull(), // "session" | "ip" | "region"
    value: text("value").notNull(),
    reason: text("reason").notNull().default(""),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
  },
  (table) => ({
    typeValueIdx: index("admin_bans_type_value_idx").on(table.type, table.value),
  })
);

export const adminRestrictedNames = pgTable(
  "admin_restricted_names",
  {
    id: text("id").primaryKey(),
    pattern: text("pattern").notNull(), // exact match or glob-like pattern
    reason: text("reason").notNull().default(""),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
  }
);

export const adminNameOverrides = pgTable(
  "admin_name_overrides",
  {
    sessionId: text("session_id").primaryKey(),
    forcedName: text("forced_name").notNull(),
    reason: text("reason").notNull().default(""),
    updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
  }
);

export type DrizzleSchema = {
  sessions: typeof sessions;
  statusTable: typeof statusTable;
  imposterGames: typeof imposterGames;
  passwordGames: typeof passwordGames;
  chatMessages: typeof chatMessages;
  chainReactionGames: typeof chainReactionGames;
  shadeSignalGames: typeof shadeSignalGames;
  locationSignalGames: typeof locationSignalGames;
  gameEncryptionKeys: typeof gameEncryptionKeys;
  adminBans: typeof adminBans;
  adminRestrictedNames: typeof adminRestrictedNames;
  adminNameOverrides: typeof adminNameOverrides;
};
