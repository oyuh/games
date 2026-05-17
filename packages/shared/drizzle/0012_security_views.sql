CREATE OR REPLACE VIEW "imposter_public_games" AS
SELECT
  "id",
  "code",
  "host_id",
  "phase",
  "category",
  CASE
    WHEN "phase" IN ('results', 'finished', 'ended') THEN "secret_word"
    WHEN "secret_word" LIKE 'enc:%' THEN "secret_word"
    ELSE NULL
  END AS "secret_word",
  CASE
    WHEN "phase" IN ('results', 'finished', 'ended') THEN "players"
    ELSE (
      SELECT COALESCE(jsonb_agg("player" - 'role'), '[]'::jsonb)
      FROM jsonb_array_elements("players") AS "player"
    )
  END AS "players",
  "clues",
  "votes",
  "spectators",
  "kicked",
  CASE
    WHEN "phase" IN ('results', 'finished', 'ended') THEN "round_history"
    ELSE (
      SELECT COALESCE(
        jsonb_agg(jsonb_set("round_entry", '{secretWord}', 'null'::jsonb, true)),
        '[]'::jsonb
      )
      FROM jsonb_array_elements("round_history") AS "round_entry"
    )
  END AS "round_history",
  "announcement",
  "settings",
  "is_public",
  "created_at",
  "updated_at"
FROM "imposter_games";

CREATE OR REPLACE VIEW "imposter_public_game_summaries" AS
SELECT
  "id",
  "code",
  "phase",
  (
    SELECT "player" ->> 'name'
    FROM jsonb_array_elements("players") AS "player"
    WHERE "player" ->> 'sessionId' = "host_id"
    LIMIT 1
  ) AS "host_name",
  jsonb_array_length("players")::int AS "player_count",
  jsonb_array_length("spectators")::int AS "spectator_count",
  "created_at"
FROM "imposter_games"
WHERE "is_public" = true AND "phase" <> 'ended';

CREATE OR REPLACE VIEW "password_public_game_summaries" AS
SELECT
  "id",
  "code",
  "phase",
  NULL::text AS "host_name",
  COALESCE((
    SELECT SUM(jsonb_array_length("team" -> 'members'))
    FROM jsonb_array_elements("teams") AS "team"
  ), 0)::int AS "player_count",
  jsonb_array_length("spectators")::int AS "spectator_count",
  "created_at"
FROM "password_games"
WHERE "is_public" = true AND "phase" <> 'ended';

CREATE OR REPLACE VIEW "chain_reaction_public_game_summaries" AS
SELECT
  "id",
  "code",
  "phase",
  (
    SELECT "player" ->> 'name'
    FROM jsonb_array_elements("players") AS "player"
    WHERE "player" ->> 'sessionId' = "host_id"
    LIMIT 1
  ) AS "host_name",
  jsonb_array_length("players")::int AS "player_count",
  jsonb_array_length("spectators")::int AS "spectator_count",
  "created_at"
FROM "chain_reaction_games"
WHERE "is_public" = true AND "phase" NOT IN ('ended', 'finished');

CREATE OR REPLACE VIEW "shade_signal_public_game_summaries" AS
SELECT
  "id",
  "code",
  "phase",
  (
    SELECT "player" ->> 'name'
    FROM jsonb_array_elements("players") AS "player"
    WHERE "player" ->> 'sessionId' = "host_id"
    LIMIT 1
  ) AS "host_name",
  jsonb_array_length("players")::int AS "player_count",
  jsonb_array_length("spectators")::int AS "spectator_count",
  "created_at"
FROM "shade_signal_games"
WHERE "is_public" = true AND "phase" <> 'ended';

CREATE OR REPLACE VIEW "location_signal_public_game_summaries" AS
SELECT
  "id",
  "code",
  "phase",
  (
    SELECT "player" ->> 'name'
    FROM jsonb_array_elements("players") AS "player"
    WHERE "player" ->> 'sessionId' = "host_id"
    LIMIT 1
  ) AS "host_name",
  jsonb_array_length("players")::int AS "player_count",
  jsonb_array_length("spectators")::int AS "spectator_count",
  "created_at"
FROM "location_signal_games"
WHERE "is_public" = true AND "phase" <> 'ended';
