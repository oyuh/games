import { useEffect, useRef, useState, type CSSProperties } from "react";
import { FiAward, FiCheck, FiClock, FiFlag, FiTarget } from "react-icons/fi";
import { DemoModal, DemoScoring, type DemoStep } from "./DemoModal";
import { GameIcon } from "../shared/GameIcon";
import { validateSolution, type Rect, type ShikakuPuzzle } from "../../lib/shikaku-engine";
import "../../styles/game-shared.css";
import "../../styles/shikaku.css";

/* ── Steps ──────────────────────────────────────────────── */

const steps: DemoStep[] = [
  {
    label: "Pick Difficulty",
    description: "Choose from 4 grid sizes: Easy (5×5), Medium (9×9), Hard (15×15), or Expert (22×22). Click a difficulty to select it, then click again to start.",
    hint: "Bigger grids = higher score multiplier! Easy ×1, Medium ×1.5, Hard ×2.2, Expert ×3.",
  },
  {
    label: "Draw Rectangles",
    description: "Click and drag on the grid to draw a rectangle. Each rectangle must contain exactly one number, and the number must equal the rectangle's area (width × height).",
    hint: "Right-click or click a filled cell to remove a rectangle. Use Undo to revert your last move.",
  },
  {
    label: "Solve All Puzzles",
    description: "Each run has 5 puzzles. Fill the entire grid with valid rectangles to solve a puzzle. A checkmark appears when you get it right!",
    hint: "The timer runs across all 5 puzzles - speed matters for your score!",
  },
  {
    label: "Leaderboard",
    description: "Your score is submitted automatically. Check the leaderboard to see how you rank against other players on each difficulty!",
    hint: "Giving up still submits a score with a penalty - try to finish all 5 puzzles for the best result.",
  },
  {
    label: "Overview",
    description: "A run is worth 5,000 base points (1,000 per puzzle), multiplied by the difficulty and then by how far under par you finished.",
    hint: "Speed bonus is 2 minus your time over par, floored at 0.1. Half par is the 2x cap.",
  },
];

/* ── Demo grid ──────────────────────────────────────────── */

/* A 4x4 with one answer: the top row is the 4, the 2 sits under it, the 6 is
   the right-hand block, and the bottom-left 4 fills what's left. */
const DEMO_PUZZLE: ShikakuPuzzle = {
  rows: 4,
  cols: 4,
  numbers: [
    { r: 0, c: 2, value: 4 },
    { r: 1, c: 1, value: 2 },
    { r: 2, c: 3, value: 6 },
    { r: 3, c: 1, value: 4 },
  ],
  solution: [
    { r: 0, c: 0, w: 4, h: 1 },
    { r: 1, c: 0, w: 2, h: 1 },
    { r: 1, c: 2, w: 2, h: 3 },
    { r: 2, c: 0, w: 2, h: 2 },
  ],
};

const RECT_COLORS = ["#34d399", "#60a5fa", "#f472b6", "#a78bfa"];

/** Where each step's board starts. Every step is live, so you can keep going. */
const STARTS: Rect[][] = [[], DEMO_PUZZLE.solution.slice(0, 2), DEMO_PUZZLE.solution.slice(0, 3), DEMO_PUZZLE.solution];

const inRect = (rect: Rect, r: number, c: number) => r >= rect.r && r < rect.r + rect.h && c >= rect.c && c < rect.c + rect.w;

function rectBetween(a: { r: number; c: number }, b: { r: number; c: number }): Rect {
  return { r: Math.min(a.r, b.r), c: Math.min(a.c, b.c), w: Math.abs(a.c - b.c) + 1, h: Math.abs(a.r - b.r) + 1 };
}

/** Why a dragged rectangle can't go down, or null when it can. */
function rectProblem(rect: Rect, placed: Rect[]): string | null {
  if (placed.some((other) => other.r < rect.r + rect.h && rect.r < other.r + other.h && other.c < rect.c + rect.w && rect.c < other.c + other.w)) {
    return "Rectangles can't overlap.";
  }
  const inside = DEMO_PUZZLE.numbers.filter((n) => inRect(rect, n.r, n.c));
  if (inside.length !== 1) return "Each rectangle needs exactly one number.";
  if (inside[0]!.value !== rect.w * rect.h) return `That one covers ${rect.w * rect.h} squares, but its number is ${inside[0]!.value}.`;
  return null;
}

function DemoGrid({ step }: { step: number }) {
  const gridRef = useRef<HTMLDivElement>(null);
  const [placed, setPlaced] = useState<Rect[]>(STARTS[step] ?? []);
  const [anchor, setAnchor] = useState<{ r: number; c: number } | null>(null);
  const [hover, setHover] = useState<{ r: number; c: number } | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // A new step resets the board to that step's starting rectangles.
  useEffect(() => {
    setPlaced(STARTS[step] ?? []);
    setAnchor(null);
    setMessage(null);
  }, [step]);

  const solved = validateSolution(DEMO_PUZZLE, placed);
  const preview = anchor && hover ? rectBetween(anchor, hover) : null;

  const cellAt = (x: number, y: number) => {
    const box = gridRef.current?.getBoundingClientRect();
    if (!box) return null;
    const c = Math.floor(((x - box.left) / box.width) * 4);
    const r = Math.floor(((y - box.top) / box.height) * 4);
    return r < 0 || c < 0 || r > 3 || c > 3 ? null : { r, c };
  };

  const finish = () => {
    if (!anchor || !hover) return;
    const rect = rectBetween(anchor, hover);
    setAnchor(null);
    // A tap on a placed rectangle takes it back off.
    const tapped = rect.w === 1 && rect.h === 1 ? placed.find((p) => inRect(p, rect.r, rect.c)) : undefined;
    if (tapped) {
      setPlaced((all) => all.filter((p) => p !== tapped));
      setMessage(null);
      return;
    }
    const problem = rectProblem(rect, placed);
    setMessage(problem);
    if (!problem) setPlaced((all) => [...all, rect]);
  };

  return (
    <div className="shikaku-demo">
      <div
        ref={gridRef}
        className="shikaku-demo-grid"
        role="application"
        aria-label="Practice board, 4 by 4. Drag across squares to draw a rectangle, tap one to remove it."
        onPointerDown={(event) => {
          const cell = cellAt(event.clientX, event.clientY);
          if (!cell || solved) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          setAnchor(cell);
          setHover(cell);
        }}
        onPointerMove={(event) => {
          if (!anchor) return;
          const cell = cellAt(event.clientX, event.clientY);
          if (cell) setHover(cell);
        }}
        onPointerUp={finish}
        onPointerCancel={() => setAnchor(null)}
      >
        {Array.from({ length: 16 }, (_, index) => {
          const r = Math.floor(index / 4);
          const c = index % 4;
          const owner = placed.findIndex((rect) => inRect(rect, r, c));
          const color = owner === -1 ? null : RECT_COLORS[owner % RECT_COLORS.length]!;
          const number = DEMO_PUZZLE.numbers.find((n) => n.r === r && n.c === c);
          return (
            <div
              key={index}
              className="shikaku-demo-cell"
              data-preview={preview && inRect(preview, r, c) ? "" : undefined}
              style={color ? ({ "--rect-color": color } as CSSProperties) : undefined}
              data-filled={color ? "" : undefined}
            >
              {number?.value}
            </div>
          );
        })}
      </div>

      <p className="shikaku-demo-note" data-tone={solved ? "solved" : message ? "error" : undefined} aria-live="polite">
        {solved ? (
          <><FiCheck size={14} /> Solved. Every square covered, every number matched.</>
        ) : message ?? (step === 0 ? "Drag across squares to draw a rectangle." : "Your turn. Tap a rectangle to take it back off.")}
      </p>

      {step === 3 && (
        <p className="shikaku-demo-note">Scores rank per difficulty, and your personal best sits at the top of the leaderboard.</p>
      )}
    </div>
  );
}

/* ── Component ──────────────────────────────────────────── */

export function ShikakuDemo({ onClose, initialStep = 0 }: { onClose: () => void; initialStep?: number }) {
  const initialStepRef = useRef(initialStep);
  const [step, setStep] = useState(initialStepRef.current);

  return (
    <DemoModal
      title="Shikaku"
      icon={<GameIcon game="shikaku" size={22} />}
      color="#34d399"
      steps={steps}
      currentStep={step}
      onStepChange={setStep}
      onClose={onClose}
    >
      <div className="game-page" data-game-theme="shikaku">
        {step === 4 ? (
          <DemoScoring
            columns={["Difficulty", "Score multiplier"]}
            rows={[
              { label: "Easy, 5×5", value: "×1" },
              { label: "Medium, 9×9", value: "×1.5" },
              { label: "Hard, 15×15", value: "×2.2" },
              { label: "Expert, 22×22", value: "×3" },
            ]}
            rules={[
              { icon: <FiTarget size={13} />, title: "Base score", text: "1,000 points per puzzle, and a run is 5 puzzles, so 5,000 before multipliers." },
              { icon: <FiClock size={13} />, title: "Speed bonus", text: "2 minus your time divided by par, never below 0.1. Finish at half par to cap it at 2x." },
              { icon: <FiFlag size={13} />, title: "Par times", text: "Per puzzle: Easy 30s, Medium 60s, Hard 90s, Expert 120s. The clock runs across all 5." },
              { icon: <FiAward size={13} />, title: "Leaderboard", text: "Boards are kept per difficulty, so an Expert run never competes with an Easy one." },
            ]}
          />
        ) : (
          <DemoGrid step={step} />
        )}
      </div>
    </DemoModal>
  );
}
