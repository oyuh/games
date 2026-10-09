import { getGameSlugFromPath, type GameSlug } from "@games/shared";
import { useSyncExternalStore } from "react";

export interface Toast {
  id: number;
  message: string;
  level: "error" | "success" | "info";
  /** Sent by an admin, so it wears a shield instead of the level's icon. */
  admin?: boolean;
  /** The game whose page raised it, so it keeps that color after you leave. */
  game: Exclude<GameSlug, "home"> | undefined;
  /** What it's about. Toasts from the same place with the same category stack. */
  category: string;
  createdAt: number;
  /** How long it stays up, in ms, not counting time spent held open. */
  duration: number;
  /** A value shown large under the message that copies on a click, like a room code. */
  copy?: string;
  /** Held open while the pointer or keyboard focus is on it. */
  paused?: boolean;
  /** Set while the exit animation plays, right before the toast is dropped. */
  leaving?: boolean;
}

interface DismissTimer {
  /** Null while the toast is held open. */
  handle: ReturnType<typeof setTimeout> | null;
  remaining: number;
  startedAt: number;
}

let nextId = 0;
let toasts: Toast[] = [];
const listeners = new Set<() => void>();
const TOAST_DURATION = 4500;
const DEDUPE_WINDOW_MS = 1500;
// Matches the toast-out animation in toast.css.
const EXIT_MS = 200;
const dedupeRegistry = new Map<string, number>();
const dismissTimers = new Map<number, DismissTimer>();

function emit() {
  listeners.forEach((l) => l());
}

function patch(id: number, changes: Partial<Toast>) {
  toasts = toasts.map((t) => (t.id === id ? { ...t, ...changes } : t));
  emit();
}

function remove(id: number) {
  const toast = toasts.find((t) => t.id === id);
  if (!toast || toast.leaving) return;
  const timer = dismissTimers.get(id);
  if (timer?.handle) clearTimeout(timer.handle);
  dismissTimers.delete(id);
  patch(id, { leaving: true, paused: false });
  setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== id);
    emit();
  }, EXIT_MS);
}

export interface ToastOptions {
  admin?: boolean;
  /** Groups related toasts into one stack, and labels it. Defaults to the level's. */
  category?: string;
  /** How long it stays up, in ms. Only for a toast you need to read off, like a room code. */
  duration?: number;
  copy?: string;
}

const LEVEL_CATEGORIES: Record<Toast["level"], string> = {
  error: "Errors",
  success: "Success",
  info: "Info",
};

export function showToast(message: string, level: Toast["level"] = "error", options: ToastOptions = {}) {
  const id = ++nextId;
  const admin = options.admin === true;
  // An admin's message comes from outside any game, so it keeps the site color.
  const slug = admin ? "home" : getGameSlugFromPath(window.location.pathname);
  const game = slug === "home" ? undefined : slug;
  const category = options.category ?? LEVEL_CATEGORIES[level];
  const duration = options.duration ?? TOAST_DURATION;
  toasts = [...toasts, { id, message, level, admin, game, category, createdAt: Date.now(), duration, ...(options.copy ? { copy: options.copy } : {}) }];
  emit();
  dismissTimers.set(id, {
    handle: setTimeout(() => remove(id), duration),
    remaining: duration,
    startedAt: Date.now(),
  });
}

export function showDedupedToast(message: string, level: Toast["level"] = "error", options: ToastOptions = {}) {
  const key = `${level}:${message}`;
  const now = Date.now();
  const lastShownAt = dedupeRegistry.get(key) ?? 0;
  if (now - lastShownAt < DEDUPE_WINDOW_MS) {
    return;
  }
  dedupeRegistry.set(key, now);
  showToast(message, level, options);
}

export function dismissToast(id: number) {
  remove(id);
}

/** Stops the dismiss clock so a toast being read or reached for stays put. */
export function pauseToast(id: number) {
  const timer = dismissTimers.get(id);
  if (!timer || timer.handle === null) return;
  clearTimeout(timer.handle);
  timer.handle = null;
  timer.remaining = Math.max(0, timer.remaining - (Date.now() - timer.startedAt));
  patch(id, { paused: true });
}

/** Restarts the dismiss clock with whatever time the toast had left. */
export function resumeToast(id: number) {
  const timer = dismissTimers.get(id);
  if (!timer || timer.handle !== null) return;
  timer.startedAt = Date.now();
  timer.handle = setTimeout(() => remove(id), timer.remaining);
  patch(id, { paused: false });
}

export function useToasts(): Toast[] {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => toasts,
  );
}
