import type { CSSProperties, DragEvent, ReactNode } from "react";
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
  host: (label = "Host"): PlayerBadge => ({ label, icon: <FiStar />, color: TONE.host }),
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
  eliminated,
  disconnected,
  selected,
  accent,
  onClick,
  movable,
  action,
  tooltip,
  className = "",
}: PlayerCardProps) {
  const mark = STATE_MARK[state];
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
