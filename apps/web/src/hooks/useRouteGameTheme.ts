import { getGameSlugFromPath, type GameSlug } from "@games/shared";
import { useLocation } from "react-router-dom";

/**
 * The game the current route belongs to, as a data-game-theme value, or
 * undefined off a game. For UI that sits outside the themed .game-page, like
 * the toast stacks, so it can still pick up the game's color.
 */
export function useRouteGameTheme(): Exclude<GameSlug, "home"> | undefined {
  const slug = getGameSlugFromPath(useLocation().pathname);
  return slug === "home" ? undefined : slug;
}
