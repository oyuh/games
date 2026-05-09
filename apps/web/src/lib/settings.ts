import { useSyncExternalStore } from "react";

export type Theme = "dark" | "light";
export type SidebarPosition = "left" | "right" | "top";

export interface SoundPreferences {
  hoverSounds: boolean;
  clickSounds: boolean;
  gameNotifications: boolean;
  actionFeedback: boolean;
  playerSounds: boolean;
}

export interface Settings {
  theme: Theme;
  sidebarPosition: SidebarPosition;
  customCursor: boolean;
  customCursorScale: number;
  soundEnabled: boolean;
  soundPreferences: SoundPreferences;
}

const STORAGE_KEY = "games-settings";
export const CURSOR_SCALE_MIN = 0.7;
export const CURSOR_SCALE_MAX = 1.8;
export const CURSOR_SCALE_STEP = 0.05;
const CURSOR_SCALE_DEFAULT = 1;

const defaultSoundPreferences: SoundPreferences = {
  hoverSounds: true,
  clickSounds: true,
  gameNotifications: true,
  actionFeedback: true,
  playerSounds: true,
};

const defaults: Settings = {
  theme: "dark",
  sidebarPosition: "left",
  customCursor: true,
  customCursorScale: CURSOR_SCALE_DEFAULT,
  soundEnabled: false,
  soundPreferences: { ...defaultSoundPreferences },
};

let current: Settings = load();

const listeners = new Set<() => void>();

function load(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return normalizeSettings(defaults);
    const parsed = JSON.parse(raw);
    return normalizeSettings(parsed);
  } catch {
    return normalizeSettings(defaults);
  }
}

function clampCursorScale(value: unknown): number {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return CURSOR_SCALE_DEFAULT;
  return Math.min(CURSOR_SCALE_MAX, Math.max(CURSOR_SCALE_MIN, numeric));
}

function normalizeSettings(input: Partial<Settings>): Settings {
  return {
    ...defaults,
    ...input,
    customCursorScale: clampCursorScale(input.customCursorScale ?? defaults.customCursorScale),
    soundPreferences: { ...defaultSoundPreferences, ...(input.soundPreferences ?? {}) },
  };
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
  current = normalizeSettings({ ...current, ...patch });
  persist();
  applyTheme(current.theme);
  applySidebarPosition(current.sidebarPosition);
  applyCustomCursor(current.customCursor);
  emit();
}

function applyTheme(theme: Theme) {
  document.documentElement.setAttribute("data-theme", theme);
}

function applySidebarPosition(pos: SidebarPosition) {
  document.documentElement.setAttribute("data-sidebar", pos);
}

function applyCustomCursor(enabled: boolean) {
  document.documentElement.setAttribute("data-custom-cursor", enabled ? "on" : "off");
}

// Apply on load
applyTheme(current.theme);
applySidebarPosition(current.sidebarPosition);
applyCustomCursor(current.customCursor);

export function useSettings(): Settings {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => current,
  );
}
