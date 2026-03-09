import { defineMutator } from "@rocicorp/zero";
import { z } from "zod";
import { zql } from "../schema";
import { now } from "./helpers";

export const chatMutators = {
  send: defineMutator(
    z.object({
      id: z.string(),
      gameType: z.enum(["imposter", "password", "chain_reaction", "shade_signal"]),
      gameId: z.string(),
      senderId: z.string(),
      senderName: z.string(),
      badge: z.string().optional(),
      text: z.string().min(1).max(500)
    }),
    async ({ args, tx }) => {
      await tx.mutate.chat_messages.insert({
        id: args.id,
        game_type: args.gameType,
        game_id: args.gameId,
        sender_id: args.senderId,
        sender_name: args.senderName,
        badge: args.badge,
        text: args.text.trim(),
        created_at: now()
      });
    }
  ),

  clearForGame: defineMutator(
    z.object({ gameType: z.enum(["imposter", "password", "chain_reaction", "shade_signal"]), gameId: z.string() }),
    async ({ args, tx }) => {
      const msgs = await tx.run(
        zql.chat_messages.where("game_type", args.gameType).where("game_id", args.gameId)
      );
      for (const m of msgs) {
        await tx.mutate.chat_messages.delete({ id: m.id });
      }
    }
  )
};
