ALTER TABLE "chain_reaction_games" ADD COLUMN "spectators" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD COLUMN "channel" text DEFAULT 'all' NOT NULL;--> statement-breakpoint
ALTER TABLE "imposter_games" ADD COLUMN "spectators" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "password_games" ADD COLUMN "spectators" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "shade_signal_games" ADD COLUMN "spectators" jsonb DEFAULT '[]'::jsonb NOT NULL;