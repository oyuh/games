import { useEffect, useRef } from "react";
import type { Difficulty } from "./shikaku-engine";
import type { PipsDifficulty } from "./pips-engine";

/**
 * Typed channel between the solo game pages (Pips, Shikaku) and the chrome
 * around them: the mobile shell's action sheet and the desktop floating
 * header. Both of those sit outside the page's React tree and one is behind
 * a lazy boundary, so this stays a window event rather than a context.
 *
 * What the module buys is that the payload shapes live next to the event
 * names. MobileLayout used to hand-mirror these state objects and nothing
 * checked that the two sides still agreed on them.
 */

export type ShikakuPhase =
  | "menu"
  | "generating"
  | "countdown"
  | "playing"
  | "puzzle-complete"
  | "finished";

export type PipsPhase = "menu" | "countdown" | "playing" | "complete";
export type PipsRunMode = "ranked" | "seeded" | "infinite";

export interface ShikakuState {
  phase: ShikakuPhase;
  infiniteMode: boolean;
  customMode: boolean;
  challengeMode: boolean;
  showSeedInput: boolean;
  difficulty: Difficulty;
  seed: number | null;
  canUndo: boolean;
  canClear: boolean;
  canRestart: boolean;
  canGiveUp: boolean;
  canLeaderboard: boolean;
  showScrollControls: boolean;
  canScroll: { up: boolean; down: boolean; left: boolean; right: boolean };
}

export interface PipsState {
  phase: PipsPhase;
  runMode: PipsRunMode;
  difficulty: PipsDifficulty;
  puzzleIndex: number;
  puzzleCount: number;
  placedCount: number;
  totalDominoes: number;
  remainingMoves: number;
  solved: boolean;
  canLeaderboard: boolean;
  canUndo: boolean;
  showDevTools: boolean;
  canDevSkip: boolean;
}

/**
 * Every event on the bus. `void` means the event carries no payload.
 *
 * Keep this list to events with a live sender and a live receiver. Typing the
 * bus turned up three that had only one side (shikaku-toggle-infinite,
 * shikaku-infinite-state, shikaku-open-info) and they have been removed.
 */
export interface SoloEventMap {
  // page -> chrome
  "shikaku-game-state": ShikakuState;
  "shikaku-open-leaderboard": void;
  "pips-game-state": PipsState;

  // chrome -> page
  "shikaku-undo": void;
  "shikaku-clear-board": void;
  "shikaku-restart-run": void;
  "shikaku-give-up": void;
  "shikaku-toggle-leaderboard": void;
  "shikaku-scroll-up": void;
  "shikaku-scroll-down": void;
  "shikaku-scroll-left": void;
  "shikaku-scroll-right": void;
  "pips-undo": void;
  "pips-restart-run": void;
  "pips-give-up": void;
  "pips-toggle-leaderboard": void;
  "pips-dev-solution": void;
  "pips-dev-skip": void;
}

export type SoloEvent = keyof SoloEventMap;

type Args<K extends SoloEvent> = SoloEventMap[K] extends void ? [] : [SoloEventMap[K]];

export function emitSolo<K extends SoloEvent>(name: K, ...[detail]: Args<K>) {
  window.dispatchEvent(new CustomEvent(name, { detail }));
}

export function onSolo<K extends SoloEvent>(
  name: K,
  handler: (detail: SoloEventMap[K]) => void,
): () => void {
  const listener = (event: Event) => handler((event as CustomEvent).detail);
  window.addEventListener(name, listener);
  return () => window.removeEventListener(name, listener);
}

/**
 * Subscribe for the lifetime of the component. The handler is read through a
 * ref, so it always sees current state without the listener resubscribing and
 * without every dependency having to be spelled out in a deps array. The old
 * hand-written listeners got this wrong in a couple of places.
 */
export function useSoloEvent<K extends SoloEvent>(
  name: K,
  handler: (detail: SoloEventMap[K]) => void,
): void {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => onSolo(name, (detail) => ref.current(detail)), [name]);
}
