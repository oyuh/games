export const HOME_ROUTE_GAMES = ["imposter", "password", "chain", "shade", "location"] as const;

export type HomeRouteGame = (typeof HOME_ROUTE_GAMES)[number];

const HOME_ROUTE_GAME_SET = new Set<string>(HOME_ROUTE_GAMES);

export function getHomeRouteGame(search: string): HomeRouteGame | null {
  const game = new URLSearchParams(search).get("game");
  return game && HOME_ROUTE_GAME_SET.has(game) ? (game as HomeRouteGame) : null;
}
