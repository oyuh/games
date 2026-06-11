import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

config({ path: "../../.env", quiet: true });

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/drizzle/schema.ts",
  // Workflow is push-only (drizzle-kit push diffs schema.ts against the live DB).
  // We intentionally don't generate/keep a migrations output folder.
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/games"
  }
});
