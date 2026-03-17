import { defineMutator } from "@rocicorp/zero";
import { z } from "zod";
import { zql } from "../schema";
import { assertCaller, now } from "./helpers";

export const sessionMutators = {
  upsert: defineMutator(
    z.object({ id: z.string(), name: z.string().transform(s => s.replace(/\s/g, "")).nullable().optional() }),
    async ({ args, tx, ctx }) => {
      assertCaller(tx, ctx, args.id);
      await tx.mutate.sessions.upsert({
        id: args.id,
        name: args.name ?? null,
        created_at: now(),
        last_seen: now()
      });
    }
  ),
  setName: defineMutator(
    z.object({ id: z.string(), name: z.string().transform(s => s.replace(/\s/g, "")).pipe(z.string().min(1).max(30)) }),
    async ({ args, tx, ctx }) => {
      assertCaller(tx, ctx, args.id);
      await tx.mutate.sessions.update({
        id: args.id,
        name: args.name,
        last_seen: now()
      });
    }
  ),
  attachGame: defineMutator(
    z.object({
      id: z.string(),
      gameType: z.enum(["imposter", "password", "chain_reaction", "shade_signal"]),
      gameId: z.string()
    }),
    async ({ args, tx, ctx }) => {
      assertCaller(tx, ctx, args.id);
      await tx.mutate.sessions.update({
        id: args.id,
        game_type: args.gameType,
        game_id: args.gameId,
        last_seen: now()
      });
    }
  ),
  touchPresence: defineMutator(
    z.object({ id: z.string() }),
    async ({ args, tx, ctx }) => {
      assertCaller(tx, ctx, args.id);
      await tx.mutate.sessions.update({
        id: args.id,
        last_seen: now()
      });
    }
  )
};
