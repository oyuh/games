// Example model schema from the Drizzle docs
// https://orm.drizzle.team/docs/sql-schema-declaration

import { sql } from "drizzle-orm";
import { pgTableCreator } from "drizzle-orm/pg-core";

/**
 * This is an example of how to use the multi-project schema feature of Drizzle ORM. Use the same
 * database instance for multiple projects.
 *
 * @see https://orm.drizzle.team/docs/goodies#multi-project-schema
 */
export const createTable = pgTableCreator((name) => `games_${name}`);

export const sessions = createTable(
  "session",
  (d) => ({
    id: d.uuid().primaryKey().default(sql`gen_random_uuid()`),
    entered_name: d.varchar({ length: 128 }),
    created_at: d.timestamp({ withTimezone: true }).default(sql`CURRENT_TIMESTAMP`).notNull(),
    expires_at: d.timestamp({ withTimezone: true }).notNull(),
    game_data: d.jsonb(),
  })
);

export const imposter = createTable(
  "imposter",
  (d) => ({
    id: d.uuid().primaryKey().default(sql`gen_random_uuid()`),
    host_id: d.uuid().notNull(),
    category: d.varchar({ length: 128 }).notNull(),
    max_players: d.integer().notNull(),
    num_imposters: d.integer().notNull(),
    player_ids: d.uuid().array().notNull().default(sql`ARRAY[]::uuid[]`),
    imposter_ids: d.uuid().array(),
    chosen_word: d.varchar({ length: 128 }),
    game_data: d.jsonb(),
    code: d.varchar({ length: 8 }).notNull().unique(),
    created_at: d.timestamp({ withTimezone: true }).default(sql`CURRENT_TIMESTAMP`).notNull(),
    started_at: d.timestamp({ withTimezone: true }),
    finished_at: d.timestamp({ withTimezone: true }),
    expires_at: d.timestamp({ withTimezone: true }),
  })
);

export const posts = createTable(
  "post",
  (d) => ({
    id: d.uuid().primaryKey().default(sql`gen_random_uuid()`),
    name: d.varchar({ length: 128 }).notNull(),
    createdAt: d.timestamp({ withTimezone: true }).default(sql`CURRENT_TIMESTAMP`).notNull(),
  })
);
