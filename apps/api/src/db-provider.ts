import { schema as zeroSchema } from "@games/shared";
import { imposterGames, passwordGames, sessions } from "@games/shared";
import { zeroDrizzle } from "@rocicorp/zero/server/adapters/drizzle";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

const connStr = process.env.DATABASE_URL ?? process.env.ZERO_UPSTREAM_DB ?? "";
const url = new URL(connStr);
if (!url.searchParams.has("sslmode")) {
  url.searchParams.set("sslmode", "verify-full");
}

const pool = new Pool({
  connectionString: url.toString()
});

export const drizzleClient = drizzle(pool, {
  schema: {
    sessions,
    imposterGames,
    passwordGames
  }
});

export const dbProvider = zeroDrizzle(zeroSchema, drizzleClient);

declare module "@rocicorp/zero" {
  interface DefaultTypes {
    dbProvider: typeof dbProvider;
  }
}
