import { GAME_META } from "@games/shared";
import { useRouteGameTheme } from "../../hooks/useRouteGameTheme";
import { GameIcon } from "./GameIcon";

/** What a page shows while its code or its game is still on the way, in the
 *  color and icon of the game the route belongs to. */
export function PageLoading() {
  const game = useRouteGameTheme();

  return (
    <div className="page-loading" data-game-theme={game} role="status" aria-live="polite">
      <span className="page-loading-spinner">
        {game && <GameIcon game={game} size={18} />}
      </span>
      <span className="page-loading-label">
        Loading{game && <> <strong>{GAME_META[game].title}</strong></>}
      </span>
    </div>
  );
}
