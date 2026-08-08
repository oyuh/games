import { useEffect, useState, type ReactNode } from "react";
import { FiCheck, FiMaximize2, FiMinimize2, FiX } from "react-icons/fi";
import { PlayerCard, type PlayerCardProps } from "./PlayerCard";
import { TeamCard, type TeamCardProps } from "./TeamCard";
import "../../styles/game-kit.css";

/**
 * Who is in the game, under the shell header, in the lobby and during it.
 *
 * No container: a list of players is a heading and then the players. The cards
 * wrap at their own width rather than being stretched into grid columns, which
 * is what .pc-grid was already doing everywhere else.
 *
 * The card does the work. Size says how much room to give it, state colours
 * its edge and marks the face, an accent says which team, and badges fold away
 * until pointed at. None of that is re-invented here.
 *
 * Nothing here knows about scores. What a point means differs per game, so
 * games pass whatever their cards should carry.
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

/**
 * Removing somebody takes two presses. It is a 22 pixel target sitting on a
 * card you also click for other reasons, it cannot be undone, and the person
 * it happens to is thrown out of a game they are in the middle of. The first
 * press arms it and says so; it disarms itself a few seconds later, so a
 * misclick costs nothing and nobody is left holding a live button.
 */
function KickButton({ name, onKick }: { name: string; onKick: () => void }) {
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!armed) return;
    const id = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(id);
  }, [armed]);

  return (
    <button
      type="button"
      className={armed ? "pc-kick--armed" : ""}
      aria-label={armed ? `Confirm removing ${name}` : `Remove ${name}`}
      data-tooltip={armed ? "Press again to remove them" : `Remove ${name}`}
      data-tooltip-variant={armed ? "danger" : "game"}
      onClick={() => {
        if (armed) onKick();
        else setArmed(true);
      }}
      onBlur={() => setArmed(false)}
    >
      {armed ? <FiCheck size={13} /> : <FiX size={13} />}
    </button>
  );
}

export interface GameRosterProps {
  players: Array<PlayerCardProps>;
  label?: ReactNode;
  /** md is the lobby, where there is room to see everyone properly. sm is the
   *  mid-game list, where the point is a glance. */
  size?: "sm" | "md";
  /** Sits before the expand button. */
  action?: ReactNode;
  /** Left on, sm lists can be opened out to full size cards. */
  expandable?: boolean;
  /** Given, every card grows the host's kick button. */
  onKick?: (sessionId: string) => void;
  emptyLabel?: string;
  className?: string;
}

export function GameRoster({
  players,
  label = "Players",
  size = "md",
  action,
  expandable = true,
  onKick,
  emptyLabel = "Nobody here yet",
  className = "",
}: GameRosterProps) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? "md" : size;

  return (
    <div className={`gk-roster-block ${className}`.trim()}>
      <RosterHead
        label={label}
        count={players.length}
        action={action}
        expanded={expanded}
        {...(expandable && size === "sm" ? { onToggle: () => setExpanded((v) => !v) } : {})}
      />

      {players.length > 0 ? (
        <div className={`pc-grid${shown === "md" ? " pc-grid--fill" : ""}`}>
          {players.map((player) => {
            /* Never on your own card. Whoever is handed these is the host, and
               a host who can throw themselves out is a lobby that can end by
               accident. */
            const kickable = onKick && !player.action && !player.you;

            return (
              <PlayerCard
                key={player.sessionId}
                {...player}
                size={shown}
                {...(kickable
                  ? { action: <KickButton name={player.name} onKick={() => onKick(player.sessionId)} /> }
                  : {})}
              />
            );
          })}
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
  /** Teams start folded down to their faces. */
  startFolded?: boolean;
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
  startFolded,
  bench,
  benchLabel = "No team yet",
  className = "",
}: GameTeamRosterProps) {
  const seated = teams.reduce((n, t) => n + (t.players?.length ?? 0), 0);

  return (
    <div className={`gk-roster-block ${className}`.trim()}>
      <RosterHead label={label} count={seated + (bench?.length ?? 0)} action={action} />

      {/* Every team folds on its own. That is what the team card's chevron is
          for, and it beats one switch that opens or shuts all of them. */}
      <div className="tc-grid">
        {teams.map((team) => (
          <TeamCard
            key={team.name}
            {...team}
            collapsible
            {...(startFolded ? { defaultCollapsed: true } : {})}
          />
        ))}
      </div>

      {bench && bench.length > 0 && (
        <div className="gk-bench">
          <span className="gk-roster-label">{benchLabel}</span>
          <div className="pc-grid">
            {bench.map((player) => (
              <PlayerCard key={player.sessionId} {...player} size="sm" />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export interface GameVersusProps {
  /** Two of them. More than two is a roster, not a duel. */
  players: [PlayerCardProps, PlayerCardProps];
  label?: ReactNode;
  /** Sits between the two cards. */
  divider?: ReactNode;
  className?: string;
}

/**
 * Two players facing each other, for Chain Reaction and anything else that
 * comes down to a pair. The lg card was drawn for exactly this: face on top,
 * name under it, and the score behind a rule across the bottom.
 */
export function GameVersus({ players, label, divider = "vs", className = "" }: GameVersusProps) {
  return (
    <div className={`gk-versus-block ${className}`.trim()}>
      {label && (
        <div className="gk-roster-head">
          <span className="gk-roster-label">{label}</span>
        </div>
      )}

      <div className="gk-versus">
        <PlayerCard {...players[0]} size="lg" />
        <span className="gk-versus-mark" aria-hidden="true">{divider}</span>
        <PlayerCard {...players[1]} size="lg" />
      </div>
    </div>
  );
}
