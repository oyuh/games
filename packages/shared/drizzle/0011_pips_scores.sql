CREATE TABLE IF NOT EXISTS "pips_scores" (
  "id" text PRIMARY KEY NOT NULL,
  "session_id" text NOT NULL,
  "name" text NOT NULL,
  "seed" integer NOT NULL,
  "total_ms" integer NOT NULL,
  "easy_ms" integer NOT NULL,
  "medium_ms" integer NOT NULL,
  "hard_ms" integer NOT NULL,
  "puzzle_count" integer NOT NULL DEFAULT 3,
  "replay_data" jsonb,
  "created_at" bigint NOT NULL
);

CREATE INDEX IF NOT EXISTS "pips_scores_total_time_idx" ON "pips_scores" ("total_ms");
CREATE INDEX IF NOT EXISTS "pips_scores_session_idx" ON "pips_scores" ("session_id");
CREATE INDEX IF NOT EXISTS "pips_scores_session_seed_idx" ON "pips_scores" ("session_id", "seed");

CREATE TABLE IF NOT EXISTS "pips_banned_sessions" (
  "session_id" text PRIMARY KEY NOT NULL,
  "reason" text NOT NULL,
  "violations" integer NOT NULL DEFAULT 1,
  "created_at" bigint NOT NULL
);

-- INSERT INTO "pips_scores" ("id", "session_id", "name", "seed", "total_ms", "easy_ms", "medium_ms", "hard_ms", "puzzle_count", "created_at")
-- VALUES
--   ('seeded-pips-1', 'seeded-pips-1', 'Tile Witch', 216336, 111500, 18400, 34200, 58900, 3, 1778400000000),
--   ('seeded-pips-2', 'seeded-pips-2', 'Lawson', 963317, 120300, 21100, 37400, 61800, 3, 1778400060000),
--   ('seeded-pips-3', 'seeded-pips-3', 'Dot Matrix', 482019, 125900, 19900, 41700, 64300, 3, 1778400120000),
--   ('seeded-pips-4', 'seeded-pips-4', 'June Bug', 734221, 134000, 24500, 40800, 68700, 3, 1778400180000),
--   ('seeded-pips-5', 'seeded-pips-5', 'Pip Squeak', 119804, 140000, 23700, 45100, 71200, 3, 1778400240000),
--   ('seeded-pips-6', 'seeded-pips-6', 'Mango', 681452, 152900, 29600, 46900, 76400, 3, 1778400300000),
--   ('seeded-pips-7', 'seeded-pips-7', 'Seven Seven', 337710, 161000, 27300, 52500, 81200, 3, 1778400360000),
--   ('seeded-pips-8', 'seeded-pips-8', 'Soft Lock', 592188, 175300, 31800, 54900, 88600, 3, 1778400420000),
--   ('seeded-pips-9', 'seeded-pips-9', 'Gridline', 808246, 190900, 36400, 59200, 95300, 3, 1778400480000),
--   ('seeded-pips-10', 'seeded-pips-10', 'Orange Peel', 410762, 206300, 39700, 64100, 102500, 3, 1778400540000),
--   ('seeded-pips-11', 'seeded-pips-11', 'Half Step', 775930, 228600, 42300, 70600, 115700, 3, 1778400600000),
--   ('seeded-pips-12', 'seeded-pips-12', 'Corner Case', 152644, 251500, 48900, 76500, 126100, 3, 1778400660000)
-- ON CONFLICT ("id") DO NOTHING;
