CREATE TYPE "public"."chain_reaction_phase" AS ENUM('lobby', 'playing', 'finished', 'ended');--> statement-breakpoint
CREATE TYPE "public"."game_type" AS ENUM('imposter', 'password', 'chain_reaction');--> statement-breakpoint
CREATE TYPE "public"."imposter_phase" AS ENUM('lobby', 'playing', 'voting', 'results', 'finished', 'ended');--> statement-breakpoint
CREATE TYPE "public"."password_phase" AS ENUM('lobby', 'playing', 'results', 'ended');--> statement-breakpoint
CREATE TABLE "chain_reaction_games" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"host_id" text NOT NULL,
	"phase" "chain_reaction_phase" DEFAULT 'lobby' NOT NULL,
	"players" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"chain" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"current_turn" text,
	"scores" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"round_history" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"kicked" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"announcement" jsonb DEFAULT 'null'::jsonb,
	"settings" jsonb DEFAULT '{"chainLength":5,"rounds":3,"currentRound":1,"turnTimeSec":null,"phaseEndsAt":null}'::jsonb NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"game_type" "game_type" NOT NULL,
	"game_id" text NOT NULL,
	"sender_id" text NOT NULL,
	"sender_name" text NOT NULL,
	"badge" text,
	"text" text NOT NULL,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "imposter_games" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"host_id" text NOT NULL,
	"phase" "imposter_phase" DEFAULT 'lobby' NOT NULL,
	"category" text,
	"secret_word" text,
	"players" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"clues" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"votes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"kicked" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"round_history" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"announcement" jsonb DEFAULT 'null'::jsonb,
	"settings" jsonb DEFAULT '{"rounds":3,"imposters":1,"currentRound":1,"roundDurationSec":75,"votingDurationSec":45,"phaseEndsAt":null}'::jsonb NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "password_games" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"host_id" text NOT NULL,
	"phase" "password_phase" DEFAULT 'lobby' NOT NULL,
	"teams" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"rounds" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"scores" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"current_round" integer DEFAULT 0 NOT NULL,
	"active_rounds" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"kicked" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"announcement" jsonb DEFAULT 'null'::jsonb,
	"settings" jsonb DEFAULT '{"targetScore":10,"roundDurationSec":75,"roundEndsAt":null}'::jsonb NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text,
	"game_type" "game_type",
	"game_id" text,
	"created_at" bigint NOT NULL,
	"last_seen" bigint NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "chain_reaction_code_unique" ON "chain_reaction_games" USING btree ("code");--> statement-breakpoint
CREATE INDEX "chat_messages_game_lookup_idx" ON "chat_messages" USING btree ("game_type","game_id");--> statement-breakpoint
CREATE UNIQUE INDEX "imposter_code_unique" ON "imposter_games" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "password_code_unique" ON "password_games" USING btree ("code");--> statement-breakpoint
CREATE INDEX "sessions_game_lookup_idx" ON "sessions" USING btree ("game_type","game_id");--> statement-breakpoint
CREATE INDEX "sessions_last_seen_idx" ON "sessions" USING btree ("last_seen");