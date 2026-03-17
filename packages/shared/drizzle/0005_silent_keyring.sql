CREATE TABLE "game_encryption_keys" (
	"id" text PRIMARY KEY NOT NULL,
	"game_id" text NOT NULL,
	"game_type" "game_type" NOT NULL,
	"encryption_key" text NOT NULL,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "game_encryption_keys_game_lookup_unique" ON "game_encryption_keys" USING btree ("game_type","game_id");
