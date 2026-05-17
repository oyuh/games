const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

export type ImposterLookupGame = {
  id: string;
  code: string;
  phase: string;
  category: string | null;
  isPublic: boolean;
  hostName: string | null;
  playerCount: number;
  spectatorCount: number;
  createdAt: number;
};

export async function lookupImposterGameByCode(code: string): Promise<ImposterLookupGame | null> {
  const normalizedCode = code.trim().toUpperCase();
  if (!normalizedCode) {
    return null;
  }

  const response = await fetch(`${API_BASE}/api/imposter/lookup?code=${encodeURIComponent(normalizedCode)}`, {
    credentials: "include",
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const payload = await response.json() as { game?: ImposterLookupGame | null };
  return payload.game ?? null;
}
