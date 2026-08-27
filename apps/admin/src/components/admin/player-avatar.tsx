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
 * An avatar is two integers stored as base64 "shape.color" in sessions.avatar.
 * The column is written by the client, so it is untrusted: parseAvatar bounds
 * checks both indices against the array lengths and returns null on anything
 * else, and a null falls back to the look derived from the session id. The
 * decoded string is only ever turned into two numbers, never into markup, a
 * style value or a URL.
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
        "inline-grid shrink-0 place-items-center overflow-hidden",
        ring && "ring-2 ring-offset-1 ring-offset-[var(--card)]",
        ring === "online" && "ring-[var(--ok)]",
        ring === "idle" && "ring-[var(--warn)]",
        className,
      )}
      style={
        {
          width: size,
          height: size,
          // Avatars are squircles on the site, not circles. Same knob here so
          // the two can never disagree.
          borderRadius: "var(--avatar-radius)",
          background: bg,
          color: fg,
        } as CSSProperties
      }
    >
      {/* Drawn at 100 so avvvatars' internal maths stays on round numbers,
          then scaled into the slot. Its shapes use currentColor, which the
          style above sets from the palette pair. */}
      <span
        className="pointer-events-none"
        style={{
          transform: `scale(${size / 100})`,
          transformOrigin: "center",
          lineHeight: 0,
        }}
      >
        <Avvvatars value={shapeSeed(look.shape)} style="shape" size={100} />
      </span>
    </span>
  );
}
