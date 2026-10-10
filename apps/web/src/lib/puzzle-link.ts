import { showToast } from "./toast";

const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

/**
 * Hands out the share page for a seed: the phone's share sheet on a touch
 * screen, the clipboard everywhere else. `params` is the page's query, e.g.
 * { seed, difficulty } for Zip or { seed } for Pips.
 */
export async function sharePuzzle(game: "shikaku" | "pips" | "zip", params: Record<string, string | number>) {
  const query = new URLSearchParams(Object.entries(params).map(([key, value]) => [key, String(value)]));
  const url = `${API_BASE}/api/${game}/puzzle?${query}`;
  if (navigator.share && matchMedia("(pointer: coarse)").matches) {
    try {
      await navigator.share({ url });
      return;
    } catch (error) {
      // Closing the sheet isn't a failure; anything else falls back to copying.
      if (error instanceof DOMException && error.name === "AbortError") return;
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    showToast("Share link copied", "success");
  } catch {
    showToast("Could not copy the share link", "error");
  }
}

/**
 * The API's share pages (/api/<game>/puzzle) send players here as
 * ?from=puzzle&seed=N, plus &difficulty= where the game has one and
 * &challenge=1 for Shikaku's single board. Null when the visit didn't come
 * from one; seed is null when the link carried a bad one.
 */
export interface PuzzleLink<D extends string> {
  seed: number | null;
  difficulty: D | null;
  challenge: boolean;
}

export function readPuzzleLink<D extends string>(search: string, difficulties: readonly D[] = []): PuzzleLink<D> | null {
  const params = new URLSearchParams(search);
  if (params.get("from") !== "puzzle") return null;
  const seed = Number(params.get("seed"));
  const raw = params.get("difficulty");
  return {
    seed: Number.isInteger(seed) && seed > 0 && seed <= 2_147_483_647 ? seed : null,
    difficulty: difficulties.find((d) => d === raw) ?? null,
    challenge: params.get("challenge") === "1",
  };
}
