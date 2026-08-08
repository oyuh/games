import { useEffect, useState, type CSSProperties, type DragEvent, type ReactNode } from "react";
import { FaCrown } from "react-icons/fa";
import { FiAlertCircle, FiCheck, FiClock, FiEye, FiMove, FiStar, FiUserX, FiWifiOff, FiZap } from "react-icons/fi";
import { PlayerAvatar } from "./PlayerAvatar";
import "../../styles/player-card.css";

/**
 * What a player drag carries. Lowercase because the drag-and-drop API
 * lowercases every type it is handed, so a mixed-case constant would never
 * match what comes back out on drop.
 */
export const PLAYER_DRAG_TYPE = "application/x-player-id";

/**
 * One player, everywhere. Lobbies, duels, vote lists, results tables all draw
 * this card and only change size + state, so a player looks the same no matter
 * which game you wandered into.
 */

/** Drives the border, the wash and the little corner mark on the avatar. */
export type PlayerCardState = "default" | "waiting" | "success" | "error";

/** sm = condensed row, md = the lobby default, lg = the duel/1v1 portrait. */
export type PlayerCardSize = "sm" | "md" | "lg";

export interface PlayerBadge {
  /** Shown at md/lg. At sm it is the tooltip and only the icon survives. */
  label: string;
  icon?: ReactNode;
  /** Any css color. Team badges pass their team color straight through. */
  color?: string;
  /** Fills the badge in solid instead of the usual tinted outline. */
  solid?: boolean;
}

const TONE = {
  imposter: "#f87171",
  leader: "#fbbf24",
  host: "#7ecbff",
  spectator: "var(--secondary)",
  out: "var(--secondary)",
} as const;

/** The badges every game reaches for, so nobody re-picks the icon and color. */
export const playerBadges = {
  imposter: (label = "Imposter"): PlayerBadge => ({ label, icon: <FiZap />, color: TONE.imposter, solid: true }),
  leader: (label = "Leader"): PlayerBadge => ({ label, icon: <FiStar />, color: TONE.leader }),
  spectator: (label = "Spectating"): PlayerBadge => ({ label, icon: <FiEye />, color: TONE.spectator }),
  out: (label = "Out"): PlayerBadge => ({ label, icon: <FiUserX />, color: TONE.out }),
  team: (name: string, color: string): PlayerBadge => ({ label: name, color, solid: true }),
};

const STATE_MARK: Record<PlayerCardState, ReactNode> = {
  default: null,
  waiting: <FiClock />,
  success: <FiCheck />,
  error: <FiAlertCircle />,
};

export interface PlayerCardProps {
  /** Seeds the avatar. Two players with the same id would look identical. */
  sessionId: string;
  name: string;
  /** Position in the player list. Only used to spread avatar colors apart. */
  index?: number;
  state?: PlayerCardState;
  size?: PlayerCardSize;
  badges?: PlayerBadge[];
  points?: number;
  /** Sits after the points, e.g. "/ 10" for a target score or "pts". */
  pointsSuffix?: string;
  /** Second line under the name. Gets out of the way at sm. */
  caption?: string;
  you?: boolean;
  /**
   * A crown beside the name. Being host is not a role in any of these games,
   * it is who happens to hold the buttons, and as a badge it grew the card a
   * whole second row and put a kink in every lobby it appeared in. One mark
   * next to the name says the same thing and costs no height.
   */
  host?: boolean;
  /** Dashed border, greyed out, name struck through. */
  eliminated?: boolean;
  /** Faded with a wifi mark. Independent of state, someone can drop mid-guess. */
  disconnected?: boolean;
  /** Ring around the card, for the player you are voting for or looking at. */
  selected?: boolean;
  /** Overrides the accent a default-state card uses. Handy for team colors. */
  accent?: string;
  /** Makes the whole card a button. Leave off for a plain display card. */
  onClick?: () => void;
  /** Lets a host pick this player up and drop them on another team. The drag
   *  carries the session id, so a drop target needs nothing from this card. */
  movable?: boolean;
  /** Folds the badge strip down to a bar of its colours, opening again for
   *  ten seconds when you point at the card. For mid-game lists, where the
   *  roles matter less than the room they take up. */
  collapseBadges?: boolean;
  /** Trailing slot: a kick button, a vote count, whatever the game needs. */
  action?: ReactNode;
  tooltip?: string;
  className?: string;
}

export function PlayerCard({
  sessionId,
  name,
  index = 0,
  state = "default",
  size = "md",
  badges,
  points,
  pointsSuffix,
  caption,
  you,
  host,
  eliminated,
  disconnected,
  selected,
  accent,
  onClick,
  movable,
  collapseBadges,
  action,
  tooltip,
  className = "",
}: PlayerCardProps) {
  const mark = STATE_MARK[state];

  /* Pointing at a card opens its badges and leaves them open for ten seconds,
     rather than shutting the moment the pointer slides off. Reading a badge
     should not mean holding still. */
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    if (!revealed) return;
    const id = setTimeout(() => setRevealed(false), 10_000);
    return () => clearTimeout(id);
  }, [revealed]);

  const hasBadges = !!badges && badges.length > 0;
  const folded = !!collapseBadges && hasBadges && !revealed;
  const classes = [
    "pc",
    `pc--${size}`,
    `pc--${state}`,
    you ? "pc--you" : "",
    eliminated ? "pc--eliminated" : "",
    disconnected ? "pc--offline" : "",
    selected ? "pc--selected" : "",
    onClick ? "pc--button" : "",
    movable ? "pc--movable" : "",
    /* An accent means a team, and a team outranks a state: which side someone
       is on does not stop being true because they are mid-answer. The state
       still shows, on the mark over their face. */
    accent ? "pc--accented" : "",
    collapseBadges && hasBadges ? "pc--folded-badges" : "",
    folded ? "" : "pc--badges-open",
    className,
  ].filter(Boolean).join(" ");

  const style = accent ? ({ "--pc-accent": accent } as CSSProperties) : undefined;
  const Tag = onClick ? "button" : "div";

  return (
    <Tag
      className={classes}
      style={style}
      {...(onClick ? { type: "button" as const, onClick } : {})}
      {...(tooltip ? { "data-tooltip": tooltip, "data-tooltip-variant": "game" } : {})}
      {...(collapseBadges && hasBadges
        ? { onMouseEnter: () => setRevealed(true), onFocus: () => setRevealed(true) }
        : {})}
      {...(movable
        ? {
            draggable: true,
            onDragStart: (e: DragEvent<HTMLElement>) => {
              e.dataTransfer.setData(PLAYER_DRAG_TYPE, sessionId);
              e.dataTransfer.effectAllowed = "move";
            },
          }
        : {})}
    >
      <span className="pc-main">
        {movable && (
          <span className="pc-grip" aria-hidden="true">
            <FiMove />
          </span>
        )}

        <span className="pc-avatar">
          <PlayerAvatar seed={sessionId} />
          {mark && <span className="pc-mark" aria-hidden="true">{mark}</span>}
          {disconnected && !mark && <span className="pc-mark pc-mark--offline" aria-hidden="true"><FiWifiOff /></span>}
        </span>

        <span className="pc-body">
          <span className="pc-name-row">
            {host && (
              <span className="pc-host" data-tooltip="Host" data-tooltip-variant="game">
                <FaCrown aria-label="Host" />
              </span>
            )}
            <span className="pc-name">{name}</span>
            {you && <span className="pc-you">you</span>}
          </span>
          {caption && <span className="pc-caption">{caption}</span>}
        </span>

        {points !== undefined && (
          <span className="pc-points">
            <span className="pc-points-value">{points}</span>
            {pointsSuffix && <span className="pc-points-suffix">{pointsSuffix}</span>}
          </span>
        )}

        {action && <span className="pc-action">{action}</span>}
      </span>

      {/* Folded, the strip is simply not drawn: what someone is already shows
          in the card's own colour, and a bar of badge colours under every name
          was a second, worse way of saying it. Opening animates on the way in;
          there is nothing to animate on the way out, which is a fair trade for
          not having to collapse a box to nothing. */}
      {hasBadges && !folded && (
        <span className={`pc-badges${collapseBadges ? " pc-badges--revealed" : ""}`}>
          {badges!.map((badge) => (
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
