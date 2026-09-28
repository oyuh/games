import { useSyncExternalStore } from "react";

export interface Toast {
  id: number;
  message: string;
  level: "error" | "success" | "info";
  createdAt: number;
  /** How long it stays up, in ms, not counting time spent held open. */
  duration: number;
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

export function showToast(message: string, level: Toast["level"] = "error") {
  const id = ++nextId;
  toasts = [...toasts, { id, message, level, createdAt: Date.now(), duration: TOAST_DURATION }];
  emit();
  dismissTimers.set(id, {
    handle: setTimeout(() => remove(id), TOAST_DURATION),
    remaining: TOAST_DURATION,
    startedAt: Date.now(),
  });
}

export function showDedupedToast(message: string, level: Toast["level"] = "error") {
  const key = `${level}:${message}`;
  const now = Date.now();
  const lastShownAt = dedupeRegistry.get(key) ?? 0;
  if (now - lastShownAt < DEDUPE_WINDOW_MS) {
    return;
  }
  dedupeRegistry.set(key, now);
  showToast(message, level);
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
