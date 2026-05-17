import {
  chainReactionGames,
  imposterGames,
  locationSignalGames,
  passwordGames,
  shadeSignalGames,
} from "@games/shared";
import { eq } from "drizzle-orm";
import { drizzleClient } from "./db-provider";

export type GameType =
  | "imposter"
  | "password"
  | "chain_reaction"
  | "shade_signal"
  | "location_signal";

export type SurfaceAccess =
  | "public"
  | "proof-required"
  | "member"
  | "host"
  | "leader"
  | "admin"
  | "system";

const ZERO_MUTATOR_POLICIES = new Map<string, SurfaceAccess>([
  ...[
    "sessions.upsert",
    "sessions.setName",
    "sessions.attachGame",
    "sessions.clearGame",
    "sessions.touchPresence",
  ].map((name) => [name, "proof-required"] as const),
  ...[
    "imposter.create",
    "imposter.join",
    "imposter.leave",
    "imposter.start",
    "imposter.submitClue",
    "imposter.submitVote",
    "imposter.nextRound",
    "imposter.resetToLobby",
    "imposter.announce",
    "imposter.kick",
    "imposter.endGame",
    "imposter.joinAsSpectator",
    "imposter.leaveSpectator",
    "imposter.removeSpectator",
    "imposter.voteSkipResults",
    "imposter.setPublic",
  ].map((name) => [name, "proof-required"] as const),
  ["imposter.advanceTimer", "host"],
  ...[
    "password.create",
    "password.join",
    "password.leave",
    "password.start",
    "password.submitClue",
    "password.submitGuess",
    "password.skipWord",
    "password.switchTeam",
    "password.movePlayer",
    "password.lockTeams",
    "password.resetToLobby",
    "password.announce",
    "password.kick",
    "password.endGame",
    "password.joinAsSpectator",
    "password.leaveSpectator",
    "password.removeSpectator",
    "password.setPublic",
  ].map((name) => [name, "proof-required"] as const),
  ["password.advanceTimer", "host"],
  ...[
    "chainReaction.create",
    "chainReaction.join",
    "chainReaction.leave",
    "chainReaction.updateSettings",
    "chainReaction.kick",
    "chainReaction.start",
    "chainReaction.submitChain",
    "chainReaction.revealLetter",
    "chainReaction.guess",
    "chainReaction.giveUp",
    "chainReaction.resetToLobby",
    "chainReaction.endGame",
    "chainReaction.joinAsSpectator",
    "chainReaction.leaveSpectator",
    "chainReaction.announce",
    "chainReaction.removeSpectator",
    "chainReaction.setPublic",
  ].map((name) => [name, "proof-required"] as const),
  ...[
    "shadeSignal.create",
    "shadeSignal.join",
    "shadeSignal.leave",
    "shadeSignal.kick",
    "shadeSignal.announce",
    "shadeSignal.updateSettings",
    "shadeSignal.start",
    "shadeSignal.setTarget",
    "shadeSignal.submitClue",
    "shadeSignal.submitGuess",
    "shadeSignal.nextRound",
    "shadeSignal.resetToLobby",
    "shadeSignal.endGame",
    "shadeSignal.joinAsSpectator",
    "shadeSignal.leaveSpectator",
    "shadeSignal.removeSpectator",
    "shadeSignal.setPublic",
  ].map((name) => [name, "proof-required"] as const),
  ["shadeSignal.advanceTimer", "host"],
  ["shadeSignal.reveal", "host"],
  ...[
    "locationSignal.create",
    "locationSignal.join",
    "locationSignal.leave",
    "locationSignal.start",
    "locationSignal.setTarget",
    "locationSignal.submitClue",
    "locationSignal.nextRound",
    "locationSignal.kick",
    "locationSignal.announce",
    "locationSignal.endGame",
    "locationSignal.joinAsSpectator",
    "locationSignal.leaveSpectator",
    "locationSignal.removeSpectator",
    "locationSignal.resetToLobby",
    "locationSignal.setPublic",
  ].map((name) => [name, "proof-required"] as const),
  ["locationSignal.submitGuess", "member"],
  ["locationSignal.revealRound", "host"],
  ["locationSignal.advanceTimer", "host"],
  ["chat.send", "member"],
  ["chat.clearForGame", "host"],
  ...[
    "demo.seedImposter",
    "demo.seedPassword",
    "demo.seedChainReaction",
    "demo.seedShadeSignal",
    "demo.seedLocationSignal",
  ].map((name) => [name, "public"] as const),
]);

export function getZeroMutatorAccessPolicy(name: string): SurfaceAccess | null {
  return ZERO_MUTATOR_POLICIES.get(name) ?? null;
}

type QueryCaller = {
  proofUserId: string | null;
  headerUserId: string | null;
  allowUnsigned: boolean;
};

type SecretAccess = {
  allowed: boolean;
  status: 200 | 403 | 404;
  reason?: string;
  keyAllowed: boolean;
  myRole: string | null;
  scopes: string[];
};

type GameAccess = {
  isPublic: boolean;
  isMember: boolean;
  isHost: boolean;
  isLeader: boolean;
  isSpectator: boolean;
};

function getCallerUserId(caller: QueryCaller) {
  return caller.proofUserId ?? (caller.allowUnsigned ? caller.headerUserId : null);
}

function isDummyLookup(value: string | undefined) {
  return value === "__none__" || value === "______";
}

async function getAccessByGameId(gameType: GameType, gameId: string, sessionId: string | null): Promise<GameAccess | null> {
  if (gameType === "imposter") {
    const [game] = await drizzleClient
      .select({
        isPublic: imposterGames.isPublic,
        hostId: imposterGames.hostId,
        players: imposterGames.players,
        spectators: imposterGames.spectators,
      })
      .from(imposterGames)
      .where(eq(imposterGames.id, gameId))
      .limit(1);
    if (!game) return null;
    return {
      isPublic: game.isPublic,
      isMember: Boolean(sessionId && game.players.some((player) => player.sessionId === sessionId)),
      isHost: Boolean(sessionId && game.hostId === sessionId),
      isLeader: false,
      isSpectator: Boolean(sessionId && game.spectators.some((spectator) => spectator.sessionId === sessionId)),
    };
  }

  if (gameType === "password") {
    const [game] = await drizzleClient
      .select({
        isPublic: passwordGames.isPublic,
        hostId: passwordGames.hostId,
        teams: passwordGames.teams,
        spectators: passwordGames.spectators,
      })
      .from(passwordGames)
      .where(eq(passwordGames.id, gameId))
      .limit(1);
    if (!game) return null;
    return {
      isPublic: game.isPublic,
      isMember: Boolean(sessionId && game.teams.some((team) => team.members.includes(sessionId))),
      isHost: Boolean(sessionId && game.hostId === sessionId),
      isLeader: false,
      isSpectator: Boolean(sessionId && game.spectators.some((spectator) => spectator.sessionId === sessionId)),
    };
  }

  if (gameType === "chain_reaction") {
    const [game] = await drizzleClient
      .select({
        isPublic: chainReactionGames.isPublic,
        hostId: chainReactionGames.hostId,
        players: chainReactionGames.players,
        spectators: chainReactionGames.spectators,
      })
      .from(chainReactionGames)
      .where(eq(chainReactionGames.id, gameId))
      .limit(1);
    if (!game) return null;
    return {
      isPublic: game.isPublic,
      isMember: Boolean(sessionId && game.players.some((player) => player.sessionId === sessionId)),
      isHost: Boolean(sessionId && game.hostId === sessionId),
      isLeader: false,
      isSpectator: Boolean(sessionId && game.spectators.some((spectator) => spectator.sessionId === sessionId)),
    };
  }

  if (gameType === "shade_signal") {
    const [game] = await drizzleClient
      .select({
        isPublic: shadeSignalGames.isPublic,
        hostId: shadeSignalGames.hostId,
        leaderId: shadeSignalGames.leaderId,
        players: shadeSignalGames.players,
        spectators: shadeSignalGames.spectators,
      })
      .from(shadeSignalGames)
      .where(eq(shadeSignalGames.id, gameId))
      .limit(1);
    if (!game) return null;
    return {
      isPublic: game.isPublic,
      isMember: Boolean(sessionId && game.players.some((player) => player.sessionId === sessionId)),
      isHost: Boolean(sessionId && game.hostId === sessionId),
      isLeader: Boolean(sessionId && game.leaderId === sessionId),
      isSpectator: Boolean(sessionId && game.spectators.some((spectator) => spectator.sessionId === sessionId)),
    };
  }

  const [game] = await drizzleClient
    .select({
      isPublic: locationSignalGames.isPublic,
      hostId: locationSignalGames.hostId,
      leaderId: locationSignalGames.leaderId,
      players: locationSignalGames.players,
      spectators: locationSignalGames.spectators,
    })
    .from(locationSignalGames)
    .where(eq(locationSignalGames.id, gameId))
    .limit(1);
  if (!game) return null;
  return {
    isPublic: game.isPublic,
    isMember: Boolean(sessionId && game.players.some((player) => player.sessionId === sessionId)),
    isHost: Boolean(sessionId && game.hostId === sessionId),
    isLeader: Boolean(sessionId && game.leaderId === sessionId),
    isSpectator: Boolean(sessionId && game.spectators.some((spectator) => spectator.sessionId === sessionId)),
  };
}

async function getAccessByCode(gameType: GameType, code: string, sessionId: string | null): Promise<GameAccess | null> {
  if (gameType === "imposter") {
    const [game] = await drizzleClient
      .select({
        id: imposterGames.id,
        isPublic: imposterGames.isPublic,
        hostId: imposterGames.hostId,
        players: imposterGames.players,
        spectators: imposterGames.spectators,
      })
      .from(imposterGames)
      .where(eq(imposterGames.code, code))
      .limit(1);
    if (!game) return null;
    return {
      isPublic: game.isPublic,
      isMember: Boolean(sessionId && game.players.some((player) => player.sessionId === sessionId)),
      isHost: Boolean(sessionId && game.hostId === sessionId),
      isLeader: false,
      isSpectator: Boolean(sessionId && game.spectators.some((spectator) => spectator.sessionId === sessionId)),
    };
  }

  if (gameType === "password") {
    const [game] = await drizzleClient
      .select({
        isPublic: passwordGames.isPublic,
        hostId: passwordGames.hostId,
        teams: passwordGames.teams,
        spectators: passwordGames.spectators,
      })
      .from(passwordGames)
      .where(eq(passwordGames.code, code))
      .limit(1);
    if (!game) return null;
    return {
      isPublic: game.isPublic,
      isMember: Boolean(sessionId && game.teams.some((team) => team.members.includes(sessionId))),
      isHost: Boolean(sessionId && game.hostId === sessionId),
      isLeader: false,
      isSpectator: Boolean(sessionId && game.spectators.some((spectator) => spectator.sessionId === sessionId)),
    };
  }

  if (gameType === "chain_reaction") {
    const [game] = await drizzleClient
      .select({
        isPublic: chainReactionGames.isPublic,
        hostId: chainReactionGames.hostId,
        players: chainReactionGames.players,
        spectators: chainReactionGames.spectators,
      })
      .from(chainReactionGames)
      .where(eq(chainReactionGames.code, code))
      .limit(1);
    if (!game) return null;
    return {
      isPublic: game.isPublic,
      isMember: Boolean(sessionId && game.players.some((player) => player.sessionId === sessionId)),
      isHost: Boolean(sessionId && game.hostId === sessionId),
      isLeader: false,
      isSpectator: Boolean(sessionId && game.spectators.some((spectator) => spectator.sessionId === sessionId)),
    };
  }

  if (gameType === "shade_signal") {
    const [game] = await drizzleClient
      .select({
        isPublic: shadeSignalGames.isPublic,
        hostId: shadeSignalGames.hostId,
        leaderId: shadeSignalGames.leaderId,
        players: shadeSignalGames.players,
        spectators: shadeSignalGames.spectators,
      })
      .from(shadeSignalGames)
      .where(eq(shadeSignalGames.code, code))
      .limit(1);
    if (!game) return null;
    return {
      isPublic: game.isPublic,
      isMember: Boolean(sessionId && game.players.some((player) => player.sessionId === sessionId)),
      isHost: Boolean(sessionId && game.hostId === sessionId),
      isLeader: Boolean(sessionId && game.leaderId === sessionId),
      isSpectator: Boolean(sessionId && game.spectators.some((spectator) => spectator.sessionId === sessionId)),
    };
  }

  const [game] = await drizzleClient
    .select({
      isPublic: locationSignalGames.isPublic,
      hostId: locationSignalGames.hostId,
      leaderId: locationSignalGames.leaderId,
      players: locationSignalGames.players,
      spectators: locationSignalGames.spectators,
    })
    .from(locationSignalGames)
    .where(eq(locationSignalGames.code, code))
    .limit(1);
  if (!game) return null;
  return {
    isPublic: game.isPublic,
    isMember: Boolean(sessionId && game.players.some((player) => player.sessionId === sessionId)),
    isHost: Boolean(sessionId && game.hostId === sessionId),
    isLeader: Boolean(sessionId && game.leaderId === sessionId),
    isSpectator: Boolean(sessionId && game.spectators.some((spectator) => spectator.sessionId === sessionId)),
  };
}

function requireProofUserId(caller: QueryCaller) {
  return caller.proofUserId ?? null;
}

async function assertMemberOrPublic(gameType: GameType, accessor: { by: "id"; value: string } | { by: "code"; value: string }, caller: QueryCaller) {
  const sessionId = getCallerUserId(caller);
  const access = accessor.by === "id"
    ? await getAccessByGameId(gameType, accessor.value, sessionId)
    : await getAccessByCode(gameType, accessor.value, sessionId);
  if (!access) {
    throw new Error("Game not found");
  }
  if (access.isPublic || access.isMember || access.isHost || access.isSpectator) {
    return;
  }
  throw new Error("Forbidden");
}

async function assertMember(gameType: GameType, gameId: string, caller: QueryCaller) {
  const sessionId = requireProofUserId(caller);
  if (!sessionId) {
    throw new Error("Forbidden");
  }
  const access = await getAccessByGameId(gameType, gameId, sessionId);
  if (!access) {
    throw new Error("Game not found");
  }
  if (access.isMember || access.isHost || access.isSpectator) {
    return;
  }
  throw new Error("Forbidden");
}

async function assertMemberByLookup(gameType: GameType, accessor: { by: "id"; value: string } | { by: "code"; value: string }, caller: QueryCaller) {
  const sessionId = requireProofUserId(caller);
  if (!sessionId) {
    throw new Error("Forbidden");
  }
  const access = accessor.by === "id"
    ? await getAccessByGameId(gameType, accessor.value, sessionId)
    : await getAccessByCode(gameType, accessor.value, sessionId);
  if (!access) {
    throw new Error("Game not found");
  }
  if (access.isMember || access.isHost || access.isSpectator) {
    return;
  }
  throw new Error("Forbidden");
}

export async function authorizeZeroQuery(name: string, args: unknown, caller: QueryCaller) {
  if (name === "sessions.byId") {
    const id = typeof (args as { id?: unknown })?.id === "string" ? (args as { id: string }).id : "";
    if (isDummyLookup(id)) {
      return;
    }
    const proofUserId = requireProofUserId(caller);
    if (!proofUserId || proofUserId !== id) {
      throw new Error("Forbidden");
    }
    return;
  }

  if (name === "sessions.byGame") {
    const payload = args as { gameType?: GameType; gameId?: string };
    if (isDummyLookup(payload.gameId)) {
      return;
    }
    if (!payload.gameType || !payload.gameId) {
      throw new Error("Forbidden");
    }
    await assertMember(payload.gameType, payload.gameId, caller);
    return;
  }

  if (name === "chat.byGame") {
    const payload = args as { gameType?: GameType; gameId?: string };
    if (isDummyLookup(payload.gameId)) {
      return;
    }
    if (!payload.gameType || !payload.gameId) {
      throw new Error("Forbidden");
    }
    await assertMember(payload.gameType, payload.gameId, caller);
    return;
  }

  if (name === "chat.imposterByGame") {
    const payload = args as { gameId?: string };
    if (isDummyLookup(payload.gameId)) {
      return;
    }
    const proofUserId = requireProofUserId(caller);
    if (!proofUserId || !payload.gameId) {
      throw new Error("Forbidden");
    }
    const access = await resolveGameSecretAccess("imposter", payload.gameId, proofUserId);
    if (!access.allowed || !access.scopes.includes("imposter_chat")) {
      throw new Error("Forbidden");
    }
    return;
  }

  if (name === "imposter.publicGames" || name === "password.publicGames" || name === "chainReaction.publicGames" || name === "shadeSignal.publicGames" || name === "locationSignal.publicGames") {
    return;
  }

  if (name === "imposter.byId") {
    const id = (args as { id: string }).id;
    if (isDummyLookup(id)) return;
    await assertMemberByLookup("imposter", { by: "id", value: id }, caller);
    return;
  }
  if (name === "imposter.byCode") {
    const code = (args as { code: string }).code;
    if (isDummyLookup(code)) return;
    await assertMemberByLookup("imposter", { by: "code", value: code }, caller);
    return;
  }
  if (name === "password.byId") {
    const id = (args as { id: string }).id;
    if (isDummyLookup(id)) return;
    await assertMemberOrPublic("password", { by: "id", value: id }, caller);
    return;
  }
  if (name === "password.byCode") {
    const code = (args as { code: string }).code;
    if (isDummyLookup(code)) return;
    await assertMemberOrPublic("password", { by: "code", value: code }, caller);
    return;
  }
  if (name === "chainReaction.byId") {
    const id = (args as { id: string }).id;
    if (isDummyLookup(id)) return;
    await assertMemberOrPublic("chain_reaction", { by: "id", value: id }, caller);
    return;
  }
  if (name === "chainReaction.byCode") {
    const code = (args as { code: string }).code;
    if (isDummyLookup(code)) return;
    await assertMemberOrPublic("chain_reaction", { by: "code", value: code }, caller);
    return;
  }
  if (name === "shadeSignal.byId") {
    const id = (args as { id: string }).id;
    if (isDummyLookup(id)) return;
    await assertMemberOrPublic("shade_signal", { by: "id", value: id }, caller);
    return;
  }
  if (name === "shadeSignal.byCode") {
    const code = (args as { code: string }).code;
    if (isDummyLookup(code)) return;
    await assertMemberOrPublic("shade_signal", { by: "code", value: code }, caller);
    return;
  }
  if (name === "locationSignal.byId") {
    const id = (args as { id: string }).id;
    if (isDummyLookup(id)) return;
    await assertMemberOrPublic("location_signal", { by: "id", value: id }, caller);
    return;
  }
  if (name === "locationSignal.byCode") {
    const code = (args as { code: string }).code;
    if (isDummyLookup(code)) return;
    await assertMemberOrPublic("location_signal", { by: "code", value: code }, caller);
    return;
  }

  throw new Error("Forbidden");
}

export async function resolveGameSecretAccess(gameType: GameType, gameId: string, sessionId: string): Promise<SecretAccess> {
  if (gameType === "imposter") {
    const [game] = await drizzleClient
      .select({ phase: imposterGames.phase, players: imposterGames.players, spectators: imposterGames.spectators })
      .from(imposterGames)
      .where(eq(imposterGames.id, gameId))
      .limit(1);
    if (!game) {
      return { allowed: false, status: 404, reason: "Game not found", keyAllowed: false, myRole: null, scopes: [] };
    }
    const me = game.players.find((player) => player.sessionId === sessionId);
    if (!me) {
      const spectator = game.spectators.find((entry) => entry.sessionId === sessionId);
      if (spectator) {
        return { allowed: true, status: 200, keyAllowed: false, myRole: null, scopes: [] };
      }
      return { allowed: false, status: 403, reason: "Forbidden", keyAllowed: false, myRole: null, scopes: [] };
    }
    const revealPhase = game.phase === "results" || game.phase === "finished" || game.phase === "ended";
    const imposterCount = game.players.filter((player) => player.role === "imposter").length;
    const scopes = me.role === "imposter" && imposterCount >= 2 ? ["imposter_chat"] : [];
    if (!revealPhase && game.phase !== "playing" && game.phase !== "voting") {
      return { allowed: false, status: 403, reason: "Forbidden", keyAllowed: false, myRole: me.role ?? null, scopes };
    }
    return {
      allowed: true,
      status: 200,
      keyAllowed: revealPhase || me.role !== "imposter",
      myRole: me.role ?? "player",
      scopes,
    };
  }

  if (gameType === "password") {
    const [game] = await drizzleClient
      .select({ phase: passwordGames.phase, teams: passwordGames.teams, activeRounds: passwordGames.activeRounds, spectators: passwordGames.spectators })
      .from(passwordGames)
      .where(eq(passwordGames.id, gameId))
      .limit(1);
    if (!game) {
      return { allowed: false, status: 404, reason: "Game not found", keyAllowed: false, myRole: null, scopes: [] };
    }
    const team = game.teams.find((entry) => entry.members.includes(sessionId));
    if (!team) {
      const spectator = game.spectators.find((entry) => entry.sessionId === sessionId);
      if (spectator) {
        return { allowed: true, status: 200, keyAllowed: false, myRole: null, scopes: [] };
      }
      return { allowed: false, status: 403, reason: "Forbidden", keyAllowed: false, myRole: null, scopes: [] };
    }
    const isGuesser = game.phase === "playing" && game.activeRounds.some((round) => round.guesserId === sessionId);
    return { allowed: true, status: 200, keyAllowed: !isGuesser, myRole: "player", scopes: [] };
  }

  if (gameType === "shade_signal") {
    const [game] = await drizzleClient
      .select({ phase: shadeSignalGames.phase, leaderId: shadeSignalGames.leaderId, players: shadeSignalGames.players, spectators: shadeSignalGames.spectators })
      .from(shadeSignalGames)
      .where(eq(shadeSignalGames.id, gameId))
      .limit(1);
    if (!game) {
      return { allowed: false, status: 404, reason: "Game not found", keyAllowed: false, myRole: null, scopes: [] };
    }
    const isPlayer = game.players.some((player) => player.sessionId === sessionId);
    if (!isPlayer) {
      const spectator = game.spectators.find((entry) => entry.sessionId === sessionId);
      if (spectator) {
        return { allowed: true, status: 200, keyAllowed: false, myRole: null, scopes: [] };
      }
      return { allowed: false, status: 403, reason: "Forbidden", keyAllowed: false, myRole: null, scopes: [] };
    }
    const revealPhase = game.phase === "reveal" || game.phase === "finished" || game.phase === "ended";
    return {
      allowed: true,
      status: 200,
      keyAllowed: revealPhase || game.leaderId === sessionId,
      myRole: game.leaderId === sessionId ? "leader" : "player",
      scopes: [],
    };
  }

  if (gameType === "location_signal") {
    const [game] = await drizzleClient
      .select({ phase: locationSignalGames.phase, leaderId: locationSignalGames.leaderId, players: locationSignalGames.players, spectators: locationSignalGames.spectators })
      .from(locationSignalGames)
      .where(eq(locationSignalGames.id, gameId))
      .limit(1);
    if (!game) {
      return { allowed: false, status: 404, reason: "Game not found", keyAllowed: false, myRole: null, scopes: [] };
    }
    const isPlayer = game.players.some((player) => player.sessionId === sessionId);
    if (!isPlayer) {
      const spectator = game.spectators.find((entry) => entry.sessionId === sessionId);
      if (spectator) {
        return { allowed: true, status: 200, keyAllowed: false, myRole: null, scopes: [] };
      }
      return { allowed: false, status: 403, reason: "Forbidden", keyAllowed: false, myRole: null, scopes: [] };
    }
    const revealPhase = game.phase === "reveal" || game.phase === "finished" || game.phase === "ended";
    return {
      allowed: true,
      status: 200,
      keyAllowed: revealPhase || game.leaderId === sessionId,
      myRole: game.leaderId === sessionId ? "leader" : "player",
      scopes: [],
    };
  }

  const [game] = await drizzleClient
    .select({ players: chainReactionGames.players, spectators: chainReactionGames.spectators })
    .from(chainReactionGames)
    .where(eq(chainReactionGames.id, gameId))
    .limit(1);
  if (!game) {
    return { allowed: false, status: 404, reason: "Game not found", keyAllowed: false, myRole: null, scopes: [] };
  }
  const isPlayer = game.players.some((player) => player.sessionId === sessionId);
  if (!isPlayer && !game.spectators.some((entry) => entry.sessionId === sessionId)) {
    return { allowed: false, status: 403, reason: "Forbidden", keyAllowed: false, myRole: null, scopes: [] };
  }
  return { allowed: true, status: 200, keyAllowed: isPlayer, myRole: "player", scopes: [] };
}
