"use client";

import Avvvatars from "avvvatars-react";
import type { CSSProperties } from "react";
import {
  decodeAvatar,
  derivedLook,
  paletteAt,
  parseAvatar,
  shapeSeed,
} from "@games/shared/avatar";

import { cn } from "@/lib/utils";

/**
 * The same face the player sees on the site.
 *
 * The geometry comes from the `.player-avatar` rules in globals.css, ported
 * from the web app. avvvatars draws a fixed-size tile in colours of its own
 * choosing, so those rules resize every level and repaint it from the two
 * custom properties set here. Scaling the tile with a transform instead looks
 * fine at 100px and pushes the art out of the box at 26, which is how this was
 * broken the first time.
 *
 * An avatar is two integers stored as base64 "shape.color" in sessions.avatar.
 * The column is written by the client, so it is untrusted: parseAvatar bounds
 * checks both indices and returns null on anything else, and a null falls back
 * to the look derived from the session id. The decoded string only ever
 * becomes two numbers, never markup, a style value or a URL.
 */
export function PlayerAvatar({
  sessionId,
  avatar,
  size = 28,
  className,
  ring,
}: {
  /** Seeds the fallback look when nothing was picked. */
  sessionId: string | null | undefined;
  /** The raw base64 column value, if the endpoint returned one. */
  avatar?: string | null;
  size?: number;
  className?: string;
  /** Status ring, for lists that show who is connected. */
  ring?: "online" | "idle" | null;
}) {
  const code = decodeAvatar(avatar);
  const look = (code ? parseAvatar(code) : null) ?? derivedLook(sessionId ?? "");
  const { bg, fg } = paletteAt(look.color);

  return (
    <span
      className={cn(
        "player-avatar",
        ring && "ring-2 ring-offset-1 ring-offset-[var(--card)]",
        ring === "online" && "ring-[var(--ok)]",
        ring === "idle" && "ring-[var(--warn)]",
        className,
      )}
      style={
        {
          width: size,
          height: size,
          "--av-bg": bg,
          "--av-fg": fg,
        } as CSSProperties
      }
    >
      {/* Rendered at 100 so avvvatars' internal maths stays on round numbers.
          The CSS sizes it down to the slot; nothing here scales it. */}
      <Avvvatars value={shapeSeed(look.shape)} style="shape" size={100} />
    </span>
  );
}
