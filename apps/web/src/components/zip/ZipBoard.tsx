import { useRef, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import { canStep, pathSegments, segmentColor, type ZipPuzzle } from "../../lib/zip-engine";
import "../../styles/zip.css";

/* ── Path rules ─────────────────────────────────────────────── */

/** How many numbers the path has already passed, which is also the index of the next one. */
export function nextCheckpoint(puzzle: ZipPuzzle, path: number[]): number {
  let next = 0;
  for (const cell of path) if (cell === puzzle.checkpoints[next]) next++;
  return next;
}

/**
 * The one move the board makes: point at a cell and the path goes there if it
 * legally can. A cell already on the path backs the line up to it. Anything
 * else hands the same array back, so callers can compare by reference.
 */
export function stepTo(puzzle: ZipPuzzle, path: number[], cell: number): number[] {
  const at = path.indexOf(cell);
  if (at !== -1) return at === path.length - 1 ? path : path.slice(0, at + 1);
  if (path.length === 0) return cell === puzzle.checkpoints[0] ? [cell] : path;

  const head = path[path.length - 1]!;
  // The last number closes the line, so nothing leaves it.
  if (head === puzzle.checkpoints[puzzle.checkpoints.length - 1]) return path;
  if (!canStep(puzzle, head, cell)) return path;
  const cp = puzzle.checkpoints.indexOf(cell);
  if (cp !== -1 && cp !== nextCheckpoint(puzzle, path)) return path;
  return [...path, cell];
}

/**
 * A fast drag skips cells between pointer events. Walk the gap one square at
 * a time, longer axis first, and stop at the first square the rules refuse.
 */
function walkTo(puzzle: ZipPuzzle, path: number[], target: number): number[] {
  if (path.includes(target)) return stepTo(puzzle, path, target);
  const { size } = puzzle;
  let current = path;
  for (let guard = 0; guard < size * 2; guard++) {
    const head = current[current.length - 1];
    if (head === undefined || head === target) break;
    const dr = Math.floor(target / size) - Math.floor(head / size);
    const dc = (target % size) - (head % size);
    const step = Math.abs(dr) >= Math.abs(dc) ? head + Math.sign(dr) * size : head + Math.sign(dc);
    const next = stepTo(puzzle, current, step);
    if (next === current) break;
    current = next;
  }
  return current;
}

/* ── Board ──────────────────────────────────────────────────── */

export interface ZipBoardProps {
  puzzle: ZipPuzzle;
  path: number[];
  /** Left off for a board you can only look at. */
  onPathChange?: (path: number[]) => void;
  /** Rings the number the path needs next. */
  hint?: boolean;
  solved?: boolean;
  /** sm is for thumbnails and side-by-side states. */
  size?: "sm" | "md";
}

const ARROWS: Record<string, [number, number]> = {
  ArrowUp: [-1, 0],
  ArrowDown: [1, 0],
  ArrowLeft: [0, -1],
  ArrowRight: [0, 1],
};

export function ZipBoard({ puzzle, path, onPathChange, hint, solved, size = "md" }: ZipBoardProps) {
  const { size: n, checkpoints, walls } = puzzle;
  const boardRef = useRef<HTMLDivElement>(null);
  // Pointer events land faster than React re-renders, so a drag reads and
  // writes the path here instead of waiting on props.
  const live = useRef(path);
  live.current = path;
  const dragging = useRef(false);
  const interactive = Boolean(onPathChange) && !solved;

  const commit = (next: number[]) => {
    if (next === live.current) return;
    live.current = next;
    onPathChange?.(next);
  };

  const cellAt = (x: number, y: number): number | null => {
    const rect = boardRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const c = Math.floor(((x - rect.left) / rect.width) * n);
    const r = Math.floor(((y - rect.top) / rect.height) * n);
    if (r < 0 || c < 0 || r >= n || c >= n) return null;
    return r * n + c;
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!interactive || event.button !== 0) return;
    const cell = cellAt(event.clientX, event.clientY);
    if (cell === null) return;
    const current = live.current;
    const head = current[current.length - 1];
    // Grab the line anywhere on it, start it on 1, or carry on from the head.
    const next = stepTo(puzzle, current, cell);
    if (next === current && cell !== head) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragging.current = true;
    commit(next);
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    const cell = cellAt(event.clientX, event.clientY);
    if (cell !== null) commit(walkTo(puzzle, live.current, cell));
  };

  const endDrag = () => {
    dragging.current = false;
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!interactive) return;
    const current = live.current;
    if (event.key === "Backspace") {
      event.preventDefault();
      commit(current.slice(0, -1));
      return;
    }
    const arrow = ARROWS[event.key];
    if (!arrow) return;
    event.preventDefault();
    const head = current[current.length - 1];
    if (head === undefined) {
      commit(stepTo(puzzle, current, checkpoints[0]!));
      return;
    }
    const r = Math.floor(head / n) + arrow[0];
    const c = (head % n) + arrow[1];
    if (r < 0 || c < 0 || r >= n || c >= n) return;
    commit(stepTo(puzzle, current, r * n + c));
  };

  const next = nextCheckpoint(puzzle, path);
  const head = path[path.length - 1];
  const lastSegment = checkpoints.length - 2;
  const runs = pathSegments(puzzle, path);
  const center = (cell: number) => `${(cell % n) + 0.5},${Math.floor(cell / n) + 0.5}`;

  // Which stretch each drawn cell belongs to, for the tint under the line.
  const cellSegment = new Map<number, number>();
  runs.forEach((run, k) => run.forEach((cell) => cellSegment.has(cell) || cellSegment.set(cell, Math.min(k, lastSegment))));

  return (
    <div
      ref={boardRef}
      className="zip-board"
      data-size={size}
      data-solved={solved ? "" : undefined}
      data-interactive={interactive ? "" : undefined}
      style={{ "--zip-n": n } as CSSProperties}
      role="application"
      aria-label={`Zip board, ${n} by ${n}. Arrow keys draw the line, Backspace backs it up.`}
      tabIndex={interactive ? 0 : -1}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onKeyDown={onKeyDown}
    >
      <div className="zip-cells" aria-hidden="true">
        {Array.from({ length: n * n }, (_, cell) => {
          const k = cellSegment.get(cell);
          return (
            <span
              key={cell}
              className="zip-cell"
              data-on={k === undefined ? undefined : ""}
              style={k === undefined ? undefined : ({ "--zip-seg": segmentColor(k) } as CSSProperties)}
            />
          );
        })}
      </div>

      <svg className="zip-ink" viewBox={`0 0 ${n} ${n}`} aria-hidden="true">
        {runs.map((run, k) =>
          run.length > 1 ? <polyline key={k} points={run.map(center).join(" ")} style={{ stroke: segmentColor(k) }} /> : null,
        )}
        {head !== undefined && (
          <circle
            className="zip-head"
            cx={(head % n) + 0.5}
            cy={Math.floor(head / n) + 0.5}
            r={0.15}
            style={{ fill: segmentColor(Math.max(0, Math.min(next - 1, lastSegment))) }}
          />
        )}
      </svg>

      <div className="zip-nums" aria-hidden="true">
        {checkpoints.map((cell, i) => {
          // The ring shows the two stretches this number joins: the one coming
          // in on the left half, the one going out on the right. The ends of
          // the line only have one, so it takes the whole ring.
          const incoming = segmentColor(Math.max(0, i - 1));
          const outgoing = segmentColor(Math.min(i, lastSegment));
          return (
            <span
              key={cell}
              className="zip-num"
              data-next={hint && i === next && !solved ? "" : undefined}
              style={{
                gridRow: Math.floor(cell / n) + 1,
                gridColumn: (cell % n) + 1,
                "--zip-in": i === 0 ? outgoing : incoming,
                "--zip-out": i === checkpoints.length - 1 ? incoming : outgoing,
              } as CSSProperties}
            >
              <span className="zip-num-face">{i + 1}</span>
            </span>
          );
        })}
      </div>

      <svg className="zip-walls" viewBox={`0 0 ${n} ${n}`} aria-hidden="true">
        {walls.map(([a, b]) => {
          const r = Math.floor(a / n);
          const c = a % n;
          // Walls are stored low cell first, so b is either right of a or below it.
          return b === a + 1
            ? <line key={`${a}-${b}`} x1={c + 1} y1={r} x2={c + 1} y2={r + 1} />
            : <line key={`${a}-${b}`} x1={c} y1={r + 1} x2={c + 1} y2={r + 1} />;
        })}
      </svg>

      <span className="zip-sr" aria-live="polite">
        {solved
          ? "Solved."
          : `${path.length} of ${n * n} cells filled. Next number: ${Math.min(next + 1, checkpoints.length)}.`}
      </span>
    </div>
  );
}
