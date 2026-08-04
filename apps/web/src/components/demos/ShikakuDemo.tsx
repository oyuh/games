import { useRef, useState } from "react";
import { FiAward, FiCheck, FiClock, FiFlag, FiTarget } from "react-icons/fi";
import { DemoModal, DemoScoring, type DemoStep } from "./DemoModal";
import { GameIcon } from "../shared/GameIcon";
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

function DemoGrid({ step }: { step: number }) {
  // A simple 4×4 visual that changes based on step
  const cells = Array.from({ length: 16 }, (_, index) => ({ id: `demo-shikaku-cell-${index}`, index }));

  // Step 0: empty grid with numbers
  // Step 1: partially filled
  // Step 2: fully solved
  // Step 3-4: scoring/leaderboard view

  const numbers: Record<number, number> = { 2: 4, 5: 2, 11: 6, 13: 4 };
  const filled: Record<number, string> = {};

  if (step >= 1) {
    // First rectangle: cells 0,1,2,3 (top row) - area 4
    [0, 1, 2, 3].forEach((i) => { filled[i] = "#34d399"; });
    // Second rectangle: cells 4,5 - area 2
    [4, 5].forEach((i) => { filled[i] = "#60a5fa"; });
  }

  if (step >= 2) {
    // Third rectangle: cells 6,7,8,9,10,11 - area 6
    [6, 7, 10, 11, 14, 15].forEach((i) => { filled[i] = "#f472b6"; });
    // Fourth rectangle: cells 12,13,14,15 - area 4
    [8, 9, 12, 13].forEach((i) => { filled[i] = "#a78bfa"; });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "1rem" }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 3rem)",
          gridTemplateRows: "repeat(4, 3rem)",
          gap: "3px",
        }}
      >
        {cells.map(({ id, index }) => {
          const i = index;
          const bg = filled[i] ?? "rgba(255,255,255,0.06)";
          const border = filled[i]
            ? `2px solid ${filled[i]}`
            : "1px solid rgba(255,255,255,0.12)";
          const num = numbers[i];

          return (
            <div
              key={id}
              style={{
                background: filled[i] ? `color-mix(in srgb, ${filled[i]} 20%, transparent)` : bg,
                border,
                borderRadius: "4px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "0.85rem",
                fontWeight: 800,
                color: num ? "#34d399" : "transparent",
              }}
            >
              {num ?? ""}
            </div>
          );
        })}
      </div>

      {step === 0 && (
        <p style={{ fontSize: "0.75rem", color: "var(--muted-foreground)", textAlign: "center", margin: 0 }}>
          Numbers tell you the area each rectangle must be
        </p>
      )}
      {step === 1 && (
        <p style={{ fontSize: "0.75rem", color: "var(--muted-foreground)", textAlign: "center", margin: 0 }}>
          Drag to draw - each rectangle covers exactly one number
        </p>
      )}
      {step === 2 && (
        <p style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "0.35rem", fontSize: "0.75rem", color: "#34d399", textAlign: "center", margin: 0, fontWeight: 700 }}>
          <FiCheck size={14} /> Solved! Every cell covered, every number matched
        </p>
      )}
      {step === 3 && (
        <div style={{ textAlign: "center", fontSize: "0.75rem", color: "var(--muted-foreground)", lineHeight: 1.6 }}>
          <p style={{ margin: 0 }}>
            Scores ranked per difficulty. Compete for #1!
          </p>
          <p style={{ margin: "0.3rem 0 0" }}>
            Your personal best is shown at the top of the leaderboard.
          </p>
        </div>
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
