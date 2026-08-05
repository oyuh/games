import { useState, type CSSProperties, type DragEvent, type ReactNode } from "react";
import { FiChevronDown, FiLock, FiUnlock } from "react-icons/fi";
import { PlayerAvatar } from "./PlayerAvatar";
import { PLAYER_DRAG_TYPE, PlayerCard, type PlayerBadge, type PlayerCardProps, type PlayerCardState } from "./PlayerCard";
import "../../styles/player-card.css";

/**
 * A team, wrapping the player cards that belong to it. Same parts as
 * PlayerCard: a header row with the score behind a hairline, and a badge
 * strip along the bottom. Condensed swaps the roster for a stack of faces.
 */

/** How many faces the condensed stack shows before it gives up and counts. */
const STACK_LIMIT = 3;

export interface TeamCardProps {
  name: string;
  /** The team's color. Tints the header and marks the swatch. */
  color: string;
  /** Rendered at sm inside the card. Left empty you get the empty note. */
  players?: Array<Omit<PlayerCardProps, "size">>;
  score?: number;
  /** Turns the score into "4 / 7". Usually the target score to win. */
  scoreSuffix?: string;
  state?: PlayerCardState;
  badges?: PlayerBadge[];
  /** One short line under the team name. */
  caption?: string;
  /** Faces and score only, no roster. For sidebars and results headers. */
  condensed?: boolean;
  /** Adds a chevron that folds the roster down to the row of faces. Takes
   *  precedence over `onClick`: a card cannot be a button and hold one. */
  collapsible?: boolean;
  /** Start folded. Only means anything alongside `collapsible`. */
  defaultCollapsed?: boolean;
  /** Your team. Same treatment a player card gives you. */
  you?: boolean;
  /** Ring around the card, e.g. the team currently guessing. */
  selected?: boolean;
  /** Makes the whole card a button, for joining or expanding. */
  onClick?: () => void;
  /** Closed to new players. Marks the card and refuses every drop. */
  locked?: boolean;
  /** Adds the padlock the host flips. Without it the lock is display only,
   *  which is what every non-host sees. */
  onToggleLock?: () => void;
  /** Makes the card a drop target for a `movable` player card. Gets the
   *  dragged player's session id. A locked team never calls this. */
  onDropPlayer?: (sessionId: string) => void;
  /** Trailing slot in the header: a join button, a lock icon, a menu. */
  action?: ReactNode;
  /** Anything extra under the roster, e.g. a join row. Above the badges. */
  footer?: ReactNode;
  emptyLabel?: string;
  className?: string;
}

export function TeamCard({
  name,
  color,
  players = [],
  score,
  scoreSuffix,
  state = "default",
  badges,
  caption,
  condensed,
  collapsible,
  defaultCollapsed,
  you,
  selected,
  onClick,
  locked,
  onToggleLock,
  onDropPlayer,
  action,
  footer,
  emptyLabel = "No one yet",
  className = "",
}: TeamCardProps) {
  const [collapsed, setCollapsed] = useState(!!defaultCollapsed);
  const [over, setOver] = useState(false);

  /* Folding a team down is the condensed presentation it already had, so the
     two share one branch instead of the card growing a second small layout. */
  const folded = !!condensed || (!!collapsible && collapsed);

  /* A chevron or a padlock inside a button would be a button in a button. */
  const asButton = !!onClick && !collapsible && !onToggleLock;

  const takesDrops = !!onDropPlayer && !locked;

  const classes = [
    "tc",
    folded ? "tc--condensed" : "",
    collapsible && collapsed ? "tc--folded" : "",
    `tc--${state}`,
    you ? "tc--you" : "",
    selected ? "tc--selected" : "",
    asButton ? "tc--button" : "",
    locked ? "tc--locked" : "",
    over ? "tc--dropping" : "",
    className,
  ].filter(Boolean).join(" ");

  const shown = players.slice(0, STACK_LIMIT);
  const overflow = players.length - shown.length;
  const Tag = asButton ? "button" : "div";

  return (
    <Tag
      className={classes}
      style={{ "--tc-color": color } as CSSProperties}
      {...(asButton ? { type: "button" as const, onClick } : {})}
      {...(takesDrops
        ? {
            onDragOver: (e: DragEvent<HTMLElement>) => {
              /* Only claim the drop if it is actually a player. Anything else
                 (a file, a link, a selection) falls through to the page. */
              if (!e.dataTransfer.types.includes(PLAYER_DRAG_TYPE)) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              setOver(true);
            },
            /* dragleave also fires crossing into a child, so ignore the ones
               where the pointer is still somewhere inside this card. */
            onDragLeave: (e: DragEvent<HTMLElement>) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false);
            },
            onDrop: (e: DragEvent<HTMLElement>) => {
              const id = e.dataTransfer.getData(PLAYER_DRAG_TYPE);
              setOver(false);
              if (!id) return;
              e.preventDefault();
              onDropPlayer?.(id);
            },
          }
        : {})}
    >
      <span className="tc-head">
        <span className="tc-swatch" aria-hidden="true" />
        <span className="tc-title">
          <span className="tc-name">{name}</span>
          {caption && <span className="tc-caption">{caption}</span>}
        </span>

        {folded && players.length > 0 && (
          <span className="tc-stack" aria-label={`${players.length} players`}>
            {shown.map((player) => (
              <span className="tc-face" key={player.sessionId} data-tooltip={player.name} data-tooltip-variant="game">
                <PlayerAvatar seed={player.sessionId} />
              </span>
            ))}
            {overflow > 0 && <span className="tc-face tc-face--more">+{overflow}</span>}
          </span>
        )}

        {score !== undefined && (
          <span className="pc-points tc-score">
            <span className="pc-points-value">{score}</span>
            {scoreSuffix && <span className="pc-points-suffix">{scoreSuffix}</span>}
          </span>
        )}

        {action && <span className="tc-action">{action}</span>}

        {onToggleLock ? (
          <button
            type="button"
            className="tc-lock"
            onClick={onToggleLock}
            aria-pressed={!!locked}
            aria-label={`${locked ? "Unlock" : "Lock"} ${name}`}
            data-tooltip={locked ? "Locked, nobody new can join" : "Open, anyone can join"}
            data-tooltip-variant="game"
          >
            {locked ? <FiLock aria-hidden="true" /> : <FiUnlock aria-hidden="true" />}
          </button>
        ) : locked && (
          <span
            className="tc-lock tc-lock--static"
            role="img"
            aria-label={`${name} is locked`}
            data-tooltip={`${name} is locked`}
            data-tooltip-variant="game"
          >
            <FiLock aria-hidden="true" />
          </span>
        )}

        {collapsible && (
          <button
            type="button"
            className="tc-toggle"
            onClick={() => setCollapsed((v) => !v)}
            aria-expanded={!collapsed}
            aria-label={`${collapsed ? "Expand" : "Collapse"} ${name}`}
          >
            <FiChevronDown aria-hidden="true" />
          </button>
        )}
      </span>

      {!folded && (
        <span className="tc-body">
          {players.length > 0
            ? players.map((player) => <PlayerCard key={player.sessionId} {...player} size="sm" />)
            : <span className="tc-empty">{emptyLabel}</span>}
        </span>
      )}

      {footer && !folded && <span className="tc-footer">{footer}</span>}

      {badges && badges.length > 0 && (
        <span className="pc-badges">
          {badges.map((badge) => (
            <span
              key={badge.label}
              className={`pc-badge${badge.solid ? " pc-badge--solid" : ""}`}
              style={badge.color ? ({ "--pc-badge": badge.color } as CSSProperties) : undefined}
              data-tooltip={badge.label}
              data-tooltip-variant="game"
            >
              {badge.icon && <span className="pc-badge-icon">{badge.icon}</span>}
              <span className="pc-badge-label">{badge.label}</span>
            </span>
          ))}
        </span>
      )}
    </Tag>
  );
}
