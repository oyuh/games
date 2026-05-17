import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import pg from "pg";

config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../.env") });

const { Client } = pg;

const LEGACY_VIEWS = [
  "imposter_public_game_summaries",
  "password_public_game_summaries",
  "chain_reaction_public_game_summaries",
  "shade_signal_public_game_summaries",
  "location_signal_public_game_summaries",
  "imposter_public_games",
] as const;

async function main() {
  const databaseUrl = process.env.DATABASE_URL?.trim() || "postgres://postgres:postgres@localhost:5432/games";
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    for (const viewName of LEGACY_VIEWS) {
      await client.query(`drop view if exists "${viewName}" cascade`);
    }
    console.log(`[db:prepare-zero-sync-schema] dropped legacy Zero views if present`);
  } finally {
    await client.end();
  }
}

await main();
