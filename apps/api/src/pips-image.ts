/**
 * Pips puzzle image generator.
 *
 * The sibling of shikaku-image.ts, and deliberately the same shape: take a
 * puzzle the engine rebuilt from a seed, draw it to SVG, hand it back as an
 * image. The difference is what it refuses to do publicly: Shikaku's renderer
 * has an open ?solution=1 for the README embed, and this one does not. Ranked
 * runs are rebuilt from server-issued seeds, so a public solution route would
 * answer a live ranked run. Pips solutions are only ever rendered behind the
 * admin bearer token; the public routes at the bottom draw the board only.
 *
 * Routes:
 *   GET /api/pips/puzzle.svg  One board of a seeded run (query: ?seed=&board=&theme=)
 *   GET /api/pips/puzzle      Share page that drops you into that seeded run
 */

import { Hono, type Context } from "hono";

import {
  generateRun,
  PIPS_DIFFICULTY_CONFIG,
  PIPS_RUN_DIFFICULTIES,
  type PipsDifficulty,
  type PipsPlacement,
  type PipsPuzzle,
  type PipsRegionRule,
} from "@games/shared/games/pips-engine";
import { capitalize, getBaseUrl, parseOption, parseSeedParam, parseTheme, randomSeed, renderPuzzlePage, SITE_URL, svgResponse } from "./puzzle-page";
import { mixHex, svgPalette, SVG_FONT, SVG_MONO } from "./svg-theme";

/** The colors the site paints regions with, from PipsPage's REGION_COLORS. */
const REGION_COLORS = [
  "#e11d48",
  "#0891b2",
  "#7c3aed",
  "#f97316",
  "#2563eb",
  "#65a30d",
  "#ca8a04",
  "#db2777",
  "#0f766e",
  "#9333ea",
];

/** PipsPage's PIPS_DIFFICULTY_ACCENTS, plus darker ones for the light theme. */
export const PIPS_DIFF_ACCENT: Record<"dark" | "light", Record<PipsDifficulty, string>> = {
  dark: { easy: "#f59e0b", medium: "#fb7185", hard: "#f97316" },
  light: { easy: "#b45309", medium: "#be123c", hard: "#c2410c" },
};

export const PIPS_ORANGE = { dark: "#fb923c", light: "#c2410c" } as const;

export type PipsView = "board" | "solution" | "replay";

interface RenderOptions {
  theme?: "dark" | "light";
  view?: PipsView;
  /** The player's submitted placements, for view: "replay". */
  replay?: PipsPlacement[];
  /** Cells whose value differs from the canonical solution get outlined. */
  highlightMismatch?: boolean;
  /** false draws the board alone: no background, header, or footer. */
  framed?: boolean;
}

function escapeXml(value: string): string {
  return value.replace(/[<>&"']/g, (ch) =>
    ch === "<"
      ? "&lt;"
      : ch === ">"
        ? "&gt;"
        : ch === "&"
          ? "&amp;"
          : ch === '"'
            ? "&quot;"
            : "&apos;",
  );
}

function formatRule(rule: PipsRegionRule): string {
  if (rule.type === "sum") return String(rule.target);
  if (rule.type === "greaterThan") return `>${rule.target}`;
  if (rule.type === "lessThan") return `<${rule.target}`;
  if (rule.type === "equal") return "=";
  return "≠";
}

function cellKey(r: number, c: number) {
  return `${r},${c}`;
}

/**
 * The value each cell ends up holding under a set of placements.
 *
 * A domino covers two cells; `flipped` decides which end lands on which. This
 * mirrors getPlacementValueGrid in the engine, but tolerates a partial or
 * invalid replay rather than bailing, because drawing what the player actually
 * submitted is the entire point of the replay view.
 */
function valueGrid(
  puzzle: PipsPuzzle,
  placements: PipsPlacement[],
): Map<string, number> {
  const byId = new Map(puzzle.dominoes.map((d) => [d.id, d]));
  const grid = new Map<string, number>();

  for (const placement of placements) {
    const domino = byId.get(placement.dominoId);
    if (!domino) continue;
    const [first, second] = placement.flipped
      ? [domino.b, domino.a]
      : [domino.a, domino.b];
    grid.set(cellKey(placement.r1, placement.c1), first);
    grid.set(cellKey(placement.r2, placement.c2), second);
  }

  return grid;
}

/** The pip dots for a value, laid out on the usual domino faces. */
function pipDots(value: number, cx: number, cy: number, size: number): string {
  const offset = size * 0.22;
  const radius = Math.max(1.4, size * 0.07);
  const layouts: Record<number, Array<[number, number]>> = {
    0: [],
    1: [[0, 0]],
    2: [
      [-1, -1],
      [1, 1],
    ],
    3: [
      [-1, -1],
      [0, 0],
      [1, 1],
    ],
    4: [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ],
    5: [
      [-1, -1],
      [1, -1],
      [0, 0],
      [-1, 1],
      [1, 1],
    ],
    6: [
      [-1, -1],
      [1, -1],
      [-1, 0],
      [1, 0],
      [-1, 1],
      [1, 1],
    ],
  };

  const dots = layouts[value] ?? [];
  if (dots.length === 0) {
    // A blank face still needs to read as a face, not as an empty cell.
    return `<circle cx="${cx}" cy="${cy}" r="${radius * 0.7}" fill="currentColor" opacity="0.28"/>`;
  }

  return dots
    .map(
      ([dx, dy]) =>
        `<circle cx="${(cx + dx * offset).toFixed(1)}" cy="${(cy + dy * offset).toFixed(1)}" r="${radius.toFixed(1)}" fill="currentColor"/>`,
    )
    .join("");
}

export function renderPipsSvg(
  puzzle: PipsPuzzle,
  seed: number,
  opts: RenderOptions = {},
): string {
  const { theme = "dark", view = "board", replay, highlightMismatch = true, framed = true } = opts;
  const { rows, cols, cells, regions } = puzzle;

  const cellSize = rows <= 5 ? 54 : rows <= 7 ? 44 : 36;
  // Unframed keeps 2px so the region outlines on the edge aren't clipped.
  const padding = framed ? 24 : 2;
  const headerHeight = framed ? 40 : 0;
  const footerHeight = framed ? 32 : 0;
  const gridW = cols * cellSize;
  const gridH = rows * cellSize;
  const totalW = gridW + padding * 2;
  const totalH = gridH + padding * 2 + headerHeight + footerHeight;

  const palette = svgPalette(theme);
  const bg = palette.bg;
  const cellBg = palette.card;
  const gridLine = palette.border;
  const mutedText = palette.muted;
  const accent = PIPS_DIFF_ACCENT[theme][puzzle.difficulty] ?? PIPS_ORANGE[theme];

  const gridX = padding;
  const gridY = padding + headerHeight;

  // Which placements to draw, and what to compare them against.
  const shown =
    view === "solution" ? puzzle.solution : view === "replay" ? (replay ?? []) : [];
  const values = valueGrid(puzzle, shown);
  const canonical =
    view === "replay" && highlightMismatch
      ? valueGrid(puzzle, puzzle.solution)
      : null;

  const playable = new Set(cells.map((cell) => cellKey(cell.r, cell.c)));
  const regionOf = new Map<string, { color: string; rule: PipsRegionRule }>();
  for (const region of regions) {
    const color = REGION_COLORS[region.colorIndex % REGION_COLORS.length]!;
    for (const cell of region.cells) {
      regionOf.set(cellKey(cell.r, cell.c), { color, rule: region.rule });
    }
  }

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${totalW}" height="${totalH}" viewBox="0 0 ${totalW} ${totalH}" font-family="${SVG_FONT}">`;
  if (framed) {
    svg += `<rect width="${totalW}" height="${totalH}" rx="6" fill="${bg}"/>`;
  }

  const viewLabel =
    view === "solution" ? "Solution" : view === "replay" ? "Submitted run" : "Board";
  const difficultyName = puzzle.difficulty.charAt(0).toUpperCase() + puzzle.difficulty.slice(1);
  const headerY = padding + 18;
  if (framed) {
    svg += `<text x="${padding}" y="${headerY}" font-size="20" font-weight="900" letter-spacing="-0.4" fill="${PIPS_ORANGE[theme]}">Pips</text>`;
    svg += `<text x="${totalW - padding}" y="${headerY}" text-anchor="end" font-size="13" font-weight="700"><tspan fill="${mutedText}" font-weight="600">${viewLabel}</tspan><tspan dx="8" fill="${accent}">${escapeXml(difficultyName)}</tspan><tspan dx="8" fill="${mutedText}" font-weight="600">${rows}×${cols}</tspan></text>`;
  }

  // Cells: only the ones the puzzle actually contains, tinted by their region.
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const key = cellKey(r, c);
      if (!playable.has(key)) continue;

      const x = gridX + c * cellSize;
      const y = gridY + r * cellSize;
      const region = regionOf.get(key);
      const fill = region
        ? mixHex(region.color, cellBg, 0.22)
        : cellBg;

      svg += `<rect x="${x}" y="${y}" width="${cellSize}" height="${cellSize}" fill="${fill}" stroke="${gridLine}" stroke-width="1"/>`;
    }
  }

  // Region outlines: draw an edge wherever a cell's neighbour is in a
  // different region, which traces each region without any path stitching.
  for (const region of regions) {
    const color = REGION_COLORS[region.colorIndex % REGION_COLORS.length]!;
    const inRegion = new Set(region.cells.map((cell) => cellKey(cell.r, cell.c)));

    for (const cell of region.cells) {
      const x = gridX + cell.c * cellSize;
      const y = gridY + cell.r * cellSize;
      const edges: Array<[number, number, number, number]> = [];
      if (!inRegion.has(cellKey(cell.r - 1, cell.c))) edges.push([x, y, x + cellSize, y]);
      if (!inRegion.has(cellKey(cell.r + 1, cell.c)))
        edges.push([x, y + cellSize, x + cellSize, y + cellSize]);
      if (!inRegion.has(cellKey(cell.r, cell.c - 1))) edges.push([x, y, x, y + cellSize]);
      if (!inRegion.has(cellKey(cell.r, cell.c + 1)))
        edges.push([x + cellSize, y, x + cellSize, y + cellSize]);

      for (const [x1, y1, x2, y2] of edges) {
        svg += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="2.5" stroke-linecap="round"/>`;
      }
    }
  }

  // Placed values, as domino faces.
  for (const [key, value] of values) {
    const [r, c] = key.split(",").map(Number) as [number, number];
    const x = gridX + c * cellSize;
    const y = gridY + r * cellSize;
    const mismatch = canonical !== null && canonical.get(key) !== value;

    svg += `<rect x="${x + 3}" y="${y + 3}" width="${cellSize - 6}" height="${cellSize - 6}" rx="4" fill="${palette.text}" opacity="0.94"/>`;
    svg += `<g color="${bg}">${pipDots(value, x + cellSize / 2, y + cellSize / 2, cellSize)}</g>`;

    if (mismatch) {
      // The whole reason the replay view exists: show where a submitted run
      // disagrees with the canonical board rather than just failing it.
      svg += `<rect x="${x + 1.5}" y="${y + 1.5}" width="${cellSize - 3}" height="${cellSize - 3}" rx="5" fill="none" stroke="#f87171" stroke-width="2.5"/>`;
    }
  }

  // Rule labels go on last, on purpose. Drawn with the region outlines they
  // were painted over by the domino faces in the solution and replay views,
  // which hid the one piece of information the whole puzzle turns on.
  for (const region of regions) {
    const color = REGION_COLORS[region.colorIndex % REGION_COLORS.length]!;
    const anchor = region.cells.reduce((best, cell) =>
      cell.r < best.r || (cell.r === best.r && cell.c < best.c) ? cell : best,
    );
    const lx = gridX + anchor.c * cellSize + 3;
    const ly = gridY + anchor.r * cellSize + 3;
    const label = formatRule(region.rule);
    svg += `<rect x="${lx}" y="${ly}" width="${label.length * 6 + 8}" height="13" rx="3" fill="${color}" stroke="${bg}" stroke-width="0.75"/>`;
    svg += `<text x="${lx + 4}" y="${ly + 10}" font-size="9" font-weight="700" fill="#ffffff">${escapeXml(label)}</text>`;
  }

  if (view === "replay" && shown.length === 0) {
    svg += `<text x="${totalW / 2}" y="${gridY + gridH / 2}" text-anchor="middle" font-size="12" fill="${mutedText}">No replay stored for this run</text>`;
  }

  const footerY = gridY + gridH + 22;
  if (framed) svg += `<text x="${padding}" y="${footerY}" font-size="11" fill="${mutedText}">${puzzle.dominoes.length} dominoes, ${regions.length} regions</text>`;
  if (framed) svg += `<text x="${totalW - padding}" y="${footerY}" text-anchor="end" font-family="${SVG_MONO}" font-size="11" fill="${mutedText}">#${seed}</text>`;
  svg += "</svg>";

  return svg;
}

/* ── Public routes: board only, never a solution ───────────── */

/** A seed makes a run of three boards, easy to hard. `board` picks which one to draw. */
function boardFromQuery(c: Context) {
  const seed = parseSeedParam(c.req.query("seed")) ?? randomSeed();
  const board = parseOption(c.req.query("board"), PIPS_RUN_DIFFICULTIES, "easy");
  const puzzle = generateRun(seed).puzzles[PIPS_RUN_DIFFICULTIES.indexOf(board)]!;
  return { seed, board, puzzle, filename: `pips-${seed}-${board}.svg` };
}

export const pipsImageRoutes = new Hono();

pipsImageRoutes.get("/puzzle.svg", (c) => {
  const { seed, puzzle, filename } = boardFromQuery(c);
  return svgResponse(c, renderPipsSvg(puzzle, seed, { theme: parseTheme(c.req.query("theme")) }), filename);
});

pipsImageRoutes.get("/puzzle.svg/download", (c) => {
  const { seed, puzzle, filename } = boardFromQuery(c);
  return svgResponse(c, renderPipsSvg(puzzle, seed, { theme: parseTheme(c.req.query("theme")) }), filename, true);
});

pipsImageRoutes.get("/puzzle", (c) => {
  const { seed, board, puzzle } = boardFromQuery(c);
  const baseUrl = getBaseUrl(c);
  const query = `seed=${seed}&board=${board}`;
  const playUrl = `${SITE_URL}/pips?from=puzzle&seed=${seed}`;
  if (c.req.query("play") === "1") return c.redirect(playUrl, 302);

  return c.html(renderPuzzlePage({
    game: "Pips",
    color: PIPS_ORANGE.dark,
    subtitle: "Place every domino so each colored region satisfies its rule.",
    title: `Pips Run ${seed}: ${capitalize(board)} board`,
    description: `A seeded Pips run: three domino boards from easy to hard. Seed ${seed}.`,
    pageUrl: `${baseUrl}/api/pips/puzzle?${query}`,
    imageUrl: `${baseUrl}/api/pips/puzzle.svg?${query}`,
    board: renderPipsSvg(puzzle, seed, { framed: false }),
    pickerLabel: "Board in this run",
    options: PIPS_RUN_DIFFICULTIES.map((d) => ({
      label: capitalize(d),
      hint: `${PIPS_DIFFICULTY_CONFIG[d].rows}×${PIPS_DIFFICULTY_CONFIG[d].cols}`,
      href: `${baseUrl}/api/pips/puzzle?seed=${seed}&board=${d}`,
      accent: PIPS_DIFF_ACCENT.dark[d],
      current: d === board,
    })),
    seed,
    newUrl: `${baseUrl}/api/pips/puzzle`,
    downloadUrl: `${baseUrl}/api/pips/puzzle.svg/download?${query}`,
    playUrl,
    playLabel: "Play this run",
    links: [],
  }));
});
