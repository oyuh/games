import { useEffect, useRef, useState, type CSSProperties } from "react";

interface Box {
  r: number;
  c: number;
  w: number;
  h: number;
}

/* The same 4x4 How to Play teaches on: a 4 across the top, a 2 under it, the
   6 down the right, and a 4 in the bottom left. */
const NUMBERS: Record<string, number> = { "0:2": 4, "1:1": 2, "2:3": 6, "3:1": 4 };
const RECTS: Box[] = [
  { r: 0, c: 0, w: 4, h: 1 },
  { r: 1, c: 0, w: 2, h: 1 },
  { r: 1, c: 2, w: 2, h: 3 },
  { r: 2, c: 0, w: 2, h: 2 },
];
const COLORS = ["var(--card-accent)", "#38bdf8", "#a78bfa", "#f472b6"];

const STEP_MS = 190;
/** How many steps the finished board holds before it starts over. */
const HOLD_STEPS = 8;

/**
 * Every frame of the loop, worked out once: each rectangle is dragged out
 * square by square, across then down, the way a player draws it, then locks
 * in before the next one starts.
 */
const FRAMES: { placed: number; dragging: Box | null }[] = RECTS.flatMap((rect, index) => {
  const corners = [
    ...Array.from({ length: rect.w }, (_, i) => ({ r: rect.r, c: rect.c + i })),
    ...Array.from({ length: rect.h - 1 }, (_, j) => ({ r: rect.r + j + 1, c: rect.c + rect.w - 1 })),
  ];
  return [
    ...corners.map((corner) => ({
      placed: index,
      dragging: { r: rect.r, c: rect.c, w: corner.c - rect.c + 1, h: corner.r - rect.r + 1 },
    })),
    { placed: index + 1, dragging: null },
  ];
});

const inBox = (box: Box, r: number, c: number) => r >= box.r && r < box.r + box.h && c >= box.c && c < box.c + box.w;

/**
 * The Shikaku card's preview. Hovering the card pauses it, like the other
 * cards, and reduced motion gets the solved board standing still.
 */
export function ShikakuPreview() {
  const ref = useRef<HTMLDivElement>(null);
  const [tick, setTick] = useState(0);
  const [still] = useState(() => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false);

  useEffect(() => {
    if (still) return;
    const id = window.setInterval(() => {
      if (ref.current?.closest(".solo-card")?.matches(":hover")) return;
      setTick((t) => (t + 1) % (FRAMES.length + HOLD_STEPS));
    }, STEP_MS);
    return () => window.clearInterval(id);
  }, [still]);

  const frame = still || tick >= FRAMES.length ? { placed: RECTS.length, dragging: null } : FRAMES[tick]!;
  const solved = frame.placed === RECTS.length;

  return (
    <div className="solo-preview-shikaku" ref={ref} data-solved={solved ? "" : undefined} aria-hidden="true">
      {Array.from({ length: 16 }, (_, index) => {
        const r = Math.floor(index / 4);
        const c = index % 4;
        const owner = RECTS.slice(0, frame.placed).findIndex((rect) => inBox(rect, r, c));
        const number = NUMBERS[`${r}:${c}`];
        return (
          <div
            key={index}
            className={`solo-shikaku-cell${number ? " solo-shikaku-num" : ""}`}
            data-filled={owner === -1 ? undefined : ""}
            data-dragging={frame.dragging && inBox(frame.dragging, r, c) ? "" : undefined}
            style={owner === -1 ? undefined : ({ "--rect-color": COLORS[owner] } as CSSProperties)}
          >
            {number}
          </div>
        );
      })}
    </div>
  );
}
