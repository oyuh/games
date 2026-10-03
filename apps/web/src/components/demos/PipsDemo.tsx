import { type CSSProperties, type PointerEvent, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FiAward, FiCheck, FiClock, FiRefreshCw } from "react-icons/fi";
import { DemoModal, DemoScoring, type DemoStep } from "./DemoModal";
import { GameIcon } from "../shared/GameIcon";
import { DROP_OFFSETS, nextRotation, type Rotation } from "../../lib/pips-rotation";
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

/**
 * A domino on the board: its top-left square and which way it faces. The
 * rotations match the game's: 0 and 2 lie flat, 1 and 3 stand up, and 2 and
 * 3 show the second value first.
 */
interface Placement {
  id: string;
  rotation: Rotation;
  r: number;
  c: number;
}

const secondCell = (p: Placement) => ({ r: p.r + (p.rotation % 2), c: p.c + ((p.rotation + 1) % 2) });

/** The values in visual order, left to right or top to bottom. */
function shownValues(p: Placement): [MiniDominoValue, MiniDominoValue] {
  const domino = demoTray.find((d) => d.id === p.id)!;
  return p.rotation < 2 ? [domino.a, domino.b] : [domino.b, domino.a];
}

const solutionPlacements: Placement[] = [
  { id: "3-3", rotation: 0, r: 0, c: 1 },
  { id: "2-6", rotation: 1, r: 0, c: 3 },
  { id: "1-0", rotation: 1, r: 1, c: 0 },
  { id: "4-5", rotation: 0, r: 1, c: 1 },
  { id: "2-2", rotation: 0, r: 2, c: 1 },
  { id: "1-2", rotation: 0, r: 3, c: 0 },
];

/** Where each step's board starts. Every step is live, so you can keep going. */
const STARTS: Placement[][] = [[], [], solutionPlacements.slice(0, 2), solutionPlacements.slice(0, 3), solutionPlacements.slice(0, 5)];

const bufferedCells = Array.from({ length: demoBoardRows * demoBoardCols }, (_, index) => ({
  r: Math.floor(index / demoBoardCols) - demoBuffer,
  c: (index % demoBoardCols) - demoBuffer,
}));

const demoCellByKey = new Map(demoCells.map((cell) => [`${cell.r}:${cell.c}`, cell]));

interface Drag {
  id: string;
  /** Where it came from: the tray, or the spot it held on the board. */
  from: Placement | null;
  rotation: Rotation;
  x: number;
  y: number;
  startX: number;
  startY: number;
}

/** Moves under this many pixels count as a click, which rotates, same as the game. */
const CLICK_SLOP = 7;

function MiniPipsBoard({ step }: { step: number }) {
  const [placed, setPlaced] = useState<Placement[]>(STARTS[step] ?? []);
  const [resting, setResting] = useState<Record<string, Rotation>>({});
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef(drag);
  dragRef.current = drag;

  // A new step resets the board to that step's starting dominoes.
  useEffect(() => {
    setPlaced(STARTS[step] ?? []);
    setResting({});
    setDrag(null);
  }, [step]);

  const valueAt = new Map<string, number>();
  for (const p of placed) {
    const [first, second] = shownValues(p);
    const other = secondCell(p);
    valueAt.set(`${p.r}:${p.c}`, first);
    valueAt.set(`${other.r}:${other.c}`, second);
  }
  const usedIds = new Set(placed.map((p) => p.id));
  const solved = valueAt.size === demoCells.length && demoRules.every((rule) =>
    rulePasses(rule.kind, demoCells.filter((cell) => cell.region === rule.region).map((cell) => valueAt.get(`${cell.r}:${cell.c}`)!)),
  );

  /** Squares this domino may cover: on the board, and not under some other domino. */
  const isOpen = (r: number, c: number, id: string) => {
    if (!demoCellByKey.has(`${r}:${c}`)) return false;
    return !placed.some((p) => {
      if (p.id === id) return false;
      const other = secondCell(p);
      return (p.r === r && p.c === c) || (other.r === r && other.c === c);
    });
  };

  /** Drops a domino with its first value on (r, c), the second wherever its rotation reaches, like the game. */
  const dropAt = (id: string, rotation: Rotation, r: number, c: number) => {
    for (const offset of DROP_OFFSETS[rotation]) {
      const r2 = r + offset.r;
      const c2 = c + offset.c;
      if (!isOpen(r, c, id) || !isOpen(r2, c2, id)) continue;
      // Store it by its top-left square, flipping the rotation if the second half landed before the first.
      const reversed = r2 < r || c2 < c;
      const vertical = rotation % 2 === 1;
      const placement: Placement = {
        id,
        rotation: (vertical ? (reversed ? 3 : 1) : (reversed ? 2 : 0)) as Rotation,
        r: Math.min(r, r2),
        c: Math.min(c, c2),
      };
      setPlaced((all) => [...all.filter((p) => p.id !== id), placement]);
      return true;
    }
    return false;
  };

  /** Turns a placed domino where it stands, kicking off a wall when it has to, like the game. */
  const rotatePlaced = (p: Placement) => {
    let rotation = p.rotation;
    for (let turn = 0; turn < 3; turn++) {
      rotation = nextRotation(rotation);
      const step = rotation % 2 === 1 ? { r: 1, c: 0 } : { r: 0, c: 1 };
      for (const pivot of [{ r: p.r, c: p.c }, { r: p.r - step.r, c: p.c - step.c }]) {
        if (!isOpen(pivot.r, pivot.c, p.id) || !isOpen(pivot.r + step.r, pivot.c + step.c, p.id)) continue;
        const turned = { ...p, rotation, r: pivot.r, c: pivot.c };
        setPlaced((all) => all.map((item) => (item.id === p.id ? turned : item)));
        return;
      }
    }
  };

  const begin = (event: PointerEvent<HTMLButtonElement>, id: string, from: Placement | null) => {
    if (event.button !== 0 || solved) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setDrag({ id, from, rotation: from ? from.rotation : resting[id] ?? 0, x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY });
  };

  // While a domino is held: follow the pointer, R turns it, and letting go drops it.
  useEffect(() => {
    if (!drag) return;
    const onMove = (event: globalThis.PointerEvent) => {
      setDrag((current) => (current ? { ...current, x: event.clientX, y: event.clientY } : current));
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "r" || event.ctrlKey || event.metaKey) return;
      event.preventDefault();
      setDrag((current) => (current ? { ...current, rotation: nextRotation(current.rotation) } : current));
    };
    const onUp = (event: globalThis.PointerEvent) => {
      const current = dragRef.current;
      setDrag(null);
      if (!current) return;
      if (Math.hypot(event.clientX - current.startX, event.clientY - current.startY) < CLICK_SLOP) {
        if (current.from) rotatePlaced(current.from);
        else setResting((all) => ({ ...all, [current.id]: nextRotation(current.rotation) }));
        return;
      }
      const target = document.elementFromPoint(event.clientX, event.clientY);
      const cell = target?.closest<HTMLElement>("[data-demo-cell]")?.dataset.demoCell;
      if (cell) {
        const [r, c] = cell.split(":").map(Number);
        dropAt(current.id, current.rotation, r!, c!);
        return;
      }
      // Dropped on the tray: a board domino goes back to it.
      if (current.from && target?.closest("[data-demo-tray]")) {
        setPlaced((all) => all.filter((p) => p.id !== current.id));
        setResting((all) => ({ ...all, [current.id]: current.rotation }));
      }
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag !== null]);

  const dragging = drag && Math.hypot(drag.x - drag.startX, drag.y - drag.startY) >= CLICK_SLOP ? drag : null;
  const draggingDomino = dragging ? demoTray.find((d) => d.id === dragging.id)! : null;

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
              return (
                <div
                  key={key}
                  className={`pips-cell${activeCell ? "" : " pips-cell--void"}${dragging && activeCell && !valueAt.has(key) ? " pips-cell--drop" : ""}`}
                  data-demo-cell={activeCell ? key : undefined}
                  style={{
                    gridColumn: cell.c + demoBuffer + 1,
                    gridRow: cell.r + demoBuffer + 1,
                    "--region-color": activeCell ? regionColors[activeCell.region] : "#6b7280",
                  } as CSSProperties}
                />
              );
            })}

            {placed.map((p) => {
              const [a, b] = shownValues(p);
              const other = secondCell(p);
              // The one in your hand leaves a gap where it was, like the game.
              if (dragging?.id === p.id) return null;
              return (
                <MiniBoardDomino
                  key={p.id}
                  a={a}
                  b={b}
                  r1={p.r}
                  c1={p.c}
                  r2={other.r}
                  c2={other.c}
                  onPointerDown={(event) => begin(event, p.id, p)}
                />
              );
            })}

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

      <div className="pips-demo-tray" data-demo-tray="">
        <div className="pips-tray">
          {demoTray.map((domino) =>
            usedIds.has(domino.id) || dragging?.id === domino.id ? (
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
                aria-label={`Domino ${domino.a} and ${domino.b}. Drag it onto the board, click to rotate.`}
                onPointerDown={(event) => begin(event, domino.id, null)}
              >
                <MiniDomino a={domino.a} b={domino.b} active={drag?.id === domino.id} rotation={resting[domino.id] ?? 0} />
              </button>
            ),
          )}
        </div>
      </div>

      {/* The held domino follows the pointer. Portaled out of the modal so
          its position is the viewport's, with the demo's sizes kept. */}
      {dragging && draggingDomino && createPortal(
        <div className="pips-demo pips-demo-drag-layer" aria-hidden="true">
          <div className="pips-drag-preview" style={{ left: dragging.x, top: dragging.y }}>
            <MiniDomino a={draggingDomino.a} b={draggingDomino.b} active rotation={dragging.rotation} />
          </div>
        </div>,
        document.body,
      )}
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
  onPointerDown,
}: {
  a: MiniDominoValue;
  b: MiniDominoValue;
  r1: number;
  c1: number;
  r2: number;
  c2: number;
  onPointerDown: (event: PointerEvent<HTMLButtonElement>) => void;
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
      aria-label={`Placed domino ${a} and ${b}. Drag to move it, click to rotate.`}
      onPointerDown={onPointerDown}
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
