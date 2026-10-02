import { customAlphabet } from "nanoid";
import { z } from "zod";
import type { SettingRange } from "../../lobby-settings";
export { fallbackPlayerName, randomPlayerName, resolvePlayerName } from "../../player-names";
import { chainLinks, chainStarts, passwordWordBank } from "./word-banks";
import { decryptSecret, encryptSecret, isEncrypted } from "../../crypto";

export const now = () => Date.now();
export const code = customAlphabet("ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789", 6);
/**
 * Room codes are picked by the client and passed to create, so the code a
 * host sees and shares before the sync server wakes is the one the server
 * stores. Rolled inside the mutator, the client and server each got their own.
 */
export const ROOM_CODE = /^[A-Z0-9]{6}$/;
export const PRESENCE_TIMEOUT_MS = 30_000;

// ─── Lobby settings ─────────────────────────────────────────
/** A whole number inside one of LOBBY_SETTING_LIMITS' ranges. */
export function settingInRange(range: SettingRange) {
  return z.number().int().min(range.min).max(range.max);
}

/** Every game's updateSettings asks the same two things before it writes. */
export function assertLobbySettingsChange<G extends { host_id: string; phase: string }>(
  game: G | undefined,
  hostId: string,
): asserts game is G {
  if (!game) throw new Error("Game not found");
  if (game.host_id !== hostId) throw new Error("Only host can update settings");
  if (game.phase !== "lobby") throw new Error("Can only update settings in lobby");
}

/** The keys the host actually sent. Zod leaves the rest as undefined, and
 *  spreading those would blank out settings nobody touched. */
export function definedSettings<T extends Record<string, unknown>>(patch: T) {
  return Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined)) as {
    [K in keyof T]?: Exclude<T[K], undefined>;
  };
}

// ─── Input sanitization ─────────────────────────────────────
const HTML_TAG_RE = /<[^>]*>/g;
const CONTROL_CHAR_RE = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;

/**
 * Strips HTML tags and dangerous control characters from user-supplied text.
 * Preserves normal whitespace (spaces, tabs, newlines).
 * Always trims the result.
 */
export function sanitizeText(input: string): string {
  return input
    .replace(HTML_TAG_RE, "")
    .replace(CONTROL_CHAR_RE, "")
    .trim();
}

/** Max allowed length for IDs (sessionId, gameId, hostId, etc.) */
const MAX_ID_LENGTH = 64;

/**
 * Validates and trims an ID string. Throws if empty or too long.
 */
export function sanitizeId(id: string): string {
  const trimmed = id.trim();
  if (!trimmed || trimmed.length > MAX_ID_LENGTH) {
    throw new Error("Invalid ID");
  }
  return trimmed;
}

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

/**
 * True on the server's authoritative run of a mutator. Anything random that
 * players can see (roles, leaders, words, targets, grids) is rolled only
 * there: the client's optimistic run returns before rolling, because its own
 * pick would show until the server's replaced it, a flash of the wrong
 * imposter or leader. The client waits on the server for these instead.
 */
export function isServerTx(tx: unknown) {
  return asTxLike(tx).location === "server";
}

export function getGameSecretResolver(ctx: unknown): GameSecretResolver | null {
  const safeCtx = asServerContext(ctx);
  return safeCtx.resolveGameSecretKey ?? null;
}

type SecretGameType = Parameters<GameSecretResolver>[0];

/**
 * The imposter back-channel gets its own encryption key, separate from the one
 * that hides the secret word. They protect opposite audiences: the word key is
 * handed to the innocents, the chat key to the imposters, so they can never be
 * the same key. Storing it under a distinct game_id in the existing key table
 * keeps a second keyspace without a schema change. Both the send mutator and
 * the key endpoint derive the id here so they always agree.
 */
export function imposterChatKeyId(gameId: string) {
  return `chat:${gameId}`;
}

/**
 * Encrypts a round secret before it goes on a synced row, so zero-cache never
 * ships it in the clear. Only the server holds keys. A server without a key
 * store (unit tests) writes plaintext, like password always has. The client's
 * optimistic run gets null: it has no key, and a local guess at a random
 * secret would only flash the wrong one.
 */
export async function sealSecret(tx: unknown, ctx: unknown, gameType: SecretGameType, gameId: string, plaintext: string): Promise<string | null> {
  const resolver = getGameSecretResolver(ctx);
  if (resolver) return encryptSecret(plaintext, await resolver(gameType, gameId));
  return isServerTx(tx) ? plaintext : null;
}

/** Undoes sealSecret on the server. Null on the client, which has no key. */
export async function openSecret(ctx: unknown, gameType: SecretGameType, gameId: string, value: string): Promise<string | null> {
  if (!isEncrypted(value)) return value;
  const resolver = getGameSecretResolver(ctx);
  if (!resolver) return null;
  return decryptSecret(value, await resolver(gameType, gameId));
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

/** A fresh chain every deal: a random walk over the link graph from one of the
 *  category's themed starting words, backtracking out of dead ends and never
 *  repeating a word. */
export function pickChain(length: number, category?: string): string[] {
  const starts = category && chainStarts[category] ? chainStarts[category] : Object.values(chainStarts).flat();
  for (const start of shuffle(starts)) {
    const chain = extendChain([start], length);
    if (chain) return chain;
  }
  throw new Error(`No ${length}-word chain starts in ${category ?? "any category"}`);
}

function extendChain(chain: string[], length: number): string[] | null {
  if (chain.length === length) return chain;
  for (const next of shuffle(chainLinks[chain.at(-1)!] ?? [])) {
    if (chain.includes(next)) continue;
    const done = extendChain([...chain, next], length);
    if (done) return done;
  }
  return null;
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

export function scorePasswordGuessCount(guessCount: number) {
  if (guessCount <= 1) return 3;
  if (guessCount === 2) return 2;
  return 1;
}

export function buildPasswordRoundId(roundNum: number, teamIndex: number) {
  return `pw-${roundNum}-${teamIndex + 1}-${code()}`;
}

export function buildTeamRound(team: { name: string; members: string[] }, teamIndex: number, roundNum: number, word: string) {
  if (team.members.length < 2) {
    throw new Error(`${team.name} needs at least 2 players`);
  }
  const guesserId = team.members[(roundNum - 1) % team.members.length]!;

  return {
    teamIndex,
    guesserId,
    roundId: buildPasswordRoundId(roundNum, teamIndex),
    word,
    clues: [] as Array<{
      id: string;
      sessionId: string;
      text: string;
      ts: number;
      clueNumber: number;
      repeatedText?: boolean;
    }>,
    guesses: [] as Array<{
      id: string;
      sessionId: string;
      text: string;
      ts: number;
      correct: boolean;
      guessNumber: number;
    }>,
    guess: null as string | null,
    guessCount: 0,
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
