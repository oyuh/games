import { nanoid } from "nanoid";
import { mutators } from "@games/shared";

const SESSION_KEY = "games:user-id";
const SESSION_PROOF_KEY = "games:session-proof";
const SESSION_PROOF_HEADER = "x-zero-session-proof";
const NAME_KEY = "games:user-name";
const RECENT_GAMES_KEY = "games:recent-games";
const VISITED_KEY = "games:has-visited";
const MAX_RECENT_GAMES = 6;
const SESSION_SYNC_TIMEOUT_MS = 4000;
const BOOT_SESSION_SYNC_ATTEMPTS = 3;
const BOOT_SESSION_SYNC_RETRY_DELAY_MS = 1000;

let cachedSessionId: string | null = null;
let cachedSessionProof: string | null | undefined;
let cachedName: string | null | undefined;

function sanitizeStoredNameValue(value: string | null | undefined) {
  return (value ?? "").replace(/\s/g, "");
}

function ensureSessionIdCache() {
  if (cachedSessionId && cachedSessionId.trim()) {
    return cachedSessionId;
  }

  const existing = localStorage.getItem(SESSION_KEY)?.trim() ?? "";
  if (existing) {
    cachedSessionId = existing;
    return existing;
  }

  const id = nanoid();
  cachedSessionId = id;
  localStorage.setItem(SESSION_KEY, id);
  return id;
}

function ensureNameCache() {
  if (cachedName !== undefined) {
    return cachedName;
  }

  const stored = sanitizeStoredNameValue(localStorage.getItem(NAME_KEY));
  cachedName = stored || null;
  return cachedName;
}

function ensureSessionProofCache() {
  if (cachedSessionProof !== undefined) {
    return cachedSessionProof;
  }

  const stored = localStorage.getItem(SESSION_PROOF_KEY)?.trim() ?? "";
  cachedSessionProof = stored || null;
  return cachedSessionProof;
}

export function resetStoredIdentityForTests() {
  cachedSessionId = null;
  cachedSessionProof = undefined;
  cachedName = undefined;
}

/* ── Word bank for random names ──────────────────────── */
const adjectives = [
  "Swift", "Sneaky", "Cosmic", "Lucky", "Dizzy", "Frosty", "Bold", "Chill",
  "Witty", "Fierce", "Jolly", "Mystic", "Nifty", "Pixel", "Rapid", "Silent",
  "Turbo", "Vivid", "Wacky", "Zesty", "Brave", "Clever", "Funky", "Groovy",
  "Hyper", "Keen", "Lively", "Plucky", "Radiant", "Spunky", "Sleepy", "Stormy",
  "Sunny", "Fuzzy", "Crispy", "Bouncy", "Shifty", "Sparky", "Tricky", "Zippy",
];
const nouns = [
  "Panda", "Fox", "Falcon", "Otter", "Wolf", "Shark", "Raven", "Lynx",
  "Cobra", "Badger", "Hawk", "Tiger", "Bear", "Moose", "Owl", "Penguin",
  "Dragon", "Phoenix", "Pirate", "Knight", "Ninja", "Wizard", "Ghost", "Robot",
  "Yeti", "Gremlin", "Goblin", "Squid", "Toucan", "Ferret", "Walrus", "Jackal",
  "Beetle", "Puffin", "Coyote", "Mole", "Parrot", "Wasp", "Mantis", "Orca",
];

export function randomName(): string {
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)]!;
  const noun = nouns[Math.floor(Math.random() * nouns.length)]!;
  return `${adj}${noun}`;
}

/**
 * Guarantee the player has a display name before joining a game.
 * If no name is stored locally, generates a random one, persists it
 * to localStorage, and syncs it to the sessions DB so the join
 * mutator picks it up.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function ensureName(zero: { mutate: any }, sessionId: string) {
  if (!getStoredName()) {
    const generated = randomName();
    setStoredName(generated);
    void zero.mutate(mutators.sessions.setName({ id: sessionId, name: generated }));
  }
}

export type SessionGameType = "imposter" | "password" | "chain_reaction" | "shade_signal" | "location_signal";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function leaveCurrentGame(zero: { mutate: any }, sessionId: string, gameType: SessionGameType, gameId: string) {
  if (gameType === "imposter") {
    await zero.mutate(mutators.imposter.leave({ gameId, sessionId })).client;
    return;
  }
  if (gameType === "password") {
    await zero.mutate(mutators.password.leave({ gameId, sessionId })).client;
    return;
  }
  if (gameType === "chain_reaction") {
    await zero.mutate(mutators.chainReaction.leave({ gameId, sessionId })).client;
    return;
  }
  if (gameType === "shade_signal") {
    await zero.mutate(mutators.shadeSignal.leave({ gameId, sessionId })).client;
    return;
  }
  await zero.mutate(mutators.locationSignal.leave({ gameId, sessionId })).client;
}

export type RecentGame = {
  id: string;
  code: string;
  gameType: "imposter" | "password" | "chain_reaction" | "shade_signal" | "location_signal";
  lastPlayedAt: number;
};

export function getOrCreateSessionId() {
  return ensureSessionIdCache();
}

export function getStoredName() {
  return ensureNameCache() ?? "";
}

export function getStoredSessionProof() {
  return ensureSessionProofCache();
}

export function getSessionRequestHeaders(sessionId?: string, headers?: Record<string, string>) {
  const nextHeaders: Record<string, string> = { ...(headers ?? {}) };
  const resolvedSessionId = sessionId?.trim() || getOrCreateSessionId();
  if (resolvedSessionId) {
    nextHeaders["x-zero-user-id"] = resolvedSessionId;
  }

  const sessionProof = getStoredSessionProof();
  if (sessionProof) {
    nextHeaders[SESSION_PROOF_HEADER] = sessionProof;
  }

  return nextHeaders;
}

export function setStoredName(name: string) {
  const sanitized = sanitizeStoredNameValue(name);
  cachedName = sanitized || null;
  if (!sanitized) {
    localStorage.removeItem(NAME_KEY);
  } else {
    localStorage.setItem(NAME_KEY, sanitized);
  }
  window.dispatchEvent(new CustomEvent("games:name-changed", { detail: sanitized }));
}

function setStoredSessionId(sessionId: string) {
  const sanitized = sessionId.trim();
  cachedSessionId = sanitized || null;
  if (!sanitized) {
    localStorage.removeItem(SESSION_KEY);
  } else {
    localStorage.setItem(SESSION_KEY, sanitized);
  }
  window.dispatchEvent(new CustomEvent("games:session-changed", { detail: sanitized }));
}

function setStoredSessionProof(proof: string | null | undefined) {
  const sanitized = typeof proof === "string" ? proof.trim() : "";
  cachedSessionProof = sanitized || null;
  if (!sanitized) {
    localStorage.removeItem(SESSION_PROOF_KEY);
  } else {
    localStorage.setItem(SESSION_PROOF_KEY, sanitized);
  }
}

export function syncStoredIdentity(identity: { sessionId: string; name: string | null }) {
  const previousSessionId = ensureSessionIdCache();
  const previousName = getStoredName();
  const nextSessionId = identity.sessionId.trim();
  const nextName = sanitizeStoredNameValue(identity.name);

  if (nextSessionId && nextSessionId !== previousSessionId) {
    setStoredSessionId(nextSessionId);
  }

  if (nextName !== previousName) {
    setStoredName(nextName);
  }

  return {
    sessionChanged: Boolean(nextSessionId && nextSessionId !== previousSessionId),
    nameChanged: nextName !== previousName,
  };
}

export type SyncedSessionIdentity = {
  sessionId: string;
  name: string | null;
  zeroSessionProof: string | null;
  resetRequired: boolean;
  created: boolean;
  source: "cookie" | "claimed" | "fingerprint" | "created" | "fallback";
};

export type VerifiedSessionIdentity = SyncedSessionIdentity & {
  zeroSessionProof: string;
  source: "cookie" | "claimed" | "fingerprint" | "created";
};

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

export async function syncSessionIdentity(
  apiBase: string,
  options?: { allowCreate?: boolean; reason?: string; timeoutMs?: number }
): Promise<SyncedSessionIdentity> {
  const fallbackSessionId = getOrCreateSessionId();
  const fallbackName = getStoredName() || null;
  const fallbackZeroSessionProof = getStoredSessionProof();
  const controller = new AbortController();
  const timeout = window.setTimeout(
    () => controller.abort(),
    Math.max(1000, options?.timeoutMs ?? SESSION_SYNC_TIMEOUT_MS)
  );

  try {
    const response = await fetch(`${apiBase}/api/session/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      signal: controller.signal,
      body: JSON.stringify({
        sessionId: fallbackSessionId,
        name: fallbackName,
        allowCreate: options?.allowCreate !== false,
        reason: options?.reason ?? "app",
      }),
    });

    if (!response.ok) {
      throw new Error(`status ${response.status}`);
    }

    const data = await response.json() as {
      sessionId?: string;
      name?: string | null;
      zeroSessionProof?: string | null;
      resetRequired?: boolean;
      created?: boolean;
      source?: "cookie" | "claimed" | "fingerprint" | "created";
    };

    const sessionId = typeof data.sessionId === "string" && data.sessionId.trim()
      ? data.sessionId.trim()
      : fallbackSessionId;
    const name = typeof data.name === "string" ? data.name : data.name === null ? null : fallbackName;
    const synced = syncStoredIdentity({ sessionId, name });
    if (typeof data.zeroSessionProof === "string" || data.zeroSessionProof === null) {
      setStoredSessionProof(data.zeroSessionProof);
    }
    const zeroSessionProof = getStoredSessionProof();

    return {
      sessionId,
      name,
      zeroSessionProof,
      resetRequired: Boolean(data.resetRequired || synced.sessionChanged || synced.nameChanged),
      created: Boolean(data.created),
      source: data.source ?? "fallback",
    };
  } catch {
    return {
      sessionId: fallbackSessionId,
      name: fallbackName,
      zeroSessionProof: fallbackZeroSessionProof,
      resetRequired: false,
      created: false,
      source: "fallback",
    };
  } finally {
    window.clearTimeout(timeout);
  }
}

export async function syncSessionIdentityForBoot(
  apiBase: string,
  options?: { attempts?: number; retryDelayMs?: number; timeoutMs?: number }
): Promise<VerifiedSessionIdentity> {
  const attempts = Math.max(1, Math.floor(options?.attempts ?? BOOT_SESSION_SYNC_ATTEMPTS));
  const retryDelayMs = Math.max(0, options?.retryDelayMs ?? BOOT_SESSION_SYNC_RETRY_DELAY_MS);
  let lastSynced: SyncedSessionIdentity | null = null;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const syncOptions: { allowCreate: boolean; reason: string; timeoutMs?: number } = {
      allowCreate: true,
      reason: "app-boot",
    };
    if (options?.timeoutMs !== undefined) {
      syncOptions.timeoutMs = options.timeoutMs;
    }

    lastSynced = await syncSessionIdentity(apiBase, syncOptions);

    if (lastSynced.source !== "fallback" && lastSynced.zeroSessionProof) {
      return lastSynced as VerifiedSessionIdentity;
    }

    if (attempt < attempts - 1 && retryDelayMs > 0) {
      await sleep(retryDelayMs * (attempt + 1));
    }
  }

  throw new Error(
    lastSynced?.zeroSessionProof
      ? "Unable to verify session identity with the server."
      : "Unable to get a verified session from the server."
  );
}

export function getPlayerProfile() {
  return {
    id: getOrCreateSessionId(),
    name: getStoredName()
  };
}

export function getRecentGames(): RecentGame[] {
  try {
    const raw = localStorage.getItem(RECENT_GAMES_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as RecentGame[];
    return parsed
      .filter((entry) => entry.id && entry.code && entry.gameType)
      .sort((a, b) => b.lastPlayedAt - a.lastPlayedAt)
      .slice(0, MAX_RECENT_GAMES);
  } catch {
    return [];
  }
}

export function addRecentGame(entry: Omit<RecentGame, "lastPlayedAt">) {
  const now = Date.now();
  const existing = getRecentGames();
  const deduped = existing.filter(
    (game) => !(game.id === entry.id && game.gameType === entry.gameType)
  );

  const next: RecentGame[] = [
    {
      ...entry,
      code: entry.code.toUpperCase(),
      lastPlayedAt: now
    },
    ...deduped
  ].slice(0, MAX_RECENT_GAMES);

  localStorage.setItem(RECENT_GAMES_KEY, JSON.stringify(next));
}

export function removeRecentGame(id: string, gameType: string) {
  const existing = getRecentGames();
  const filtered = existing.filter(
    (game) => !(game.id === id && game.gameType === gameType)
  );
  if (filtered.length === 0) {
    localStorage.removeItem(RECENT_GAMES_KEY);
  } else {
    localStorage.setItem(RECENT_GAMES_KEY, JSON.stringify(filtered));
  }
}

export function clearRecentGames() {
  localStorage.removeItem(RECENT_GAMES_KEY);
}

export function hasVisited(): boolean {
  return localStorage.getItem(VISITED_KEY) === "1";
}

export function markVisited(): void {
  localStorage.setItem(VISITED_KEY, "1");
}
