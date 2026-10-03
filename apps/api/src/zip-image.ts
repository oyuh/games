import { pathSegments, segmentColor, validatePath, type ZipPuzzle } from "@games/shared/games/zip-engine";

/**
 * A Zip board as an SVG, for the admin panel. Same picture as the game: walls
 * over the line, numbers over everything, each stretch in its own color. The
 * replay view draws what the player submitted and turns the frame red when
 * that path doesn't actually solve the board.
 */
export function renderZipSvg(
  puzzle: ZipPuzzle,
  seed: number,
  opts: { theme?: "dark" | "light"; view?: "board" | "solution" | "replay"; replay?: number[] } = {},
): string {
  const { theme = "dark", view = "board", replay = [] } = opts;
  const n = puzzle.size;
  const cell = n <= 6 ? 52 : n <= 8 ? 42 : n <= 10 ? 34 : 30;
  const pad = 20;
  const header = 34;
  const grid = n * cell;
  const width = grid + pad * 2;
  const height = grid + pad * 2 + header;

  const bg = theme === "dark" ? "#0f1117" : "#ffffff";
  const cellBg = theme === "dark" ? "#1a1d27" : "#f3f4f6";
  const line = theme === "dark" ? "#2a2d3a" : "#d1d5db";
  const text = theme === "dark" ? "#e2e8f0" : "#1f2937";
  const muted = theme === "dark" ? "#64748b" : "#9ca3af";

  const path = view === "solution" ? puzzle.solution : view === "replay" ? replay : [];
  const broken = view === "replay" && !validatePath(puzzle, replay);
  const frame = broken ? "#f87171" : "#facc15";
  const x0 = pad;
  const y0 = pad + header;
  const cx = (c: number) => x0 + (c % n) * cell + cell / 2;
  const cy = (c: number) => y0 + Math.floor(c / n) * cell + cell / 2;

  const parts: string[] = [];
  parts.push(`<rect width="${width}" height="${height}" fill="${bg}"/>`);
  const label = view === "replay" ? (broken ? "replay, does not solve" : "replay") : view;
  parts.push(`<text x="${pad}" y="${pad + 14}" fill="${text}" font-family="system-ui, sans-serif" font-size="14" font-weight="700">Zip ${n}x${n}</text>`);
  parts.push(`<text x="${width - pad}" y="${pad + 14}" fill="${muted}" font-family="system-ui, sans-serif" font-size="12" text-anchor="end">seed ${seed} · ${label}</text>`);
  parts.push(`<rect x="${x0}" y="${y0}" width="${grid}" height="${grid}" rx="6" fill="${cellBg}" stroke="${frame}" stroke-width="2"/>`);

  for (let i = 1; i < n; i++) {
    parts.push(`<line x1="${x0 + i * cell}" y1="${y0}" x2="${x0 + i * cell}" y2="${y0 + grid}" stroke="${line}"/>`);
    parts.push(`<line x1="${x0}" y1="${y0 + i * cell}" x2="${x0 + grid}" y2="${y0 + i * cell}" stroke="${line}"/>`);
  }

  pathSegments(puzzle, path).forEach((run, k) => {
    if (run.length < 2) return;
    const points = run.map((c) => `${cx(c)},${cy(c)}`).join(" ");
    parts.push(`<polyline points="${points}" fill="none" stroke="${segmentColor(k)}" stroke-width="${(cell * 0.24).toFixed(1)}" stroke-linecap="round" stroke-linejoin="round"/>`);
  });

  for (const [a, b] of puzzle.walls) {
    const r = Math.floor(a / n);
    const c = a % n;
    const [x1, y1, x2, y2] = b === a + 1
      ? [x0 + (c + 1) * cell, y0 + r * cell, x0 + (c + 1) * cell, y0 + (r + 1) * cell]
      : [x0 + c * cell, y0 + (r + 1) * cell, x0 + (c + 1) * cell, y0 + (r + 1) * cell];
    parts.push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${text}" stroke-width="${(cell * 0.12).toFixed(1)}" stroke-linecap="round"/>`);
  }

  const radius = cell * 0.25;
  puzzle.checkpoints.forEach((c, i) => {
    parts.push(`<circle cx="${cx(c)}" cy="${cy(c)}" r="${radius.toFixed(1)}" fill="${text}"/>`);
    parts.push(`<text x="${cx(c)}" y="${cy(c)}" fill="${bg}" font-family="system-ui, sans-serif" font-size="${(cell * 0.26).toFixed(1)}" font-weight="800" text-anchor="middle" dominant-baseline="central">${i + 1}</text>`);
  });

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${parts.join("")}</svg>`;
}
