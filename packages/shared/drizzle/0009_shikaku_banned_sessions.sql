CREATE TABLE IF NOT EXISTS "shikaku_banned_sessions" (
  "session_id" text PRIMARY KEY NOT NULL,
  "reason" text NOT NULL,
  "violations" integer NOT NULL DEFAULT 1,
  "created_at" bigint NOT NULL
);
