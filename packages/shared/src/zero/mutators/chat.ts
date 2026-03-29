import { defineMutator } from "@rocicorp/zero";
import { z } from "zod";
import { zql } from "../schema";
import { assertCaller, now, sanitizeText } from "./helpers";

export const chatMutators = {
  send: defineMutator(
    z.object({
      id: z.string(),
      gameType: z.enum(["imposter", "password", "chain_reaction", "shade_signal", "location_signal"]),
      gameId: z.string(),
      senderId: z.string(),
      senderName: z.string(),
      badge: z.string().optional(),
      channel: z.string().optional(),
      text: z.string().min(1).max(500)
    }),
    async ({ args, tx, ctx }) => {
      assertCaller(tx, ctx, args.senderId);
      const cleanText = sanitizeText(args.text);
      if (!cleanText) throw new Error("Message cannot be empty");
      const cleanName = sanitizeText(args.senderName);
      await tx.mutate.chat_messages.insert({
        id: args.id,
        game_type: args.gameType,
        game_id: args.gameId,
        sender_id: args.senderId,
        sender_name: cleanName || "Anonymous",
        badge: args.badge,
        channel: args.channel ?? "all",
        text: cleanText,
        created_at: now()
      });
    }
  ),

  clearForGame: defineMutator(
    z.object({ gameType: z.enum(["imposter", "password", "chain_reaction", "shade_signal", "location_signal"]), gameId: z.string() }),
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
