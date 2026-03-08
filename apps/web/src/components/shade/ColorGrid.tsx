import { useCallback, useMemo, useRef, useState } from "react";

/**
 * Deterministic color grid generation from seed.
 * Uses HSL: hue varies across columns, lightness varies across rows,
 * with slight saturation variation seeded for visual interest.
 */
export function generateGridColor(row: number, col: number, rows: number, cols: number, seed: number): string {
  // Seeded pseudo-random for saturation jitter
  const hash = ((seed * 2654435761 + row * 131 + col * 137) >>> 0) % 1000;
  const satJitter = (hash / 1000) * 12 - 6; // ±6%

  const hue = (col / cols) * 360;
  const lightness = 28 + (row / (rows - 1)) * 44; // 28%–72%
  const saturation = Math.max(40, Math.min(90, 70 + satJitter));

  return `hsl(${hue.toFixed(1)}, ${saturation.toFixed(1)}%, ${lightness.toFixed(1)}%)`;
}

type GridProps = {
  rows: number;
  cols: number;
  seed: number;
  /** Currently selected cell (controlled) */
  selected?: { row: number; col: number } | null;
  /** Callback when user picks a cell */
  onSelect?: (row: number, col: number) => void;
  /** Whether the grid is interactive */
  interactive?: boolean;
  /** Target cell to reveal */
  target?: { row: number; col: number } | null;
  /** Show target highlight */
  showTarget?: boolean;
  /** All guess markers to overlay */
  markers?: Array<{
    sessionId: string;
    name: string;
    row: number;
    col: number;
    color?: string;
    isOwn?: boolean;
    tooltip?: string;
  }>;
  /** Compact mode for smaller display */
  compact?: boolean;
};

export function ColorGrid({
  rows,
  cols,
  seed,
  selected,
  onSelect,
  interactive = false,
  target,
  showTarget = false,
  markers = [],
  compact = false,
}: GridProps) {
  const gridRef = useRef<HTMLDivElement>(null);
  const [hoveredCell, setHoveredCell] = useState<{ row: number; col: number } | null>(null);

  const grid = useMemo(() => {
    const cells: string[][] = [];
    for (let r = 0; r < rows; r++) {
      cells[r] = [];
      for (let c = 0; c < cols; c++) {
        cells[r]![c] = generateGridColor(r, c, rows, cols, seed);
      }
    }
    return cells;
  }, [rows, cols, seed]);

  // Group markers by cell
  const markersByCell = useMemo(() => {
    const map = new Map<string, typeof markers>();
    for (const m of markers) {
      const key = `${m.row}-${m.col}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(m);
    }
    return map;
  }, [markers]);

  const handleCellClick = useCallback(
    (r: number, c: number) => {
      if (!interactive || !onSelect) return;
      onSelect(r, c);
    },
    [interactive, onSelect]
  );

  const cellSize = compact ? "clamp(16px, 2.5vw, 24px)" : "clamp(24px, 3.8vw, 38px)";

  return (
    <div className="shade-grid-wrapper">
      <div className="shade-grid-main">
        <div
          ref={gridRef}
          className={`shade-grid${interactive ? " shade-grid--interactive" : ""}${compact ? " shade-grid--compact" : ""}`}
          style={{
            gridTemplateColumns: `repeat(${cols}, ${cellSize})`,
            gridTemplateRows: `repeat(${rows}, ${cellSize})`,
          }}
        >
          {grid.map((row, r) =>
            row.map((color, c) => {
              const isSelected = selected?.row === r && selected?.col === c;
              const isTarget = showTarget && target?.row === r && target?.col === c;
              const isHovered = hoveredCell?.row === r && hoveredCell?.col === c;
              const cellMarkers = markersByCell.get(`${r}-${c}`);
              const hasMarkers = cellMarkers && cellMarkers.length > 0;

              // Build cell-level tooltip combining all markers on this cell
              const cellTooltip = hasMarkers
                ? cellMarkers.map((m) => m.tooltip ?? m.name).join("  ·  ")
                : undefined;

              return (
                <div
                  key={`${r}-${c}`}
                  className={[
                    "shade-cell",
                    isSelected && "shade-cell--selected",
                    isTarget && "shade-cell--target",
                    isHovered && interactive && "shade-cell--hover",
                    hasMarkers && "shade-cell--marked",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  style={{ backgroundColor: color }}
                  data-tooltip={cellTooltip}
                  data-tooltip-pos={cellTooltip ? "top" : undefined}
                  onClick={() => handleCellClick(r, c)}
                  onMouseEnter={() => interactive && setHoveredCell({ row: r, col: c })}
                  onMouseLeave={() => interactive && setHoveredCell(null)}
                  role={interactive ? "button" : undefined}
                  tabIndex={interactive ? 0 : undefined}
                  onKeyDown={
                    interactive
                      ? (e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            handleCellClick(r, c);
                          }
                        }
                      : undefined
                  }
                >
                  {isTarget && (
                    <div className="shade-cell-target-ring" data-tooltip="Target Color 🎯" data-tooltip-pos="top" />
                  )}
                  {isSelected && !isTarget && (
                    <div className="shade-cell-selection" />
                  )}
                  {hasMarkers && (
                    <div className="shade-cell-markers">
                      {cellMarkers.map((m, i) => (
                        <div
                          key={m.sessionId + i}
                          className={`shade-marker${m.isOwn ? " shade-marker--own" : ""}`}
                          data-tooltip={m.tooltip ?? m.name}
                          data-tooltip-pos="top"
                        >
                          {m.name.charAt(0).toUpperCase()}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
