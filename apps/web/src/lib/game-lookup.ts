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
