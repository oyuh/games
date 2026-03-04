import { schema as zeroSchema } from "@games/shared";
import * as drizzleSchema from "@games/shared";
import { zeroDrizzle } from "@rocicorp/zero/server/adapters/drizzle";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL ?? process.env.ZERO_UPSTREAM_DB
});

export const drizzleClient = drizzle(pool, {
  schema: drizzleSchema
});

export const dbProvider = zeroDrizzle(zeroSchema, drizzleClient);

declare module "@rocicorp/zero" {
  interface DefaultTypes {
    dbProvider: typeof dbProvider;
  }
}
