import { type CSSProperties, useMemo, useRef, useState } from "react";
import { FiCheck, FiClock, FiMove, FiRotateCw } from "react-icons/fi";
import { DemoModal, type DemoStep } from "./DemoModal";
import { GameIcon } from "../shared/GameIcon";
import "../../styles/pips.css";

const steps: DemoStep[] = [
  {
    label: "Start a Run",
    description: "Ranked Pips is one timed run: Easy, Medium, then Hard. Seeded and infinite modes are for practice and do not submit scores.",
    hint: "The timer pauses between puzzles during the countdown screens.",
  },
  {
    label: "Read Rules",
    description: "Each colored region has a rule chip. The pips inside that region must match the chip when every domino is placed.",
    hint: "= means all values match, != means not all the same, and number chips check the region total.",
  },
  {
    label: "Place Dominoes",
    description: "Drag a domino from the tray onto two adjacent board cells. Let go to place it, or drop it back on the tray to return it.",
    hint: "The board itself is only the target. The dominoes are the pieces you move.",
  },
  {
    label: "Rotate",
    description: "Click a resting domino or press R while dragging to rotate clockwise. Placed dominoes keep their rotation when you move them again.",
    hint: "Rotation changes which pip value lands in each cell, so it often matters.",
  },
  {
    label: "Submit",
    description: "When all three ranked puzzles are solved, submit your verified time. The leaderboard ranks total time and still shows each split.",
    hint: "The score check runs before the submit button appears and again when you submit.",
  },
];

type MiniDominoValue = 0 | 1 | 2 | 3 | 4 | 5 | 6;

const ruleLabels = ["6", "=", ">3", "!="] as const;
const regionColors = ["#f97316", "#e11d48", "#8b5cf6", "#0891b2"] as const;

function MiniPipsBoard({ step }: { step: number }) {
  const placedCount = step >= 4 ? 4 : step >= 2 ? 2 : step >= 1 ? 1 : 0;
  const cells = useMemo(
    () => [
      { x: 1, y: 0, region: 0 },
      { x: 2, y: 0, region: 0 },
      { x: 0, y: 1, region: 1 },
      { x: 1, y: 1, region: 1 },
      { x: 2, y: 1, region: 2 },
      { x: 3, y: 1, region: 2 },
      { x: 0, y: 2, region: 1 },
      { x: 1, y: 2, region: 3 },
      { x: 2, y: 2, region: 3 },
      { x: 3, y: 2, region: 2 },
    ],
    []
  );

  const placed = [
    { a: 3 as MiniDominoValue, b: 3 as MiniDominoValue, x: 1, y: 0, vertical: false, show: placedCount >= 1 },
    { a: 1 as MiniDominoValue, b: 5 as MiniDominoValue, x: 0, y: 1, vertical: true, show: placedCount >= 2 },
    { a: 2 as MiniDominoValue, b: 4 as MiniDominoValue, x: 2, y: 1, vertical: false, show: placedCount >= 3 },
    { a: 2 as MiniDominoValue, b: 2 as MiniDominoValue, x: 2, y: 2, vertical: false, show: placedCount >= 4 },
  ];

  return (
    <div className="pips-demo">
      <div className="pips-demo-board-wrap">
        <div className="pips-demo-board" aria-hidden="true">
          {cells.map((cell) => (
            <span
              key={`${cell.x}-${cell.y}`}
              className="pips-demo-cell"
              style={{
                "--demo-x": cell.x,
                "--demo-y": cell.y,
                "--demo-region": regionColors[cell.region],
              } as CSSProperties}
            />
          ))}

          {ruleLabels.map((label, index) => (
            <span
              key={label}
              className="pips-demo-rule"
              style={{
                "--demo-rule-x": [2, 0, 3, 1][index],
                "--demo-rule-y": [0, 2, 1, 2][index],
                "--demo-rule-color": regionColors[index],
              } as CSSProperties}
            >
              <span>{label}</span>
            </span>
          ))}

          {placed.map((domino, index) =>
            domino.show ? (
              <MiniDomino
                key={`${domino.x}-${domino.y}`}
                a={domino.a}
                b={domino.b}
                className={`pips-demo-board-domino${domino.vertical ? " pips-demo-board-domino--vertical" : ""}`}
                style={{
                  "--demo-x": domino.x,
                  "--demo-y": domino.y,
                  "--demo-delay": `${index * 70}ms`,
                } as CSSProperties}
              />
            ) : null
          )}

          {step === 2 && (
            <MiniDomino
              a={2}
              b={4}
              className="pips-demo-board-domino pips-demo-board-domino--ghost"
              style={{ "--demo-x": 2.45, "--demo-y": 1.1 } as CSSProperties}
            />
          )}
        </div>
      </div>

      <div className="pips-demo-tray" aria-hidden="true">
        <MiniDomino a={3} b={3} muted={placedCount >= 1} />
        <MiniDomino a={1} b={5} muted={placedCount >= 2} vertical={step === 3} />
        <MiniDomino a={2} b={4} active={step >= 2 && step <= 3} />
        <MiniDomino a={2} b={2} active={step >= 4} />
      </div>

      <div className="pips-demo-status">
        {step === 0 && <><GameIcon game="pips" size={14} /> Ranked run: Easy / Medium / Hard</>}
        {step === 1 && <><FiCheck size={14} /> Rule chips sit on region edges</>}
        {step === 2 && <><FiMove size={14} /> Drag, drop, and snap into place</>}
        {step === 3 && <><FiRotateCw size={14} /> Rotate clockwise with click or R</>}
        {step >= 4 && <><FiClock size={14} /> Submit the verified total time</>}
      </div>
    </div>
  );
}

function MiniDomino({
  a,
  b,
  active,
  muted,
  vertical,
  className = "",
  style,
}: {
  a: MiniDominoValue;
  b: MiniDominoValue;
  active?: boolean;
  muted?: boolean;
  vertical?: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <span
      className={`pips-demo-domino${active ? " pips-demo-domino--active" : ""}${muted ? " pips-demo-domino--muted" : ""}${vertical ? " pips-demo-domino--vertical" : ""} ${className}`}
      style={style}
    >
      <MiniFace value={a} />
      <MiniFace value={b} />
    </span>
  );
}

function MiniFace({ value }: { value: MiniDominoValue }) {
  return (
    <span className={`pips-demo-face pips-demo-face--${value}`}>
      {Array.from({ length: value }, (_, index) => (
        <span key={index} className="pips-demo-dot" />
      ))}
    </span>
  );
}

export function PipsDemo({ onClose, initialStep = 0 }: { onClose: () => void; initialStep?: number }) {
  const initialStepRef = useRef(initialStep);
  const [step, setStep] = useState(initialStepRef.current);

  return (
    <DemoModal
      title="Pips"
      icon={<GameIcon game="pips" size={22} />}
      color="#f97316"
      steps={steps}
      currentStep={step}
      onStepChange={setStep}
      onClose={onClose}
    >
      <MiniPipsBoard step={step} />
    </DemoModal>
  );
}
