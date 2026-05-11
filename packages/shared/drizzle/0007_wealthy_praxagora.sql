CREATE TYPE "public"."location_signal_phase" AS ENUM('lobby', 'picking', 'clue1', 'guess1', 'clue2', 'guess2', 'clue3', 'guess3', 'clue4', 'guess4', 'reveal', 'finished', 'ended');--> statement-breakpoint
ALTER TYPE "public"."game_type" ADD VALUE 'location_signal';--> statement-breakpoint
CREATE TABLE "game_encryption_keys" (
	"id" text PRIMARY KEY NOT NULL,
	"game_id" text NOT NULL,
	"game_type" "game_type" NOT NULL,
	"encryption_key" text NOT NULL,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "location_signal_games" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"host_id" text NOT NULL,
	"phase" "location_signal_phase" DEFAULT 'lobby' NOT NULL,
	"players" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"leader_id" text,
	"leader_order" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"current_leader_index" integer DEFAULT 0 NOT NULL,
	"target_lat" real,
	"target_lng" real,
	"encrypted_target" text,
	"clue1" text,
	"clue2" text,
	"clue3" text,
	"clue4" text,
	"guesses" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"round_history" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"spectators" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"kicked" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"announcement" jsonb DEFAULT 'null'::jsonb,
	"settings" jsonb DEFAULT '{"clueDurationSec":45,"guessDurationSec":45,"roundsPerPlayer":1,"currentRound":1,"phaseEndsAt":null,"cluePairs":2}'::jsonb NOT NULL,
	"is_public" boolean DEFAULT false NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pips_banned_sessions" (
	"session_id" text PRIMARY KEY NOT NULL,
	"reason" text NOT NULL,
	"violations" integer DEFAULT 1 NOT NULL,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pips_scores" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"name" text NOT NULL,
	"seed" integer NOT NULL,
	"total_ms" integer NOT NULL,
	"easy_ms" integer NOT NULL,
	"medium_ms" integer NOT NULL,
	"hard_ms" integer NOT NULL,
	"puzzle_count" integer DEFAULT 3 NOT NULL,
	"replay_data" jsonb,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shikaku_banned_sessions" (
	"session_id" text PRIMARY KEY NOT NULL,
	"reason" text NOT NULL,
	"violations" integer DEFAULT 1 NOT NULL,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shikaku_scores" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"name" text NOT NULL,
	"seed" integer NOT NULL,
	"difficulty" text NOT NULL,
	"score" integer NOT NULL,
	"time_ms" integer NOT NULL,
	"puzzle_count" integer DEFAULT 5 NOT NULL,
	"replay_data" jsonb,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
ALTER TABLE "chain_reaction_games" ADD COLUMN "is_public" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "imposter_games" ADD COLUMN "is_public" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "password_games" ADD COLUMN "is_public" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "ip" text;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "user_agent" text;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "region" text;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "fingerprint" text;--> statement-breakpoint
ALTER TABLE "shade_signal_games" ADD COLUMN "encrypted_target" text;--> statement-breakpoint
ALTER TABLE "shade_signal_games" ADD COLUMN "is_public" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "game_encryption_keys_game_lookup_unique" ON "game_encryption_keys" USING btree ("game_type","game_id");--> statement-breakpoint
CREATE UNIQUE INDEX "location_signal_code_unique" ON "location_signal_games" USING btree ("code");--> statement-breakpoint
CREATE INDEX "pips_scores_total_time_idx" ON "pips_scores" USING btree ("total_ms");--> statement-breakpoint
CREATE INDEX "pips_scores_session_idx" ON "pips_scores" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "pips_scores_session_seed_idx" ON "pips_scores" USING btree ("session_id","seed");--> statement-breakpoint
CREATE INDEX "shikaku_scores_difficulty_score_idx" ON "shikaku_scores" USING btree ("difficulty");--> statement-breakpoint
CREATE INDEX "shikaku_scores_session_idx" ON "shikaku_scores" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "shikaku_scores_session_seed_idx" ON "shikaku_scores" USING btree ("session_id","seed");