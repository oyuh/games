import { describe, expect, it } from "vitest";
import {
  getPendingGameLoadTimeoutMs,
  getPendingGameMessage,
  getPendingGameTitle,
  hasPendingGameCreate,
  hasPendingGameJoin,
  PENDING_GAME_CREATE_NAV_STATE,
  PENDING_GAME_JOIN_NAV_STATE,
} from "../lib/game-page-load-state";

describe("game page load state", () => {
  it("distinguishes pending create and pending join navigation", () => {
    expect(hasPendingGameCreate(PENDING_GAME_CREATE_NAV_STATE)).toBe(true);
    expect(hasPendingGameJoin(PENDING_GAME_CREATE_NAV_STATE)).toBe(false);
    expect(hasPendingGameCreate(PENDING_GAME_JOIN_NAV_STATE)).toBe(false);
    expect(hasPendingGameJoin(PENDING_GAME_JOIN_NAV_STATE)).toBe(true);
  });

  it("shows join-specific copy while the joined game is catching up", () => {
    expect(getPendingGameTitle(false, true)).toBe("Joining game...");
    expect(getPendingGameMessage(false, true, null, true)).toBe("Waiting for your joined game to appear.");
  });

  it("gives joined games the longer sync grace window", () => {
    expect(getPendingGameLoadTimeoutMs({
      pendingCreate: false,
      pendingJoin: true,
      zeroConnected: true,
      createGraceMs: 12_000,
      lookupGraceMs: 4_000,
    })).toBe(12_000);
    expect(getPendingGameLoadTimeoutMs({
      pendingCreate: false,
      zeroConnected: true,
      createGraceMs: 12_000,
      lookupGraceMs: 4_000,
    })).toBe(4_000);
  });
});
