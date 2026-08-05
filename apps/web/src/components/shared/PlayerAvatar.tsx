import Avvvatars from "avvvatars-react";
import type { CSSProperties } from "react";
import { paletteAt, shapeSeed, useAvatarLook, type AvatarLook } from "../../lib/avatar";
import "../../styles/player-avatar.css";

/**
 * A player's avatar: one of avvvatars' shapes on one of its color pairs.
 * Unpicked, both fall out of a hash of the session id, so a player looks the
 * same in every game without anything being stored.
 *
 * avvvatars draws at a fixed pixel size and picks its own colors, so the CSS
 * stretches it into whatever slot it landed in and the two vars below repaint
 * it. Pass `size` only when there is no slot to fill.
 */
export function PlayerAvatar({
  seed,
  size,
  className = "",
}: {
  seed: string;
  /** Fixed pixel size. Left off, it fills its container. */
  size?: number;
  className?: string;
}) {
  return <AvatarArt look={useAvatarLook(seed)} size={size} className={className} />;
}

/**
 * The art on its own, for cases with a look in hand rather than a player:
 * the picker's options and its preview.
 */
export function AvatarArt({
  look,
  size,
  className = "",
}: {
  look: AvatarLook;
  size?: number | undefined;
  className?: string;
}) {
  const { bg, fg } = paletteAt(look.color);

  return (
    <span
      className={`player-avatar ${className}`}
      style={{
        "--av-bg": bg,
        "--av-fg": fg,
        ...(size ? { width: size, height: size, flex: "0 0 auto" } : {}),
      } as CSSProperties}
    >
      {/* Rendered at 100 so avvvatars' internal maths stays on round numbers;
          the CSS scales the result to the slot. */}
      <Avvvatars value={shapeSeed(look.shape)} style="shape" size={100} />
    </span>
  );
}
