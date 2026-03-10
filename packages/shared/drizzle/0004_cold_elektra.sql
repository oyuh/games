CREATE TABLE "admin_bans" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"value" text NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_name_overrides" (
	"session_id" text PRIMARY KEY NOT NULL,
	"forced_name" text NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_restricted_names" (
	"id" text PRIMARY KEY NOT NULL,
	"pattern" text NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE INDEX "admin_bans_type_value_idx" ON "admin_bans" USING btree ("type","value");