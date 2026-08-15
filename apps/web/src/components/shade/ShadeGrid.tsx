import type { CSSProperties, ReactNode } from "react";
import { PlayerAvatar } from "../shared/PlayerAvatar";
import { generateGridColor } from "./ColorGrid";
import "../../styles/shade-kit.css";

/**
 * The grid, which is very nearly the whole game. Every phase is this same
 * surface with a bit more shown on it: nothing, then your pick, then the
 * bands, then everybody's faces where they guessed.
 *
 * Shade is the awkward one for the kit's color rule, because the board is a
 * hundred and twenty colors and none of them are ours. So nothing drawn on
 * top of it gets a hue of its own: rings and dots are --foreground, and the
 * scoring bands are that same mark fading out as the distance grows. One
 * meaning, one color, and it reads over any cell it lands on.
 */

export interface ShadeCell {
  row: number;
  col: number;
}

/**
 * Chebyshev, which is what the reveal mutator scores with: the ring you are
 * standing on, not the walk to get there. A grid is read in squares, so a
 * diagonal step is one step.
 */
export function shadeDist(a: ShadeCell, b: ShadeCell): number {
  return Math.max(Math.abs(a.row - b.row), Math.abs(a.col - b.col));
}

/**
 * What a guess that far out pays. Kept beside the grid so the bands drawn on
 * it, the pills under it and the tooltips inside it are all reading one
 * ladder, and so there is one place to change when the server's changes.
 */
export const SHADE_BANDS = [
  { dist: 0, points: 5, label: "spot on" },
  { dist: 1, points: 3, label: "1 away" },
  { dist: 2, points: 2, label: "2 away" },
  { dist: 3, points: 1, label: "3 away" },
] as const;

export function shadeScore(dist: number): number {
  return SHADE_BANDS.find((band) => dist <= band.dist)?.points ?? 0;
}

/** How far out a guess landed, in the words the tooltips use. */
export function shadeDistLabel(dist: number): string {
  return dist === 0 ? "Spot on" : `${dist} away`;
}

/** The strength the board draws each band's ring at, so the legend below can
 *  draw itself with the same numbers instead of guessing at them. */
const BAND_INK = [0.9, 0.55, 0.32, 0.16];

/**
 * The ladder, as four cells lifted off the board. Each one carries the ring it
 * is describing at the strength the grid draws it, so read left to right the
 * row is the same fade you are looking at up there, and the target keeps its
 * dot so the one that is the color itself is the one that looks like it.
 */
export function ShadeBands({ className = "" }: { className?: string }) {
  return (
    <div className={`sk-bands ${className}`.trim()}>
      {SHADE_BANDS.map((band) => (
        <span key={band.dist} className="sk-band" style={{ "--sk-band": BAND_INK[band.dist] } as CSSProperties}>
          <span
            className={`sk-band-swatch${band.dist === 0 ? " sk-band-swatch--target" : ""}`}
            aria-hidden="true"
          />
          <span className="sk-band-points">{band.points} pt{band.points === 1 ? "" : "s"}</span>
          <span className="sk-band-label">{band.label}</span>
        </span>
      ))}
    </div>
  );
}

/**
 * The board, and whatever this phase needs saying about it, underneath and
 * centered on it. Every phase of this game is that shape: the grid is the
 * thing you are looking at and the words are the caption, never the other way
 * round. So it is one component rather than each phase laying itself out and
 * getting the spacing slightly different.
 */
export function ShadeStage({ children, foot }: { children: ReactNode; foot?: ReactNode }) {
  return (
    <div className="sk-stage">
      {children}
      {foot && <div className="sk-stage-foot">{foot}</div>}
    </div>
  );
}

export interface ShadeMarker {
  sessionId: string;
  name: string;
  row: number;
  col: number;
  /** Rings the face, so yours is findable in a cell holding three of them. */
  you?: boolean;
  /** One more line under the name: which clue it was, what it paid. */
  note?: string;
}

export interface ShadeGridProps {
  rows: number;
  cols: number;
  seed: number;
  /** The cell you are holding, before it is anybody else's business. */
  selected?: ShadeCell | null;
  /** The leader's, once it is. */
  target?: ShadeCell | null;
  /** Rings the cells that are worth something. Needs a target. */
  zones?: boolean;
  /** Says what a cell would have paid, on hover. Needs a target. */
  scores?: boolean;
  /** Faces on the cells people picked. */
  markers?: ShadeMarker[];
  /** Given, the cells become buttons. Without it the grid is read only. */
  onSelect?: (cell: ShadeCell) => void;
  /** sm is the one you are only glancing at, beside something else. */
  size?: "sm" | "md";
  className?: string;
}

export function ShadeGrid({
  rows,
  cols,
  seed,
  selected,
  target,
  zones,
  scores,
  markers,
  onSelect,
  size = "md",
  className = "",
}: ShadeGridProps) {
  /* Two people can land on the same cell, and when they do the interesting
     thing is that they did, so the faces stack rather than one winning. */
  const byCell = new Map<string, ShadeMarker[]>();
  for (const marker of markers ?? []) {
    const key = `${marker.row}:${marker.col}`;
    const here = byCell.get(key);
    if (here) here.push(marker);
    else byCell.set(key, [marker]);
  }

  return (
    <div
      className={`sk-grid sk-grid--${size}${onSelect ? " sk-grid--live" : ""} ${className}`.trim()}
      style={{ "--sk-cols": cols } as CSSProperties}
      role={onSelect ? "group" : undefined}
      aria-label={onSelect ? "The color grid. Pick a cell." : "The color grid"}
    >
      {Array.from({ length: rows * cols }, (_, i) => {
        const row = Math.floor(i / cols);
        const col = i % cols;
        const cell = { row, col };

        const dist = target ? shadeDist(cell, target) : null;
        const band = dist !== null && dist <= 3 ? dist : null;
        const picked = selected?.row === row && selected?.col === col;
        const here = byCell.get(`${row}:${col}`);

        /* Faces beat the score hint. If somebody is standing on the cell,
           what you want off it is who, not what it would have paid. */
        const tooltip = here
          ? here.map((m) => (m.note ? `${m.name}\n${m.note}` : m.name)).join("\n\n")
          : scores && dist !== null
            ? `${shadeDistLabel(dist)}, ${shadeScore(dist)} pt${shadeScore(dist) === 1 ? "" : "s"}`
            : undefined;

        const inked = band !== null && zones;

        const classes = [
          "sk-cell",
          inked ? "sk-cell--band" : "",
          dist === 0 ? "is-target" : "",
          picked ? "is-picked" : "",
          here ? "is-marked" : "",
        ]
          .filter(Boolean)
          .join(" ");

        const inside = (
          <>
            {/* The target is a dot rather than another ring, so a cell that is
                both the target and somebody's guess can say both at once. */}
            {dist === 0 && <span className="sk-cell-dot" aria-hidden="true" />}

            {here && (
              <span className="sk-cell-marks">
                {here.map((marker) => (
                  <span key={marker.sessionId} className={`sk-mark${marker.you ? " sk-mark--you" : ""}`}>
                    <PlayerAvatar seed={marker.sessionId} />
                  </span>
                ))}
              </span>
            )}
          </>
        );

        const shared = {
          className: classes,
          style: {
            background: generateGridColor(row, col, rows, cols, seed),
            /* The ring's strength rides in on a var rather than a class per
               band, so the board and the legend under it are reading one
               ladder and there is one place to change it. */
            ...(inked ? { "--sk-band": BAND_INK[band] } : {}),
          } as CSSProperties,
          ...(tooltip ? { "data-tooltip": tooltip, "data-tooltip-pos": "top", "data-tooltip-variant": "game" } : {}),
        };

        return onSelect ? (
          <button
            key={i}
            type="button"
            aria-label={`Row ${row + 1}, column ${col + 1}`}
            aria-pressed={picked}
            onClick={() => onSelect(cell)}
            {...shared}
          >
            {inside}
          </button>
        ) : (
          <div key={i} {...shared}>
            {inside}
          </div>
        );
      })}
    </div>
  );
}
