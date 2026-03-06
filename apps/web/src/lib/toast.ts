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
