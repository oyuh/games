import { type CSSProperties, useMemo, useRef, useState } from "react";
import { FiCheck, FiClock, FiMove, FiRotateCw } from "react-icons/fi";
import { DemoModal, type DemoStep } from "./DemoModal";
import { GameIcon } from "../shared/GameIcon";
import "../../styles/game-shared.css";
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

const regionColors = ["#e11d48", "#0891b2", "#7c3aed", "#f97316"] as const;
const demoRows = 4;
const demoCols = 5;
const demoBuffer = 1;
const demoBoardRows = demoRows + demoBuffer * 2;
const demoBoardCols = demoCols + demoBuffer * 2;

const demoCells = [
  { r: 0, c: 1, region: 0 },
  { r: 0, c: 2, region: 0 },
  { r: 0, c: 3, region: 0 },
  { r: 1, c: 0, region: 1 },
  { r: 1, c: 1, region: 2 },
  { r: 1, c: 2, region: 2 },
  { r: 1, c: 3, region: 2 },
  { r: 2, c: 0, region: 1 },
  { r: 2, c: 1, region: 3 },
  { r: 2, c: 2, region: 3 },
  { r: 3, c: 0, region: 1 },
  { r: 3, c: 1, region: 3 },
] as const;

const demoRules = [
  { label: "8", kind: "sum", r: 0, c: 3, region: 0 },
  { label: "<4", kind: "lt", r: 3, c: 0, region: 1 },
  { label: "!=", kind: "diff", r: 1, c: 3, region: 2 },
  { label: "=", kind: "eq", r: 3, c: 1, region: 3 },
] as const;

const demoPlaced = [
  { id: "3-3", a: 3 as MiniDominoValue, b: 3 as MiniDominoValue, r1: 0, c1: 1, r2: 0, c2: 2, showAt: 1 },
  { id: "1-5", a: 1 as MiniDominoValue, b: 5 as MiniDominoValue, r1: 1, c1: 0, r2: 2, c2: 0, showAt: 2 },
  { id: "2-4", a: 2 as MiniDominoValue, b: 4 as MiniDominoValue, r1: 1, c1: 1, r2: 1, c2: 2, showAt: 3 },
  { id: "2-2", a: 2 as MiniDominoValue, b: 2 as MiniDominoValue, r1: 2, c1: 1, r2: 2, c2: 2, showAt: 4 },
] as const;

const demoTray = [
  { id: "3-3", a: 3 as MiniDominoValue, b: 3 as MiniDominoValue, rotation: 0 },
  { id: "1-5", a: 1 as MiniDominoValue, b: 5 as MiniDominoValue, rotation: 1 },
  { id: "2-4", a: 2 as MiniDominoValue, b: 4 as MiniDominoValue, rotation: 0 },
  { id: "2-2", a: 2 as MiniDominoValue, b: 2 as MiniDominoValue, rotation: 0 },
  { id: "0-6", a: 0 as MiniDominoValue, b: 6 as MiniDominoValue, rotation: 0 },
] as const;

const bufferedCells = Array.from({ length: demoBoardRows * demoBoardCols }, (_, index) => ({
  r: Math.floor(index / demoBoardCols) - demoBuffer,
  c: (index % demoBoardCols) - demoBuffer,
}));

const demoCellByKey = new Map(demoCells.map((cell) => [`${cell.r}:${cell.c}`, cell]));

function MiniPipsBoard({ step }: { step: number }) {
  const placedCount = step >= 4 ? 4 : step >= 2 ? 2 : step >= 1 ? 1 : 0;
  const placedDominoes = useMemo(() => demoPlaced.filter((domino) => placedCount >= domino.showAt), [placedCount]);
  const usedDominoIds = useMemo(() => new Set<string>(placedDominoes.map((domino) => domino.id)), [placedDominoes]);
  const usedCells = useMemo(
    () => new Set(placedDominoes.flatMap((domino) => [`${domino.r1}:${domino.c1}`, `${domino.r2}:${domino.c2}`])),
    [placedDominoes],
  );

  return (
    <div
      className="pips-demo"
      style={{ "--pips-rows": demoBoardRows, "--pips-cols": demoBoardCols } as CSSProperties}
    >
      <div className="pips-demo-board-wrap">
        <div className="pips-board-shell pips-demo-board-shell" aria-hidden="true">
          <div
            className="pips-board"
            style={{
              gridTemplateColumns: `repeat(${demoBoardCols}, minmax(0, 1fr))`,
              gridTemplateRows: `repeat(${demoBoardRows}, minmax(0, 1fr))`,
              "--pips-cols": demoBoardCols,
              "--pips-rows": demoBoardRows,
            } as CSSProperties}
          >
            {bufferedCells.map((cell) => {
              const key = `${cell.r}:${cell.c}`;
              const activeCell = demoCellByKey.get(key);
              const color = activeCell ? regionColors[activeCell.region] : "#6b7280";

              return (
                <div
                  key={key}
                  className={`pips-cell${activeCell ? "" : " pips-cell--void"}${step >= 2 && activeCell && !usedCells.has(key) && !usedDominoIds.has("2-4") ? " pips-cell--drop" : ""}`}
                  style={{
                    gridColumn: cell.c + demoBuffer + 1,
                    gridRow: cell.r + demoBuffer + 1,
                    "--region-color": color,
                  } as CSSProperties}
                />
              );
            })}

            {placedDominoes.map((domino, index) => (
              <MiniBoardDomino
                key={domino.id}
                a={domino.a}
                b={domino.b}
                r1={domino.r1}
                c1={domino.c1}
                r2={domino.r2}
                c2={domino.c2}
                selected={step === 3 && domino.id === "2-4"}
                style={{ "--demo-delay": `${index * 70}ms` } as CSSProperties}
              />
            ))}

            {step === 2 && (
              <MiniBoardDomino
                a={2}
                b={4}
                r1={1}
                c1={1}
                r2={1}
                c2={2}
                ghost
              />
            )}

            {demoRules.map((rule) => (
              <span
                key={rule.label}
                className="pips-constraint-anchor"
                style={{
                  gridColumn: rule.c + demoBuffer + 1,
                  gridRow: rule.r + demoBuffer + 1,
                  "--region-color": regionColors[rule.region],
                } as CSSProperties}
              >
                <span className={`pips-constraint pips-constraint--${rule.kind}`}>
                  <span>{rule.label}</span>
                </span>
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="pips-demo-tray" aria-hidden="true">
        <div className="pips-tray">
          {demoTray.map((domino) =>
            usedDominoIds.has(domino.id) ? (
              <span className="pips-tray-slot pips-tray-slot--placeholder" key={domino.id}>
                <span className="pips-domino-placeholder">
                  <span />
                  <span />
                </span>
              </span>
            ) : (
              <span className="pips-tray-slot" key={domino.id}>
                <MiniDomino
                  a={domino.a}
                  b={domino.b}
                  active={(step >= 2 && step <= 3 && domino.id === "2-4") || (step >= 4 && domino.id === "2-2")}
                  rotation={step === 3 && domino.id === "2-4" ? 1 : domino.rotation}
                />
              </span>
            )
          )}
        </div>
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
  rotation = 0,
  className = "",
  style,
}: {
  a: MiniDominoValue;
  b: MiniDominoValue;
  active?: boolean;
  rotation?: number;
  className?: string;
  style?: CSSProperties;
}) {
  const first = rotation < 2 ? a : b;
  const second = rotation < 2 ? b : a;

  return (
    <span
      className={`pips-domino pips-domino--show-rotation${rotation !== 0 ? " pips-domino--rotated" : ""}${active ? " pips-domino--selected" : ""} ${className}`}
      data-rotation={rotation}
      style={style}
    >
      <span className="pips-domino-half">
        <MiniFace value={first} />
      </span>
      <span className="pips-domino-half">
        <MiniFace value={second} />
      </span>
    </span>
  );
}

function MiniBoardDomino({
  a,
  b,
  r1,
  c1,
  r2,
  c2,
  selected,
  ghost,
  style,
}: {
  a: MiniDominoValue;
  b: MiniDominoValue;
  r1: number;
  c1: number;
  r2: number;
  c2: number;
  selected?: boolean;
  ghost?: boolean;
  style?: CSSProperties;
}) {
  const vertical = c1 === c2;
  const rowStart = Math.min(r1, r2) + demoBuffer + 1;
  const colStart = Math.min(c1, c2) + demoBuffer + 1;
  const placementStyle = {
    gridRow: vertical ? `${rowStart} / span 2` : rowStart,
    gridColumn: vertical ? colStart : `${colStart} / span 2`,
    ...style,
  } as CSSProperties;

  return (
    <span
      className={`pips-domino pips-board-domino${vertical ? " pips-domino--vertical" : ""}${selected ? " pips-domino--selected" : ""}${ghost ? " pips-demo-board-domino--ghost" : ""}`}
      style={placementStyle}
    >
      <span className="pips-domino-half">
        <MiniFace value={a} />
      </span>
      <span className="pips-domino-half">
        <MiniFace value={b} />
      </span>
    </span>
  );
}

function MiniFace({ value }: { value: MiniDominoValue }) {
  return (
    <span className={`pips-face pips-face--${value}`}>
      {Array.from({ length: value }, (_, index) => (
        <span key={index} className="pips-dot" />
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
      <div className="game-page" data-game-theme="pips">
        <MiniPipsBoard step={step} />
      </div>
    </DemoModal>
  );
}
