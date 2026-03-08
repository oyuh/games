CREATE TYPE "public"."shade_signal_phase" AS ENUM('lobby', 'clue1', 'guess1', 'clue2', 'guess2', 'reveal', 'finished', 'ended');--> statement-breakpoint
ALTER TYPE "public"."chain_reaction_phase" ADD VALUE 'submitting' BEFORE 'playing';--> statement-breakpoint
ALTER TYPE "public"."game_type" ADD VALUE 'shade_signal';--> statement-breakpoint
CREATE TABLE "shade_signal_games" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"host_id" text NOT NULL,
	"phase" "shade_signal_phase" DEFAULT 'lobby' NOT NULL,
	"players" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"leader_id" text,
	"leader_order" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"current_leader_index" integer DEFAULT 0 NOT NULL,
	"grid_seed" integer DEFAULT 0 NOT NULL,
	"grid_rows" integer DEFAULT 10 NOT NULL,
	"grid_cols" integer DEFAULT 12 NOT NULL,
	"target_row" integer,
	"target_col" integer,
	"clue1" text,
	"clue2" text,
	"guesses" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"round_history" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"kicked" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"announcement" jsonb DEFAULT 'null'::jsonb,
	"settings" jsonb DEFAULT '{"hardMode":false,"clueDurationSec":45,"guessDurationSec":30,"roundsPerPlayer":1,"currentRound":1,"phaseEndsAt":null}'::jsonb NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "status" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
ALTER TABLE "chain_reaction_games" ALTER COLUMN "chain" SET DEFAULT '{}'::jsonb;--> statement-breakpoint
ALTER TABLE "chain_reaction_games" ALTER COLUMN "settings" SET DEFAULT '{"chainLength":5,"rounds":3,"currentRound":1,"turnTimeSec":null,"phaseEndsAt":null,"chainMode":"premade"}'::jsonb;--> statement-breakpoint
ALTER TABLE "chain_reaction_games" ADD COLUMN "submitted_chains" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "shade_signal_code_unique" ON "shade_signal_games" USING btree ("code");