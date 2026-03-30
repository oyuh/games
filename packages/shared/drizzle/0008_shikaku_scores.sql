CREATE TABLE IF NOT EXISTS "shikaku_scores" (
  "id" text PRIMARY KEY NOT NULL,
  "session_id" text NOT NULL,
  "name" text NOT NULL,
  "seed" integer NOT NULL,
  "difficulty" text NOT NULL,
  "score" integer NOT NULL,
  "time_ms" integer NOT NULL,
  "puzzle_count" integer NOT NULL DEFAULT 5,
  "replay_data" jsonb,
  "created_at" bigint NOT NULL
);

CREATE INDEX IF NOT EXISTS "shikaku_scores_difficulty_score_idx" ON "shikaku_scores" ("difficulty", "score" DESC);
CREATE INDEX IF NOT EXISTS "shikaku_scores_session_idx" ON "shikaku_scores" ("session_id");
