import { nanoid } from "nanoid";
import { mutators } from "@games/shared";

const SESSION_KEY = "games:user-id";
const NAME_KEY = "games:user-name";
const RECENT_GAMES_KEY = "games:recent-games";
const VISITED_KEY = "games:has-visited";
const MAX_RECENT_GAMES = 6;

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
  const existing = localStorage.getItem(SESSION_KEY);
  if (existing) {
    return existing;
  }
  const id = nanoid();
  localStorage.setItem(SESSION_KEY, id);
  return id;
}

export function getStoredName() {
  return localStorage.getItem(NAME_KEY)?.replace(/\s/g, "") ?? "";
}

export function setStoredName(name: string) {
  const sanitized = name.replace(/\s/g, "");
  if (!sanitized) {
    localStorage.removeItem(NAME_KEY);
  } else {
    localStorage.setItem(NAME_KEY, sanitized);
  }
  window.dispatchEvent(new CustomEvent("games:name-changed", { detail: sanitized }));
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

export function clearRecentGames() {
  localStorage.removeItem(RECENT_GAMES_KEY);
}

export function hasVisited(): boolean {
  return localStorage.getItem(VISITED_KEY) === "1";
}

export function markVisited(): void {
  localStorage.setItem(VISITED_KEY, "1");
}
