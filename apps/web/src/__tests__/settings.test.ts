/**
 * Tests for user settings (theme & sidebar persistence).
 *
 * settings.ts calls `document.setAttribute` at module level, so we must
 * install DOM mocks before the module is loaded. We use vi.hoisted() to
 * guarantee the mocks run before any import is evaluated.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { setAttrMock, localStorageMock, store } = vi.hoisted(() => {
  const store: Record<string, string> = {};
  const setAttrMock = vi.fn();
  const localStorageMock = {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
    removeItem: vi.fn((key: string) => { delete store[key]; }),
    clear: vi.fn(() => { for (const k of Object.keys(store)) delete store[k]; }),
    get length() { return Object.keys(store).length; },
    key: vi.fn((i: number) => Object.keys(store)[i] ?? null),
  };
  (globalThis as any).localStorage = localStorageMock;
  (globalThis as any).document = { documentElement: { setAttribute: setAttrMock } };
  return { setAttrMock, localStorageMock, store };
});

import { getSettings, updateSettings, type Theme, type SidebarPosition } from "../lib/settings";

beforeEach(() => {
  for (const k of Object.keys(store)) delete store[k];
  localStorageMock.getItem.mockClear();
  localStorageMock.setItem.mockClear();
  setAttrMock.mockClear();
});

describe("getSettings", () => {
  it("returns an object with theme and sidebarPosition", () => {
    const s = getSettings();
    expect(s).toHaveProperty("theme");
    expect(s).toHaveProperty("sidebarPosition");
  });

  it("returns defaults when localStorage is empty", () => {
    const s = getSettings();
    expect(s.theme).toBe("dark");
    expect(s.sidebarPosition).toBe("left");
  });
});

describe("updateSettings", () => {
  it("updates theme", () => {
    updateSettings({ theme: "light" });
    const s = getSettings();
    expect(s.theme).toBe("light");
  });

  it("updates sidebarPosition", () => {
    updateSettings({ sidebarPosition: "right" });
    const s = getSettings();
    expect(s.sidebarPosition).toBe("right");
  });

  it("persists to localStorage", () => {
    updateSettings({ theme: "light" });
    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      "games-settings",
      expect.any(String),
    );
    const stored = JSON.parse(store["games-settings"]!);
    expect(stored.theme).toBe("light");
  });

  it("applies theme to document", () => {
    updateSettings({ theme: "light" });
    expect(setAttrMock).toHaveBeenCalledWith("data-theme", "light");
  });

  it("applies sidebar position to document", () => {
    updateSettings({ sidebarPosition: "top" });
    expect(setAttrMock).toHaveBeenCalledWith("data-sidebar", "top");
  });

  it("partial update preserves other fields", () => {
    updateSettings({ theme: "light" });
    updateSettings({ sidebarPosition: "right" });
    const s = getSettings();
    expect(s.theme).toBe("light");
    expect(s.sidebarPosition).toBe("right");
  });
});
