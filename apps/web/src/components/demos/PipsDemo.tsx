import { type CSSProperties, useEffect, useRef, useState } from "react";
import { FiAward, FiCheck, FiClock, FiRefreshCw } from "react-icons/fi";
import { DemoModal, DemoScoring, type DemoStep } from "./DemoModal";
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
    hint: "On this practice board, tap a domino to pick it up, then tap where its first half goes.",
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
  {
    label: "Overview",
    description: "Pips has no points. A ranked run is one clock across three boards, and the leaderboard sorts on that total, fastest first.",
    hint: "Only ranked runs submit. Seeded and infinite runs never touch the board.",
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

/** Whether a region's pips pass its chip, using the rules the step text spells out. */
function rulePasses(kind: (typeof demoRules)[number]["kind"], values: number[]): boolean {
  const total = values.reduce((sum, value) => sum + value, 0);
  if (kind === "sum") return total === 8;
  if (kind === "lt") return total < 4;
  if (kind === "eq") return values.every((value) => value === values[0]);
  return !values.every((value) => value === values[0]);
}

interface DemoDomino {
  id: string;
  a: MiniDominoValue;
  b: MiniDominoValue;
}

/* Six dominoes for twelve squares, with an answer that passes every chip:
   3-3 and the 2 of 2-6 make the 8, the cyan column adds to 2, the orange
   corner is all 2s, and the purple row runs 4, 5, 6. */
const demoTray: DemoDomino[] = [
  { id: "3-3", a: 3, b: 3 },
  { id: "1-0", a: 1, b: 0 },
  { id: "4-5", a: 4, b: 5 },
  { id: "2-2", a: 2, b: 2 },
  { id: "2-6", a: 2, b: 6 },
  { id: "1-2", a: 1, b: 2 },
];

interface Placement {
  id: string;
  /** The value on the first cell, then the second. */
  a: MiniDominoValue;
  b: MiniDominoValue;
  r1: number;
  c1: number;
  r2: number;
  c2: number;
}

const solutionPlacements: Placement[] = [
  { id: "3-3", a: 3, b: 3, r1: 0, c1: 1, r2: 0, c2: 2 },
  { id: "2-6", a: 2, b: 6, r1: 0, c1: 3, r2: 1, c2: 3 },
  { id: "1-0", a: 1, b: 0, r1: 1, c1: 0, r2: 2, c2: 0 },
  { id: "4-5", a: 4, b: 5, r1: 1, c1: 1, r2: 1, c2: 2 },
  { id: "2-2", a: 2, b: 2, r1: 2, c1: 1, r2: 2, c2: 2 },
  { id: "1-2", a: 1, b: 2, r1: 3, c1: 0, r2: 3, c2: 1 },
];

/** Where each step's board starts. Every step is live, so you can keep going. */
const STARTS: Placement[][] = [[], [], solutionPlacements.slice(0, 2), solutionPlacements.slice(0, 3), solutionPlacements.slice(0, 5)];

const bufferedCells = Array.from({ length: demoBoardRows * demoBoardCols }, (_, index) => ({
  r: Math.floor(index / demoBoardCols) - demoBuffer,
  c: (index % demoBoardCols) - demoBuffer,
}));

const demoCellByKey = new Map(demoCells.map((cell) => [`${cell.r}:${cell.c}`, cell]));

function MiniPipsBoard({ step }: { step: number }) {
  const [placed, setPlaced] = useState<Placement[]>(STARTS[step] ?? []);
  const [held, setHeld] = useState<{ id: string; rotation: number } | null>(null);

  // A new step resets the board to that step's starting dominoes.
  useEffect(() => {
    setPlaced(STARTS[step] ?? []);
    setHeld(null);
  }, [step]);

  const rotate = () => setHeld((current) => (current ? { ...current, rotation: (current.rotation + 1) % 4 } : current));

  // R turns the held domino, same as in the game.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === "r" && !event.ctrlKey && !event.metaKey) rotate();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const valueAt = new Map<string, number>();
  for (const p of placed) {
    valueAt.set(`${p.r1}:${p.c1}`, p.a);
    valueAt.set(`${p.r2}:${p.c2}`, p.b);
  }
  const usedIds = new Set(placed.map((p) => p.id));
  const solved = valueAt.size === demoCells.length && demoRules.every((rule) =>
    rulePasses(rule.kind, demoCells.filter((cell) => cell.region === rule.region).map((cell) => valueAt.get(`${cell.r}:${cell.c}`)!)),
  );

  /** Drops the held domino with its first half on (r, c), if both halves land on open squares. */
  const dropAt = (r: number, c: number) => {
    if (!held) return;
    const domino = demoTray.find((d) => d.id === held.id)!;
    const vertical = held.rotation % 2 === 1;
    const r2 = vertical ? r + 1 : r;
    const c2 = vertical ? c : c + 1;
    if (!demoCellByKey.has(`${r2}:${c2}`) || valueAt.has(`${r}:${c}`) || valueAt.has(`${r2}:${c2}`)) return;
    const [a, b] = held.rotation < 2 ? [domino.a, domino.b] : [domino.b, domino.a];
    setPlaced((all) => [...all, { id: domino.id, a, b, r1: r, c1: c, r2, c2 }]);
    setHeld(null);
  };

  const pickUp = (placement: Placement) => {
    setPlaced((all) => all.filter((p) => p !== placement));
    setHeld({ id: placement.id, rotation: 0 });
  };

  return (
    <div
      className="pips-demo"
      style={{ "--pips-rows": demoBoardRows, "--pips-cols": demoBoardCols } as CSSProperties}
    >
      <div className="pips-demo-board-wrap">
        <div className="pips-board-shell pips-demo-board-shell">
          <div
            className="pips-board"
            data-solved={solved ? "" : undefined}
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
              const style = {
                gridColumn: cell.c + demoBuffer + 1,
                gridRow: cell.r + demoBuffer + 1,
                "--region-color": activeCell ? regionColors[activeCell.region] : "#6b7280",
              } as CSSProperties;
              if (!activeCell) return <div key={key} className="pips-cell pips-cell--void" style={style} />;
              return (
                <button
                  key={key}
                  type="button"
                  className={`pips-cell pips-demo-hit${held && !valueAt.has(key) ? " pips-cell--drop" : ""}`}
                  style={style}
                  aria-label={`Row ${cell.r + 1}, column ${cell.c + 1}`}
                  onClick={() => dropAt(cell.r, cell.c)}
                />
              );
            })}

            {placed.map((p) => (
              <MiniBoardDomino key={p.id} {...p} onClick={() => pickUp(p)} />
            ))}

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

      <div className="pips-demo-tray">
        <div className="pips-tray">
          {demoTray.map((domino) =>
            usedIds.has(domino.id) ? (
              <span className="pips-tray-slot pips-tray-slot--placeholder" key={domino.id}>
                <span className="pips-domino-placeholder">
                  <span />
                  <span />
                </span>
              </span>
            ) : (
              <button
                type="button"
                className="pips-tray-slot pips-demo-hit"
                key={domino.id}
                aria-label={`Domino ${domino.a} and ${domino.b}${held?.id === domino.id ? ", held, press to rotate" : ""}`}
                onClick={() => (held?.id === domino.id ? rotate() : setHeld({ id: domino.id, rotation: 0 }))}
              >
                <MiniDomino a={domino.a} b={domino.b} active={held?.id === domino.id} rotation={held?.id === domino.id ? held.rotation : 0} />
              </button>
            ),
          )}
        </div>
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
  onClick,
}: {
  a: MiniDominoValue;
  b: MiniDominoValue;
  r1: number;
  c1: number;
  r2: number;
  c2: number;
  onClick: () => void;
}) {
  const vertical = c1 === c2;
  const rowStart = Math.min(r1, r2) + demoBuffer + 1;
  const colStart = Math.min(c1, c2) + demoBuffer + 1;

  return (
    <button
      type="button"
      className={`pips-domino pips-board-domino pips-demo-hit${vertical ? " pips-domino--vertical" : ""}`}
      style={{
        gridRow: vertical ? `${rowStart} / span 2` : rowStart,
        gridColumn: vertical ? colStart : `${colStart} / span 2`,
      }}
      aria-label={`Placed domino ${a} and ${b}, press to pick it back up`}
      onClick={onClick}
    >
      <span className="pips-domino-half">
        <MiniFace value={a} />
      </span>
      <span className="pips-domino-half">
        <MiniFace value={b} />
      </span>
    </button>
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
        {step === 5 ? (
          <DemoScoring
            columns={["Ranked run split", "Dominoes"]}
            rows={[
              { label: "1. Easy", value: "6" },
              { label: "2. Medium", value: "10" },
              { label: "3. Hard", value: "15" },
              { label: "Your result", value: "Total time" },
            ]}
            rules={[
              { icon: <FiClock size={13} />, title: "One clock", text: "The timer runs across all three boards and pauses on the countdown between them." },
              { icon: <FiAward size={13} />, title: "Ranking", text: "Fastest total time wins. The board still shows each split so you can see where it went." },
              { icon: <FiCheck size={13} />, title: "Verified", text: "Every ranked run is replayed against the seeded boards before it counts." },
              { icon: <FiRefreshCw size={13} />, title: "Practice modes", text: "Seeded and infinite runs play identically but never submit a score." },
            ]}
          />
        ) : (
          <MiniPipsBoard step={step} />
        )}
      </div>
    </DemoModal>
  );
}
