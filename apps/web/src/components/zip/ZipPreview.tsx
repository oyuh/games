import { useEffect, useRef, useState } from "react";
import { ZipBoard } from "./ZipBoard";
import type { ZipPuzzle } from "../../lib/zip-engine";

/* A snake through a 4x4, the same board How to Play teaches on. */
const PREVIEW: ZipPuzzle = {
  size: 4,
  checkpoints: [0, 3, 5, 10, 12],
  walls: [],
  solution: [0, 1, 2, 3, 7, 6, 5, 4, 8, 9, 10, 11, 15, 14, 13, 12],
};

const STEP_MS = 260;
/** How many steps the finished board holds before it starts over. */
const HOLD_STEPS = 6;
/** Where the line sits for anyone who asked for less motion. */
const STILL_LENGTH = 10;

/**
 * The home card's preview: the line draws itself one square at a time, the
 * board goes green, and it starts over. Hovering the card pauses it, like the
 * other cards' previews, and reduced motion gets a still frame.
 */
export function ZipPreview() {
  const ref = useRef<HTMLDivElement>(null);
  const [tick, setTick] = useState(0);
  const [still] = useState(() => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false);

  useEffect(() => {
    if (still) return;
    const id = window.setInterval(() => {
      if (ref.current?.closest(".solo-card")?.matches(":hover")) return;
      setTick((t) => (t + 1) % (PREVIEW.solution.length + HOLD_STEPS));
    }, STEP_MS);
    return () => window.clearInterval(id);
  }, [still]);

  const length = still ? STILL_LENGTH : Math.min(tick + 1, PREVIEW.solution.length);
  const path = PREVIEW.solution.slice(0, length);

  return (
    <div className="solo-preview-zip" ref={ref} aria-hidden="true">
      <ZipBoard puzzle={PREVIEW} path={path} solved={length === PREVIEW.solution.length} size="sm" />
    </div>
  );
}
