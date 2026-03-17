import { useSyncExternalStore } from "react";

export interface Toast {
  id: number;
  message: string;
  level: "error" | "success" | "info";
  createdAt: number;
}

let nextId = 0;
let toasts: Toast[] = [];
const listeners = new Set<() => void>();
const TOAST_DURATION = 4500;
const DEDUPE_WINDOW_MS = 1500;
const dedupeRegistry = new Map<string, number>();

function emit() {
  listeners.forEach((l) => l());
}

function remove(id: number) {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

export function showToast(message: string, level: Toast["level"] = "error") {
  const id = ++nextId;
  toasts = [...toasts, { id, message, level, createdAt: Date.now() }];
  emit();
  setTimeout(() => remove(id), TOAST_DURATION);
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

export function useToasts(): Toast[] {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => toasts,
  );
}
