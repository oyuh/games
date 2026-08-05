import { useSyncExternalStore } from "react";
import { SHAPE_SEEDS } from "./avatar-shapes";
import { getOrCreateSessionId } from "./session";

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

export function parseAvatar(code: string): AvatarLook | null {
  const [shape, color] = code.split(".");
  const s = Number(shape);
  const c = Number(color);
  if (!Number.isInteger(s) || !Number.isInteger(c) || s < 0 || c < 0) return null;
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

let cached: string | null | undefined;

function ensureCache(): string {
  if (cached === undefined) {
    try {
      cached = localStorage.getItem(AVATAR_KEY);
    } catch {
      cached = null;
    }
  }
  return cached ?? "";
}

export function getStoredAvatar(): string {
  return ensureCache();
}

export function setStoredAvatar(code: string) {
  const next = code.trim();
  cached = next || null;
  try {
    if (next) localStorage.setItem(AVATAR_KEY, next);
    else localStorage.removeItem(AVATAR_KEY);
  } catch {
    // A locked-down browser just means the pick does not survive a reload.
  }
  notify();
}

/* ── Wire format ────────────────────────────────────────────────
   The build string goes to the database base64'd, so the column stays opaque
   and the build can grow without the server caring what is in it. */

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

/* ── Everyone else's avatars ────────────────────────────────────
   Games already query the session rows for their lobby to get names, so they
   hand the avatars off here on the way past rather than threading a prop
   through every card, chip and marker that draws a face. */

const others = new Map<string, string>();

/* Bumped on any avatar change, mine or anyone else's. It is what the hook
   below snapshots: the looks themselves are computed per seed, so a counter is
   the only thing that can tell React "something moved, redraw the faces". */
let version = 0;

function notify() {
  version += 1;
  window.dispatchEvent(new CustomEvent(AVATAR_EVENT));
}

/** Feed the registry from session rows. Cheap to call on every render. */
export function publishAvatars(rows: ReadonlyArray<{ id: string; avatar?: string | null }>) {
  let changed = false;
  for (const row of rows) {
    const code = decodeAvatar(row.avatar);
    if ((others.get(row.id) ?? "") !== code) {
      if (code) others.set(row.id, code);
      else others.delete(row.id);
      changed = true;
    }
  }
  if (changed) notify();
}

function subscribe(onChange: () => void) {
  // Another tab picking a different avatar counts too, but its write went to
  // localStorage behind our back, so drop the cache before reading again.
  const onStorage = () => {
    cached = undefined;
    version += 1;
    onChange();
  };
  window.addEventListener(AVATAR_EVENT, onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(AVATAR_EVENT, onChange);
    window.removeEventListener("storage", onStorage);
  };
}

/** Your own pick, for the picker and for syncing it to your session row. */
export function useStoredAvatar(): string {
  useSyncExternalStore(subscribe, () => version, () => 0);
  return getStoredAvatar();
}

/** Re-renders on every pick, so the whole app follows one source of truth. */
export function useAvatarLook(seed: string): AvatarLook {
  // The counter is the snapshot; the look is derived fresh underneath it.
  useSyncExternalStore(subscribe, () => version, () => 0);
  return avatarLook(seed, getStoredAvatar());
}

/**
 * The look to draw for a given player. Your own row reads local storage, so a
 * pick lands instantly without waiting on a round trip; everyone else comes
 * from the registry, and anyone who never picked falls out of their id.
 */
export function avatarLook(seed: string, chosen: string): AvatarLook {
  let isMe = false;
  try {
    isMe = seed === getOrCreateSessionId();
  } catch {
    isMe = false;
  }
  const code = isMe ? chosen : others.get(seed) ?? "";
  return (code ? parseAvatar(code) : null) ?? derivedLook(seed);
}
