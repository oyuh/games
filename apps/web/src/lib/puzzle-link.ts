import { showToast } from "./toast";

/**
 * The share page for a seed. /share/<game> is proxied to the API's
 * /api/<game>/puzzle (functions/_middleware.js, and Vite's dev proxy), so the
 * link stays on this site. `params` is the page's query, e.g.
 * { seed, difficulty } for Zip or { seed } for Pips.
 */
export function puzzleShareUrl(game: "shikaku" | "pips" | "zip", params: Record<string, string | number>) {
  const query = new URLSearchParams(Object.entries(params).map(([key, value]) => [key, String(value)]));
  return `${window.location.origin}/share/${game}?${query}`;
}

/**
 * Hands out the share page for a seed: the phone's share sheet on a touch
 * screen, the clipboard everywhere else.
 */
export async function sharePuzzle(game: "shikaku" | "pips" | "zip", params: Record<string, string | number>) {
  const url = puzzleShareUrl(game, params);
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
 * The share pages (/share/<game>) send players here as
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
