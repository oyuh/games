import { getSessionRequestHeaders } from "./session";

const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

export type GameLookupType = "imposter" | "password" | "chain_reaction" | "shade_signal" | "location_signal";

export type GameLookupResult = {
  gameType: GameLookupType;
  id: string;
  code: string;
  phase: string;
  isPublic: boolean;
  hostName: string | null;
  playerCount: number;
  spectatorCount: number;
  createdAt: number;
};

export function routeForLookupGame(gameType: GameLookupType, gameId: string) {
  if (gameType === "imposter") return `/imposter/${gameId}`;
  if (gameType === "password") return `/password/${gameId}/begin`;
  if (gameType === "chain_reaction") return `/chain/${gameId}`;
  if (gameType === "shade_signal") return `/shade/${gameId}`;
  return `/location/${gameId}`;
}

export async function lookupGameByCode(code: string): Promise<GameLookupResult | null> {
  const normalizedCode = code.trim().toUpperCase();
  if (!normalizedCode) {
    return null;
  }

  const response = await fetch(`${API_BASE}/api/games/lookup?code=${encodeURIComponent(normalizedCode)}`, {
    credentials: "include",
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const payload = await response.json() as { game?: GameLookupResult | null };
  return payload.game ?? null;
}

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export async function waitForJoinedGameAccess(
  gameType: GameLookupType,
  gameId: string,
  sessionId: string,
  {
    timeoutMs = 8_000,
    intervalMs = 250,
  }: { timeoutMs?: number; intervalMs?: number } = {}
) {
  const deadline = Date.now() + timeoutMs;
  const params = new URLSearchParams({ type: gameType, id: gameId, sessionId });

  while (Date.now() < deadline) {
    const response = await fetch(`${API_BASE}/api/games/access?${params.toString()}`, {
      credentials: "include",
      headers: getSessionRequestHeaders(sessionId),
    });

    if (response.ok) {
      const payload = await response.json() as { isAttached?: boolean };
      if (payload.isAttached) {
        return true;
      }
    }

    await wait(intervalMs);
  }

  return false;
}
