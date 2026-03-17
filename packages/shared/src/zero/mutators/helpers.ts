import { customAlphabet } from "nanoid";
import { chainWordBank, passwordWordBank } from "./word-banks";

export const now = () => Date.now();
export const code = customAlphabet("ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789", 6);
export const PRESENCE_TIMEOUT_MS = 30_000;

type GameSecretResolver = (gameType: "imposter" | "password" | "chain_reaction" | "shade_signal" | "location_signal", gameId: string) => Promise<string>;
type ServerContext = { userId?: string; resolveGameSecretKey?: GameSecretResolver };
type TxLike = { location?: string };

function asServerContext(ctx: unknown): ServerContext {
  if (ctx && typeof ctx === "object") {
    const maybeCtx = ctx as { userId?: unknown; resolveGameSecretKey?: unknown };
    const safeCtx: ServerContext = {};
    if (typeof maybeCtx.userId === "string") {
      safeCtx.userId = maybeCtx.userId;
    }
    if (typeof maybeCtx.resolveGameSecretKey === "function") {
      safeCtx.resolveGameSecretKey = maybeCtx.resolveGameSecretKey as GameSecretResolver;
    }
    return safeCtx;
  }
  return {};
}

function asTxLike(tx: unknown): TxLike {
  if (tx && typeof tx === "object" && "location" in tx) {
    const maybeLocation = (tx as { location?: unknown }).location;
    return typeof maybeLocation === "string" ? { location: maybeLocation } : {};
  }
  return {};
}

function shouldEnforceServerIdentity(tx: TxLike, ctx: ServerContext) {
  return tx.location === "server" && !!ctx.userId && ctx.userId !== "anon";
}

export function assertCaller(tx: unknown, ctx: unknown, claimedId: string) {
  const safeTx = asTxLike(tx);
  const safeCtx = asServerContext(ctx);
  if (!shouldEnforceServerIdentity(safeTx, safeCtx)) {
    return;
  }
  if (safeCtx.userId !== claimedId) {
    throw new Error("Not allowed");
  }
}

export function assertHost(tx: unknown, ctx: unknown, claimedHostId: string, actualHostId: string) {
  const safeTx = asTxLike(tx);
  const safeCtx = asServerContext(ctx);
  if (!shouldEnforceServerIdentity(safeTx, safeCtx)) {
    return;
  }
  if (safeCtx.userId !== claimedHostId || claimedHostId !== actualHostId) {
    throw new Error("Only host can do that");
  }
}

export function isServerTx(tx: unknown) {
  return asTxLike(tx).location === "server";
}

export function getGameSecretResolver(ctx: unknown): GameSecretResolver | null {
  const safeCtx = asServerContext(ctx);
  return safeCtx.resolveGameSecretKey ?? null;
}

export function pickRandom<T>(values: T[]): T {
  return values[Math.floor(Math.random() * values.length)]!;
}

export function normalized(input: string) {
  return input.trim().toLowerCase();
}

export function isOneWord(input: string) {
  return input.trim().split(/\s+/).filter(Boolean).length === 1;
}

export function isClueTooSimilar(clue: string, word: string) {
  const c = normalized(clue);
  const w = normalized(word);
  if (c === w) return true;
  if (c.startsWith(w) || w.startsWith(c)) return true;
  return false;
}

export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

export function chooseRoles(
  players: Array<{ sessionId: string; name: string | null; connected: boolean; role?: "imposter" | "player" }>,
  imposterCount: number
) {
  const shuffled = shuffle(players);
  const imposterIds = new Set(
    shuffled.slice(0, Math.max(1, Math.min(imposterCount, Math.max(1, players.length - 1)))).map((p) => p.sessionId)
  );
  return players.map((player) => ({
    ...player,
    role: imposterIds.has(player.sessionId) ? ("imposter" as const) : ("player" as const)
  }));
}

export function pickChain(length: number, category?: string): string[] {
  const catChains = category && chainWordBank[category] ? chainWordBank[category] : Object.values(chainWordBank).flat();
  const matching = catChains.filter((c) => c.length === length);
  const pool = matching.length > 0 ? matching : catChains.filter((c) => c.length >= length);
  if (pool.length === 0) {
    // Fallback to any category if the selected one has no chains of this length
    const allChains = Object.values(chainWordBank).flat();
    const fallback = allChains.filter((c) => c.length === length);
    const chain = pickRandom(fallback.length > 0 ? fallback : allChains.filter((c) => c.length >= length));
    return chain.slice(0, length);
  }
  const chain = pickRandom(pool);
  return chain.slice(0, length);
}

export function scoreForLetters(lettersShown: number): number {
  if (lettersShown <= 2) return 3;
  if (lettersShown <= 4) return 2;
  return 1;
}

export function getConnectedSet(sessions: Array<{ id: string; last_seen: number }>) {
  const cutoff = now() - PRESENCE_TIMEOUT_MS;
  return new Set(sessions.filter((session) => session.last_seen >= cutoff).map((session) => session.id));
}

export function pickPasswordWord(usedWords?: string[], category?: string) {
  const catWords = category && passwordWordBank[category] ? passwordWordBank[category] : Object.values(passwordWordBank).flat();
  const available = usedWords?.length
    ? catWords.filter((w) => !usedWords.includes(w))
    : catWords;
  const pool = available.length > 0 ? available : catWords;
  return pickRandom(pool);
}

export function buildTeamRound(team: { name: string; members: string[] }, teamIndex: number, roundNum: number, word: string) {
  if (team.members.length < 2) {
    throw new Error(`${team.name} needs at least 2 players`);
  }
  const guesserId = team.members[(roundNum - 1) % team.members.length]!;

  return {
    teamIndex,
    guesserId,
    word,
    clues: [] as Array<{ sessionId: string; text: string }>,
    guess: null as string | null,
  };
}

export function buildAllTeamRounds(teams: Array<{ name: string; members: string[] }>, roundNum: number, usedWords?: string[], category?: string) {
  const wordsUsedThisRound = new Set<string>();
  return teams
    .map((team, i) => {
      if (team.members.length < 2) return null;
      const avoidWords = [
        ...(usedWords ?? []),
        ...Array.from(wordsUsedThisRound)
      ];
      const word = pickPasswordWord(avoidWords, category);
      wordsUsedThisRound.add(word);
      return buildTeamRound(team, i, roundNum, word);
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);
}
