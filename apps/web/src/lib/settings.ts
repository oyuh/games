import { useSyncExternalStore } from "react";

export type Theme = "dark" | "light";
export type SidebarPosition = "left" | "right" | "top";
export type SidebarOrientation = "vertical" | "horizontal";

/**
 * Free-placement position for the custom sidebar, stored as fractions of the
 * available travel space: 0 = flush against the start edge, 1 = flush against
 * the end edge, 0.5 = centered. Fraction-based so the bar stays correctly
 * placed across window resizes with no JS recompute.
 */
export interface SidebarCustomPos {
  fx: number;
  fy: number;
}

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
  /** When true, the sidebar is freely placed via `sidebarOrientation` + `sidebarCustomPos` instead of `sidebarPosition`. */
  sidebarCustom: boolean;
  /** Shows the drag tab on the sidebar so it can be repositioned (custom mode only). */
  sidebarDragEnabled: boolean;
  sidebarOrientation: SidebarOrientation;
  sidebarCustomPos: SidebarCustomPos;
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

const defaultSidebarCustomPos: SidebarCustomPos = { fx: 0, fy: 0.5 };

const defaults: Settings = {
  theme: "dark",
  sidebarPosition: "left",
  sidebarCustom: false,
  sidebarDragEnabled: true,
  sidebarOrientation: "vertical",
  sidebarCustomPos: { ...defaultSidebarCustomPos },
  customCursor: false,
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

function normalizeCustomPos(input: unknown): SidebarCustomPos {
  const base = defaultSidebarCustomPos;
  if (!input || typeof input !== "object") return { ...base };
  const p = input as Partial<SidebarCustomPos>;
  const clamp01 = (value: unknown, fallback: number) => {
    const n = Number(value);
    return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : fallback;
  };
  return { fx: clamp01(p.fx, base.fx), fy: clamp01(p.fy, base.fy) };
}

function normalizeSettings(input: Partial<Settings>): Settings {
  return {
    ...defaults,
    ...input,
    sidebarCustom: Boolean(input.sidebarCustom ?? defaults.sidebarCustom),
    sidebarDragEnabled: Boolean(input.sidebarDragEnabled ?? defaults.sidebarDragEnabled),
    sidebarOrientation: input.sidebarOrientation === "horizontal" ? "horizontal" : "vertical",
    sidebarCustomPos: normalizeCustomPos(input.sidebarCustomPos),
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
  applySidebar(current);
  applyCustomCursor(current.customCursor);
  emit();
}

function applyTheme(theme: Theme) {
  document.documentElement.setAttribute("data-theme", theme);
}

function applySidebar(s: Settings) {
  const el = document.documentElement;
  el.setAttribute("data-sidebar", s.sidebarCustom ? "custom" : s.sidebarPosition);
  el.setAttribute("data-sidebar-custom", s.sidebarCustom ? "on" : "off");
  el.setAttribute("data-sidebar-orientation", s.sidebarOrientation);
}

function applyCustomCursor(enabled: boolean) {
  document.documentElement.setAttribute("data-custom-cursor", enabled ? "on" : "off");
}

// Apply on load
applyTheme(current.theme);
applySidebar(current);
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
