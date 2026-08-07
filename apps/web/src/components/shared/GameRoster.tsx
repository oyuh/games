import type { ReactNode } from "react";
import { FiUsers } from "react-icons/fi";
import { GameEmpty, GamePanel } from "./GameKit";
import { PlayerCard, type PlayerCardProps, type PlayerCardSize } from "./PlayerCard";
import { TeamCard, type TeamCardProps } from "./TeamCard";
import "../../styles/game-kit.css";

/**
 * Who is in the game, under the shell header, in the lobby and during it.
 *
 * The point is room. A roster squeezed into a sidebar turns the player card
 * into a line of text with a face on it, and the card is carrying state,
 * points and badges that are worth seeing. So this lays out across the full
 * width and wraps, rather than stacking one narrow column.
 *
 * Team games get their own version below, since for them the unit is a team
 * and the loose players are the exception rather than the whole list.
 */

export interface GameRosterProps {
  players: Array<PlayerCardProps>;
  /** md is the lobby default. sm is for a long list mid-game. */
  size?: PlayerCardSize;
  title?: ReactNode;
  /** Right of the heading. Left off, it shows how many are here. */
  action?: ReactNode;
  footer?: ReactNode;
  emptyTitle?: string;
  emptyHint?: string;
  /** Narrowest a card may get before the row drops a column. */
  min?: string;
  className?: string;
}

export function GameRoster({
  players,
  size = "md",
  title = "Players",
  action,
  footer,
  emptyTitle = "Nobody here yet",
  emptyHint = "Share the code and they will turn up in this list.",
  min,
  className = "",
}: GameRosterProps) {
  return (
    <GamePanel
      title={title}
      action={action ?? <span className="gk-roster-count">{players.length}</span>}
      {...(footer ? { footer } : {})}
      className={className}
    >
      {players.length > 0 ? (
        <div className="gk-roster" style={min ? { "--gk-roster-min": min } as React.CSSProperties : undefined}>
          {players.map((player) => (
            <PlayerCard key={player.sessionId} {...player} size={size} />
          ))}
        </div>
      ) : (
        <GameEmpty icon={<FiUsers />} title={emptyTitle} hint={emptyHint} />
      )}
    </GamePanel>
  );
}

export interface GameTeamRosterProps {
  teams: Array<TeamCardProps>;
  title?: ReactNode;
  action?: ReactNode;
  footer?: ReactNode;
  /** Every team gets a chevron, for a lobby with more teams than room. */
  collapsible?: boolean;
  /** Players who have not picked a side. Shown under the teams, because in a
   *  team game being on no team is the state worth noticing. */
  bench?: Array<PlayerCardProps>;
  benchLabel?: string;
  min?: string;
  className?: string;
}

export function GameTeamRoster({
  teams,
  title = "Teams",
  action,
  footer,
  collapsible,
  bench,
  benchLabel = "Not on a team yet",
  min,
  className = "",
}: GameTeamRosterProps) {
  const seated = teams.reduce((n, t) => n + (t.players?.length ?? 0), 0);

  return (
    <GamePanel
      title={title}
      action={action ?? <span className="gk-roster-count">{seated + (bench?.length ?? 0)}</span>}
      {...(footer ? { footer } : {})}
      className={className}
    >
      <div className="gk-roster gk-roster--teams" style={min ? { "--gk-roster-min": min } as React.CSSProperties : undefined}>
        {teams.map((team) => (
          <TeamCard key={team.name} {...team} {...(collapsible ? { collapsible: true } : {})} />
        ))}
      </div>

      {bench && bench.length > 0 && (
        <div className="gk-bench">
          <p className="gk-bench-label">{benchLabel}</p>
          <div className="gk-roster gk-roster--bench">
            {bench.map((player) => (
              <PlayerCard key={player.sessionId} {...player} size="sm" />
            ))}
          </div>
        </div>
      )}
    </GamePanel>
  );
}
