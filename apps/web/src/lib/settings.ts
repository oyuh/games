import { useSyncExternalStore } from "react";

export type Theme = "dark" | "light";
export type SidebarPosition = "left" | "right" | "top";

export interface Settings {
  theme: Theme;
  sidebarPosition: SidebarPosition;
}

const STORAGE_KEY = "games-settings";

const defaults: Settings = {
  theme: "dark",
  sidebarPosition: "left",
};

let current: Settings = load();

const listeners = new Set<() => void>();

function load(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...defaults };
    return { ...defaults, ...JSON.parse(raw) };
  } catch {
    return { ...defaults };
  }
}

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
}

function emit() {
  listeners.forEach((l) => l());
}

export function getSettings(): Settings {
  return current;
}

export function updateSettings(patch: Partial<Settings>) {
  current = { ...current, ...patch };
  persist();
  applyTheme(current.theme);
  applySidebarPosition(current.sidebarPosition);
  emit();
}

function applyTheme(theme: Theme) {
  document.documentElement.setAttribute("data-theme", theme);
}

function applySidebarPosition(pos: SidebarPosition) {
  document.documentElement.setAttribute("data-sidebar", pos);
}

// Apply on load
applyTheme(current.theme);
applySidebarPosition(current.sidebarPosition);

export function useSettings(): Settings {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => current,
  );
}
