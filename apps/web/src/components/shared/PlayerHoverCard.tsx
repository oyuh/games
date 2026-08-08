import { useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { PlayerAvatar } from "./PlayerAvatar";
import { PlayerCard, type PlayerCardProps } from "./PlayerCard";
import { place } from "./Tooltip";
import "../../styles/player-card.css";

/**
 * A player shrunk to one face or one name, carrying the whole card on hover.
 *
 * The global tooltip is text only, so it cannot show a badge. Rather than
 * teach it to render HTML, the bubble here IS a PlayerCard, which means the
 * hover state can never drift away from the card it is standing in for.
 *
 * Faces suit a board where the players sit on top of something else (the shade
 * grid, the signal map). Names suit a list that is mostly words already: end
 * screens, round history, a log of who guessed what.
 */

export interface PlayerHoverCardProps extends PlayerCardProps {
  /** What sits on the page. The card is what shows on hover either way. */
  trigger?: "avatar" | "name";
  /** Overrides what the name trigger reads. For the places that show some
   *  other handle for a player, a session id say, and still want the face and
   *  the name on hover. */
  label?: ReactNode;
  /** Makes the trigger a button. The card is a hover affordance, so pressing
   *  it has to do something other than open what hovering already opened. */
  onActivate?: () => void;
}

export function PlayerHoverCard({ trigger = "avatar", label, onActivate, ...player }: PlayerHoverCardProps) {
  const anchorRef = useRef<HTMLSpanElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);

  /* The card has to exist before it can be measured, so it renders hidden at
     0,0 for one frame and this puts it where it belongs. Layout effect, not
     effect: the browser must not get a chance to paint the 0,0 pass. */
  useLayoutEffect(() => {
    if (!open || !anchorRef.current || !popRef.current) return;
    const { x, y } = place(
      anchorRef.current.getBoundingClientRect(),
      popRef.current.getBoundingClientRect(),
      "top",
    );
    setAt({ x, y });
  }, [open]);

  function close() {
    setOpen(false);
    setAt(null);
  }

  const classes = [
    "ph",
    `ph--${trigger}`,
    player.you ? "ph--you" : "",
    player.eliminated ? "ph--eliminated" : "",
    player.disconnected ? "ph--offline" : "",
  ].filter(Boolean).join(" ");

  return (
    <>
      <span
        ref={anchorRef}
        className={classes}
        style={player.accent ? ({ "--pc-accent": player.accent } as CSSProperties) : undefined}
        tabIndex={0}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={close}
        onFocus={() => setOpen(true)}
        onBlur={close}
        {...(onActivate
          ? {
              role: "button",
              onClick: onActivate,
              onKeyDown: (e: KeyboardEvent) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onActivate();
                }
              },
            }
          : {})}
      >
        {trigger === "avatar" ? <PlayerAvatar seed={player.sessionId} /> : (label ?? player.name)}
      </span>

      {open && createPortal(
        <div
          ref={popRef}
          className="ph-pop"
          style={{ left: at?.x ?? 0, top: at?.y ?? 0, visibility: at ? "visible" : "hidden" }}
        >
          <PlayerCard {...player} />
        </div>,
        document.body,
      )}
    </>
  );
}
