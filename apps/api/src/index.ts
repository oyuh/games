import { mutators, queries, schema } from "@games/shared";
import { serve } from "@hono/node-server";
import { handleMutateRequest, handleQueryRequest } from "@rocicorp/zero/server";
import { mustGetMutator, mustGetQuery } from "@rocicorp/zero";
import { config } from "dotenv";
import { Hono } from "hono";
import { dbProvider } from "./db-provider";
import { startPresenceServer } from "./presence-server";

config({ path: "../../.env" });

const app = new Hono();

app.get("/health", (c) => c.json({ ok: true }));

app.post("/api/zero/query", async (c) => {
  const request = c.req.raw;
  const result = await handleQueryRequest(
    (name, args) => {
      const query = mustGetQuery(queries, name);
      return query.fn({ args, ctx: { userId: "anon" } });
    },
    schema,
    request
  );
  return c.json(result);
});

app.post("/api/zero/mutate", async (c) => {
  const request = c.req.raw;
  const result = await handleMutateRequest(
    dbProvider,
    (transact) =>
      transact((tx, name, args) => {
        const mutator = mustGetMutator(mutators, name);
        return mutator.fn({ args, tx, ctx: { userId: "anon" } });
      }),
    request
  );
  return c.json(result);
});

const port = Number(process.env.API_PORT ?? 3001);
const server = serve(
  {
    fetch: app.fetch,
    port
  },
  () => {
    console.log(`API listening on http://localhost:${port}`);
  }
);

startPresenceServer(server, "/presence");
