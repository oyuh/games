import { nanoid } from "nanoid";

const SESSION_KEY = "games:user-id";
const NAME_KEY = "games:user-name";
const RECENT_GAMES_KEY = "games:recent-games";
const VISITED_KEY = "games:has-visited";
const MAX_RECENT_GAMES = 6;

export type RecentGame = {
  id: string;
  code: string;
  gameType: "imposter" | "password" | "chain_reaction";
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
  return localStorage.getItem(NAME_KEY)?.trim() ?? "";
}

export function setStoredName(name: string) {
  const trimmedName = name.trim();
  if (!trimmedName) {
    localStorage.removeItem(NAME_KEY);
    return;
  }
  localStorage.setItem(NAME_KEY, trimmedName);
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
