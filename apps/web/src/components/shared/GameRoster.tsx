import { useState, type ReactNode } from "react";
import { FiMaximize2, FiMinimize2 } from "react-icons/fi";
import { PlayerCard, type PlayerCardProps } from "./PlayerCard";
import { TeamCard, type TeamCardProps } from "./TeamCard";
import "../../styles/game-kit.css";

/**
 * Who is in the game, under the shell header, in the lobby and during it.
 *
 * No container. A list of players is a heading and then the players; a border
 * round it only adds an edge inside the page's other edges. The heading is a
 * line of small caps and a count, the way the home card's sections label
 * themselves.
 *
 * Condensed by default. The player card already has a small size that says
 * name, face, state and badges in one row, and that is the whole point of a
 * roster; the roomy version is one button away for when someone wants to
 * actually look at everybody.
 *
 * Nothing here knows about scores. What a point means is different in every
 * game, so games pass whatever the card should show and this stays out of it.
 */

interface RosterHeadProps {
  label: ReactNode;
  count: number;
  action?: ReactNode;
  expanded?: boolean;
  onToggle?: () => void;
}

function RosterHead({ label, count, action, expanded, onToggle }: RosterHeadProps) {
  return (
    <div className="gk-roster-head">
      <span className="gk-roster-label">{label}</span>
      <span className="gk-roster-count">{count}</span>

      <span className="gk-roster-gap" />

      {action}

      {onToggle && (
        <button
          type="button"
          className="gk-roster-expand"
          onClick={onToggle}
          aria-expanded={!!expanded}
          aria-label={expanded ? "Show the short list" : "Show the full cards"}
          data-tooltip={expanded ? "Condense" : "Expand"}
          data-tooltip-variant="game"
        >
          {expanded ? <FiMinimize2 aria-hidden="true" /> : <FiMaximize2 aria-hidden="true" />}
        </button>
      )}
    </div>
  );
}

export interface GameRosterProps {
  players: Array<PlayerCardProps>;
  label?: ReactNode;
  /** Sits before the expand button. */
  action?: ReactNode;
  /** Left on, the list can be opened out to full size cards. */
  expandable?: boolean;
  defaultExpanded?: boolean;
  emptyLabel?: string;
  className?: string;
}

export function GameRoster({
  players,
  label = "Players",
  action,
  expandable = true,
  defaultExpanded,
  emptyLabel = "Nobody here yet",
  className = "",
}: GameRosterProps) {
  const [expanded, setExpanded] = useState(!!defaultExpanded);

  return (
    <div className={`gk-roster-block ${className}`.trim()}>
      <RosterHead
        label={label}
        count={players.length}
        action={action}
        expanded={expanded}
        {...(expandable ? { onToggle: () => setExpanded((v) => !v) } : {})}
      />

      {players.length > 0 ? (
        <div className={`gk-roster${expanded ? " gk-roster--roomy" : ""}`}>
          {players.map((player) => (
            <PlayerCard key={player.sessionId} {...player} size={expanded ? "md" : "sm"} />
          ))}
        </div>
      ) : (
        <p className="gk-roster-empty">{emptyLabel}</p>
      )}
    </div>
  );
}

export interface GameTeamRosterProps {
  teams: Array<TeamCardProps>;
  label?: ReactNode;
  action?: ReactNode;
  /** Left on, the teams fold down to their faces and back. */
  expandable?: boolean;
  defaultExpanded?: boolean;
  /** Players who have not picked a side. In a team game that is the state
   *  worth noticing, so they sit apart rather than in with everyone else. */
  bench?: Array<PlayerCardProps>;
  benchLabel?: ReactNode;
  className?: string;
}

export function GameTeamRoster({
  teams,
  label = "Teams",
  action,
  expandable = true,
  defaultExpanded,
  bench,
  benchLabel = "No team yet",
  className = "",
}: GameTeamRosterProps) {
  const [expanded, setExpanded] = useState(!!defaultExpanded);
  const seated = teams.reduce((n, t) => n + (t.players?.length ?? 0), 0);

  return (
    <div className={`gk-roster-block ${className}`.trim()}>
      <RosterHead
        label={label}
        count={seated + (bench?.length ?? 0)}
        action={action}
        expanded={expanded}
        {...(expandable ? { onToggle: () => setExpanded((v) => !v) } : {})}
      />

      {/* Condensed is the team card's own faces row, which is exactly this:
          the team, its colour, and who is on it, in one line. */}
      <div className={`gk-roster gk-roster--teams${expanded ? " gk-roster--roomy" : ""}`}>
        {teams.map((team) => (
          <TeamCard key={team.name} {...team} {...(expanded ? {} : { condensed: true })} />
        ))}
      </div>

      {bench && bench.length > 0 && (
        <div className="gk-bench">
          <span className="gk-roster-label">{benchLabel}</span>
          <div className="gk-roster gk-roster--bench">
            {bench.map((player) => (
              <PlayerCard key={player.sessionId} {...player} size="sm" />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
