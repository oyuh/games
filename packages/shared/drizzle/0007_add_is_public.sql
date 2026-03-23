ALTER TABLE "imposter_games" ADD COLUMN "is_public" boolean NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE "password_games" ADD COLUMN "is_public" boolean NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE "chain_reaction_games" ADD COLUMN "is_public" boolean NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE "shade_signal_games" ADD COLUMN "is_public" boolean NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE "location_signal_games" ADD COLUMN "is_public" boolean NOT NULL DEFAULT false;
