import { defineQueries, defineQuery } from "@rocicorp/zero";
import { z } from "zod";
import { zql } from "./schema";

export const queries = defineQueries({
  sessions: {
    byId: defineQuery(
      z.object({ id: z.string() }),
      ({ args }) => zql.sessions.where("id", args.id).limit(1)
    ),
    byGame: defineQuery(
      z.object({ gameType: z.enum(["imposter", "password", "chain_reaction", "shade_signal", "location_signal"]), gameId: z.string() }),
      ({ args }) =>
        zql.sessions
          .where("game_type", args.gameType)
          .where("game_id", args.gameId)
          .orderBy("created_at", "asc")
    )
  },
  imposter: {
    byId: defineQuery(
      z.object({ id: z.string() }),
      ({ args }) => zql.imposter_games.where("id", args.id).limit(1)
    ),
    byCode: defineQuery(
      z.object({ code: z.string() }),
      ({ args }) => zql.imposter_games.where("code", args.code).limit(1)
    ),
    publicGames: defineQuery(
      z.object({}),
      () => zql.imposter_games.where("is_public", true).where("phase", "!=", "ended")
    )
  },
  password: {
    byId: defineQuery(
      z.object({ id: z.string() }),
      ({ args }) => zql.password_games.where("id", args.id).limit(1)
    ),
    byCode: defineQuery(
      z.object({ code: z.string() }),
      ({ args }) => zql.password_games.where("code", args.code).limit(1)
    ),
    publicGames: defineQuery(
      z.object({}),
      () => zql.password_games.where("is_public", true).where("phase", "!=", "ended")
    )
  },
  chainReaction: {
    byId: defineQuery(
      z.object({ id: z.string() }),
      ({ args }) => zql.chain_reaction_games.where("id", args.id).limit(1)
    ),
    byCode: defineQuery(
      z.object({ code: z.string() }),
      ({ args }) => zql.chain_reaction_games.where("code", args.code).limit(1)
    ),
    publicGames: defineQuery(
      z.object({}),
      () => zql.chain_reaction_games.where("is_public", true).where("phase", "!=", "ended").where("phase", "!=", "finished")
    )
  },
  shadeSignal: {
    byId: defineQuery(
      z.object({ id: z.string() }),
      ({ args }) => zql.shade_signal_games.where("id", args.id).limit(1)
    ),
    byCode: defineQuery(
      z.object({ code: z.string() }),
      ({ args }) => zql.shade_signal_games.where("code", args.code).limit(1)
    ),
    publicGames: defineQuery(
      z.object({}),
      () => zql.shade_signal_games.where("is_public", true).where("phase", "!=", "ended")
    )
  },
  locationSignal: {
    byId: defineQuery(
      z.object({ id: z.string() }),
      ({ args }) => zql.location_signal_games.where("id", args.id).limit(1)
    ),
    byCode: defineQuery(
      z.object({ code: z.string() }),
      ({ args }) => zql.location_signal_games.where("code", args.code).limit(1)
    ),
    publicGames: defineQuery(
      z.object({}),
      () => zql.location_signal_games.where("is_public", true).where("phase", "!=", "ended")
    )
  },
  chat: {
    byGame: defineQuery(
      z.object({ gameType: z.enum(["imposter", "password", "chain_reaction", "shade_signal", "location_signal"]), gameId: z.string() }),
      ({ args }) =>
        zql.chat_messages
          .where("game_type", args.gameType)
          .where("game_id", args.gameId)
          .orderBy("created_at", "asc")
    )
  }
});
