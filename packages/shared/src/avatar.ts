/**
 * Avatar maths, shared by the web app and the admin panel.
 *
 * An avatar is two integers: a shape index and a colour index, stored as
 * "shape.color" and base64'd into sessions.avatar. Never picked one? Both fall
 * out of a hash of the session id, so every session has a stable avatar
 * whether or not anything was stored.
 *
 * Everything here is pure: no React, no DOM, no storage. The hooks, the
 * localStorage cache and the registry of other players' picks stay in
 * apps/web/src/lib/avatar.ts, which re-exports this file.
 */

export const SHAPE_SEEDS: readonly string[] = ["16","2j","u","1o","f","23","47","1q","2u","1p","3t","m","c","3","1n","e","1w","2k","9","10","15","1d","11","13","o","h","26","1c","x","4","3r","i","2","4c","2t","2h","g","14","5","1x","30","p","r","1u","32","t","2m","8","1g","12","n","22","7","k","1","0","4m","d","l"];

// Marker color palette. Used for the dots on the Shade grid and the pins on
// the Location map, where players need telling apart at a glance. Nothing to
// do with the avatar art, which brings its own colors.
export const AVATAR_COLORS = [
  "#FF6B6B",  // Bright Red
  "#4ECDC4",  // Turquoise
  "#45B7D1",  // Sky Blue
  "#FFA07A",  // Light Salmon
  "#98D8C8",  // Mint
  "#F7DC6F",  // Golden Yellow
  "#BB8FCE",  // Lavender
  "#85C1E2",  // Powder Blue
  "#F8B88B",  // Peach
  "#52C4A6",  // Emerald
  "#FF85A1",  // Hot Pink
  "#A6CC9D",  // Sage Green
  "#FFB84D",  // Tangerine
  "#6C5CE7",  // Deep Purple
  "#00B894"   // Organic Green
];

function colorAt(index: number): string {
  return AVATAR_COLORS[index % AVATAR_COLORS.length] ?? AVATAR_COLORS[0] ?? "#4ECDC4";
}

/**
 * Get marker color for a player based on their index in the players array
 * Cycles through the color palette to ensure distinct colors within a game
 */
export function getPlayerColor(playerIndex: number): string {
  return colorAt(playerIndex);
}

/* ── Chosen avatar ──────────────────────────────────────────────
   An avatar is a shape and a color, picked independently. avvvatars hashes
   both out of one string and exposes no way to set either, so we drive it
   sideways: SHAPE_SEEDS holds a string that lands on each shape, and the
   colors get overridden in CSS (its shapes are drawn in currentColor).

   Stored as "shape.color", e.g. "12.4". Unpicked, both fall out of a hash of
   the session id, so everyone still has a stable avatar without storing
   anything. */

const AVATAR_KEY = "games:user-avatar";
const AVATAR_EVENT = "games:avatar-changed";

export interface AvatarLook {
  /** Index into SHAPE_SEEDS. */
  shape: number;
  /** Index into AVATAR_PALETTE. */
  color: number;
}

/** avvvatars' own pairings: a pale ground with a saturated shape on it. */
export const AVATAR_PALETTE: ReadonlyArray<{ bg: string; fg: string }> = [
  { bg: "#F7F9FC", fg: "#060A23" },
  { bg: "#EEEDFD", fg: "#5E36F5" },
  { bg: "#FFEBEE", fg: "#E11234" },
  { bg: "#FDEFE2", fg: "#E87917" },
  { bg: "#E7F9F3", fg: "#3EA884" },
  { bg: "#EDEEFD", fg: "#0618BC" },
  { bg: "#ECFAFE", fg: "#0FBBE6" },
  { bg: "#F2FFD1", fg: "#87B80A" },
  { bg: "#FFF7E0", fg: "#FFC933" },
  { bg: "#FDF1F7", fg: "#EE77AF" },
  { bg: "#EAEFE6", fg: "#69785E" },
  { bg: "#E0E6EB", fg: "#2D3A46" },
  { bg: "#E4E2F3", fg: "#280F6D" },
  { bg: "#E6DFEC", fg: "#37364F" },
  { bg: "#E2F4E8", fg: "#363548" },
  { bg: "#E6EBEF", fg: "#4D176E" },
  { bg: "#EBE6EF", fg: "#AB133E" },
  { bg: "#E8DEF6", fg: "#420790" },
  { bg: "#D8E8F3", fg: "#222A54" },
  { bg: "#ECE1FE", fg: "#192251" },
];

export const AVATAR_SHAPE_COUNT = SHAPE_SEEDS.length;
export const AVATAR_COLOR_COUNT = AVATAR_PALETTE.length;

/** The string to hand avvvatars so it draws this look's shape. */
export function shapeSeed(shape: number): string {
  return SHAPE_SEEDS[shape % AVATAR_SHAPE_COUNT] ?? SHAPE_SEEDS[0]!;
}

export function paletteAt(color: number) {
  return AVATAR_PALETTE[color % AVATAR_COLOR_COUNT] ?? AVATAR_PALETTE[0]!;
}

export function formatAvatar(look: AvatarLook): string {
  return `${look.shape}.${look.color}`;
}

/**
 * Exactly two runs of digits separated by one dot, both in range.
 *
 * The shape matters as much as the range. Number() coerces generously, so
 * splitting and calling it directly accepted "12." as 12.0, ".4" as 0.4,
 * " 1.2" with its leading space, and "1.5.2" by quietly dropping the third
 * part. None of those could index out of bounds, but all of them rendered a
 * face from a value nothing wrote, when the documented behaviour is to fall
 * back to the look derived from the session id.
 */
const AVATAR_CODE = /^(\d+)\.(\d+)$/;

export function parseAvatar(code: string): AvatarLook | null {
  const match = AVATAR_CODE.exec(code);
  if (!match) return null;
  const s = Number(match[1]);
  const c = Number(match[2]);
  if (s >= AVATAR_SHAPE_COUNT || c >= AVATAR_COLOR_COUNT) return null;
  return { shape: s, color: c };
}

/** FNV-1a. Only needs to scatter, so the cheapest thing that does is fine. */
function hash(value: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

/** The look a player gets when they have never picked one. */
export function derivedLook(seed: string): AvatarLook {
  const h = hash(seed);
  return {
    shape: h % AVATAR_SHAPE_COUNT,
    // A second, unrelated slice of the hash, so shape and color do not march
    // together across neighbouring session ids.
    color: (h >>> 11) % AVATAR_COLOR_COUNT,
  };
}


/* -- Wire format ------------------------------------------------
   The build string goes to the database base64'd, so the column stays opaque
   and the build can grow without the server caring what is in it. Both halves
   are pure and available in Node and the browser, so they live here rather
   than with the storage code. */

export function encodeAvatar(code: string): string {
  if (!code) return "";
  try {
    return btoa(code);
  } catch {
    return "";
  }
}

export function decodeAvatar(encoded: string | null | undefined): string {
  if (!encoded) return "";
  try {
    return atob(encoded);
  } catch {
    // Someone hand-edited the column. Fall back to the derived look.
    return "";
  }
}
