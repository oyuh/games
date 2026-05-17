import { defineMutator } from "@rocicorp/zero";
import { z } from "zod";
import { zql } from "../schema";
import { assertCaller, assertHostUser, now, sanitizeText, resolvePlayerName } from "./helpers";

type GameType = "imposter" | "password" | "chain_reaction" | "shade_signal" | "location_signal";

type GameAudience = {
  hostId: string;
  participantIds: Set<string>;
  imposterIds: Set<string>;
};

async function loadGameAudience(tx: { run: (...args: any[]) => Promise<any> }, gameType: GameType, gameId: string): Promise<GameAudience | null> {
  if (gameType === "imposter") {
    const game = await tx.run(zql.imposter_games.where("id", gameId).one()) as {
      host_id: string;
      players: Array<{ sessionId: string; role?: "imposter" | "player" }>;
      spectators: Array<{ sessionId: string }>;
    } | null;
    if (!game) return null;
    return {
      hostId: game.host_id,
      participantIds: new Set([
        ...game.players.map((player) => player.sessionId),
        ...game.spectators.map((spectator) => spectator.sessionId),
      ]),
      imposterIds: new Set(
        game.players
          .filter((player) => player.role === "imposter")
          .map((player) => player.sessionId)
      ),
    };
  }

  if (gameType === "password") {
    const game = await tx.run(zql.password_games.where("id", gameId).one()) as {
      host_id: string;
      teams: Array<{ members: string[] }>;
      spectators: Array<{ sessionId: string }>;
    } | null;
    if (!game) return null;
    return {
      hostId: game.host_id,
      participantIds: new Set([
        ...game.teams.flatMap((team) => team.members),
        ...game.spectators.map((spectator) => spectator.sessionId),
      ]),
      imposterIds: new Set(),
    };
  }

  if (gameType === "chain_reaction") {
    const game = await tx.run(zql.chain_reaction_games.where("id", gameId).one()) as {
      host_id: string;
      players: Array<{ sessionId: string }>;
      spectators: Array<{ sessionId: string }>;
    } | null;
    if (!game) return null;
    return {
      hostId: game.host_id,
      participantIds: new Set([
        ...game.players.map((player) => player.sessionId),
        ...game.spectators.map((spectator) => spectator.sessionId),
      ]),
      imposterIds: new Set(),
    };
  }

  if (gameType === "shade_signal") {
    const game = await tx.run(zql.shade_signal_games.where("id", gameId).one()) as {
      host_id: string;
      players: Array<{ sessionId: string }>;
      spectators: Array<{ sessionId: string }>;
    } | null;
    if (!game) return null;
    return {
      hostId: game.host_id,
      participantIds: new Set([
        ...game.players.map((player) => player.sessionId),
        ...game.spectators.map((spectator) => spectator.sessionId),
      ]),
      imposterIds: new Set(),
    };
  }

  const game = await tx.run(zql.location_signal_games.where("id", gameId).one()) as {
    host_id: string;
    players: Array<{ sessionId: string }>;
    spectators: Array<{ sessionId: string }>;
  } | null;
  if (!game) return null;
  return {
    hostId: game.host_id,
    participantIds: new Set([
      ...game.players.map((player) => player.sessionId),
      ...game.spectators.map((spectator) => spectator.sessionId),
    ]),
    imposterIds: new Set(),
  };
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
      channel: z.string().optional(),
      text: z.string().min(1).max(500)
    }),
    async ({ args, tx, ctx }) => {
      assertCaller(tx, ctx, args.senderId);
      const cleanText = sanitizeText(args.text);
      if (!cleanText) throw new Error("Message cannot be empty");
      const audience = await loadGameAudience(tx, args.gameType, args.gameId);
      if (!audience) throw new Error("Game not found");
      if (!audience.participantIds.has(args.senderId) && audience.hostId !== args.senderId) {
        throw new Error("Only game members can chat");
      }
      const channel = args.channel ?? "all";
      if (channel !== "all") {
        if (args.gameType !== "imposter" || channel !== "imposter") {
          throw new Error("Invalid chat channel");
        }
        if (!audience.imposterIds.has(args.senderId) || audience.imposterIds.size < 2) {
          throw new Error("Only imposters can use this channel");
        }
      }
      const cleanName = resolvePlayerName(sanitizeText(args.senderName), args.senderId);
      await tx.mutate.chat_messages.insert({
        id: args.id,
        game_type: args.gameType,
        game_id: args.gameId,
        sender_id: args.senderId,
        sender_name: cleanName,
        badge: args.badge,
        channel,
        text: cleanText,
        created_at: now()
      });
    }
  ),

  clearForGame: defineMutator(
    z.object({ gameType: z.enum(["imposter", "password", "chain_reaction", "shade_signal", "location_signal"]), gameId: z.string() }),
    async ({ args, tx, ctx }) => {
      const audience = await loadGameAudience(tx, args.gameType, args.gameId);
      if (!audience) return;
      assertHostUser(tx, ctx, audience.hostId);
      const msgs = await tx.run(
        zql.chat_messages.where("game_type", args.gameType).where("game_id", args.gameId)
      ) as Array<{ id: string }>;
      for (const m of msgs) {
        await tx.mutate.chat_messages.delete({ id: m.id });
      }
    }
  )
};
