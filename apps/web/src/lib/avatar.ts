import { useSyncExternalStore } from "react";
import {
  AVATAR_SHAPE_COUNT,
  AVATAR_COLOR_COUNT,
  decodeAvatar,
  derivedLook,
  parseAvatar,
  type AvatarLook,
} from "@games/shared/avatar";
import { getOrCreateSessionId } from "./session";

/* The pure half of the avatar system (the palette, the shape seeds, parsing,
   the derived look and the wire format) lives in @games/shared/avatar so the
   admin panel can draw the same faces. Re-exported here so nothing in web has
   to know it moved. */
export * from "@games/shared/avatar";

const AVATAR_KEY = "games:user-avatar";
const AVATAR_EVENT = "games:avatar-changed";

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
