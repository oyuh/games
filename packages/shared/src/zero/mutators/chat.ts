import { defineMutator } from "@rocicorp/zero";
import { z } from "zod";
import { zql } from "../schema";
import { assertCaller, assertHost, imposterChatKeyId, now, sanitizeText, resolvePlayerName, sealSecret } from "./helpers";

type ChatGameType = "imposter" | "password" | "chain_reaction" | "shade_signal" | "location_signal";

/** The host_id of a game, whatever its type, or null if it no longer exists. */
async function loadGameHostId(tx: any, gameType: ChatGameType, gameId: string): Promise<string | null> {
  switch (gameType) {
    case "imposter":
      return (await tx.run(zql.imposter_games.where("id", gameId).one()))?.host_id ?? null;
    case "password":
      return (await tx.run(zql.password_games.where("id", gameId).one()))?.host_id ?? null;
    case "chain_reaction":
      return (await tx.run(zql.chain_reaction_games.where("id", gameId).one()))?.host_id ?? null;
    case "shade_signal":
      return (await tx.run(zql.shade_signal_games.where("id", gameId).one()))?.host_id ?? null;
    case "location_signal":
      return (await tx.run(zql.location_signal_games.where("id", gameId).one()))?.host_id ?? null;
  }
}

export const chatMutators = {
  send: defineMutator(
    z.object({
      id: z.string(),
      gameType: z.enum(["imposter", "password", "chain_reaction", "shade_signal", "location_signal"]),
      gameId: z.string(),
      senderId: z.string(),
      senderName: z.string(),
      badge: z.string().optional(),
      channel: z.enum(["all", "imposter"]).optional(),
      text: z.string().min(1).max(500)
    }),
    async ({ args, tx, ctx }) => {
      assertCaller(tx, ctx, args.senderId);
      const cleanText = sanitizeText(args.text);
      if (!cleanText) throw new Error("Message cannot be empty");
      const cleanName = resolvePlayerName(sanitizeText(args.senderName), args.senderId);

      const channel = args.channel ?? "all";
      let storedText = cleanText;
      if (channel === "imposter") {
        // The imposter back-channel is imposters-only. Every chat row syncs to
        // every client, so the client-side channel filter hides nothing on its
        // own: enforce membership on the authoritative run, then seal the text
        // with a key only imposters can fetch so the synced row leaks nothing.
        if (args.gameType !== "imposter") throw new Error("Imposter channel is only for imposter games");
        const game = await tx.run(zql.imposter_games.where("id", args.gameId).one());
        const me = game?.players.find((p) => p.sessionId === args.senderId);
        if (!me || me.role !== "imposter") throw new Error("Only imposters can post to the imposter channel");
        storedText = (await sealSecret(tx, ctx, "imposter", imposterChatKeyId(args.gameId), cleanText)) ?? cleanText;
      }

      await tx.mutate.chat_messages.insert({
        id: args.id,
        game_type: args.gameType,
        game_id: args.gameId,
        sender_id: args.senderId,
        sender_name: cleanName,
        badge: args.badge,
        channel,
        text: storedText,
        created_at: now()
      });
    }
  ),

  clearForGame: defineMutator(
    z.object({ gameType: z.enum(["imposter", "password", "chain_reaction", "shade_signal", "location_signal"]), gameId: z.string(), hostId: z.string() }),
    async ({ args, tx, ctx }) => {
      // Wiping a game's whole chat is a host-only action. Without this, the
      // mutator carried no identity field, so it ran unauthenticated for anyone
      // who knew a gameId.
      const actualHostId = await loadGameHostId(tx, args.gameType, args.gameId);
      assertHost(tx, ctx, args.hostId, actualHostId ?? "");
      const msgs = await tx.run(
        zql.chat_messages.where("game_type", args.gameType).where("game_id", args.gameId)
      );
      for (const m of msgs) {
        await tx.mutate.chat_messages.delete({ id: m.id });
      }
    }
  )
};
