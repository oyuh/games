import { useEffect, useRef } from "react";
import { useSettings } from "../lib/settings";
import {
  playCountdownGo,
  playCountdownTick,
  playCorrect,
  playGameOver,
  playGameStart,
  playPhaseChange,
  playReveal,
  playSubmit,
  playVictory,
  playWrong,
  playYourTurn,
} from "../lib/sounds";

/**
 * Watches a game's phase and fires sound effects on transitions.
 * Call this once per game page — it deduplicates via refs.
 */
export function useGameSounds({
  phase,
  sessionId,
  isMyTurn,
  phaseEndsAt,
}: {
  /** Current game phase string */
  phase: string | undefined;
  /** Local player session id */
  sessionId: string;
  /** Whether it's currently the local player's turn to act */
  isMyTurn?: boolean;
  /** Timestamp when the current phase ends (for timer warning) */
  phaseEndsAt?: number | null;
}) {
  const { soundEnabled } = useSettings();
  const prevPhaseRef = useRef<string | undefined>(undefined);
  const prevIsMyTurnRef = useRef<boolean | undefined>(undefined);

  // Phase transition sounds
  useEffect(() => {
    if (!soundEnabled || !phase) return;
    const prev = prevPhaseRef.current;
    prevPhaseRef.current = phase;

    // Skip initial mount (no previous phase)
    if (prev === undefined) return;
    // Skip if phase hasn't actually changed
    if (prev === phase) return;

    // Game start
    if (prev === "lobby" && phase !== "ended") {
      playGameStart();
      return;
    }

    // Game finished / results
    if (phase === "finished" || phase === "ended") {
      playGameOver();
      return;
    }

    // Results phase (Imposter voting results, etc.)
    if (phase === "results") {
      playReveal();
      return;
    }

    // Reveal phase (Signal games)
    if (phase === "reveal") {
      playReveal();
      return;
    }

    // Countdown
    if (phase === "countdown") {
      playCountdownTick();
      return;
    }

    // Generic phase change
    playPhaseChange();
  }, [phase, soundEnabled]);

  // "Your turn" sound
  useEffect(() => {
    if (!soundEnabled) return;
    const prev = prevIsMyTurnRef.current;
    prevIsMyTurnRef.current = isMyTurn;
    if (prev === undefined) return;
    if (!prev && isMyTurn) {
      playYourTurn();
    }
  }, [isMyTurn, soundEnabled]);
}

/** Play submission sound (call directly from submit handlers) */
export { playSubmit as playSoundSubmit };
/** Play correct answer sound */
export { playCorrect as playSoundCorrect };
/** Play wrong answer sound */
export { playWrong as playSoundWrong };
/** Play victory sound */
export { playVictory as playSoundVictory };
/** Play countdown tick */
export { playCountdownTick as playSoundCountdownTick };
/** Play countdown go */
export { playCountdownGo as playSoundCountdownGo };
/** Play reveal */
export { playReveal as playSoundReveal };
