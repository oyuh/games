import { defineMutator } from "@rocicorp/zero";
import { z } from "zod";
import { zql } from "../schema";
import { assertCaller, now, sanitizeText } from "./helpers";

export const sessionMutators = {
  upsert: defineMutator(
    z.object({ id: z.string(), name: z.string().transform(s => s.replace(/\s/g, "")).nullable().optional() }),
    async ({ args, tx, ctx }) => {
      assertCaller(tx, ctx, args.id);
      const cleanName = args.name ? sanitizeText(args.name).replace(/\s/g, "") : null;
      await tx.mutate.sessions.upsert({
        id: args.id,
        name: cleanName,
        created_at: now(),
        last_seen: now()
      });
    }
  ),
  setName: defineMutator(
    z.object({ id: z.string(), name: z.string().transform(s => s.replace(/\s/g, "")).pipe(z.string().min(1).max(30)) }),
    async ({ args, tx, ctx }) => {
      assertCaller(tx, ctx, args.id);
      const cleanName = sanitizeText(args.name).replace(/\s/g, "");
      if (!cleanName) throw new Error("Name cannot be empty");
      await tx.mutate.sessions.update({
        id: args.id,
        name: cleanName,
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
  clearGame: defineMutator(
    z.object({ id: z.string() }),
    async ({ args, tx, ctx }) => {
      assertCaller(tx, ctx, args.id);
      await tx.mutate.sessions.update({
        id: args.id,
        game_type: null,
        game_id: null,
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
