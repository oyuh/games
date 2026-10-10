/**
 * Zip puzzle image generator.
 *
 * Routes:
 *   GET /api/zip/puzzle.svg  The first board of a seeded run (query: ?difficulty=&seed=&theme=)
 *   GET /api/zip/puzzle      Share page that drops you into that seeded run
 *
 * Like Pips, the public routes draw the board only. Ranked runs are rebuilt
 * from server-issued seeds, so solutions stay behind the admin token.
 */

import { Hono, type Context } from "hono";

import { DIFFICULTY_CONFIG, generateRun, pathSegments, segmentColor, validatePath, type Difficulty, type ZipPuzzle } from "@games/shared/games/zip-engine";
import { capitalize, getBaseUrl, parseOption, parseSeedParam, parseTheme, randomSeed, renderPuzzlePage, SITE_URL, svgResponse } from "./puzzle-page";
import { svgPalette, SVG_FONT, SVG_MONO } from "./svg-theme";

const ZIP_YELLOW = { dark: "#facc15", light: "#a16207" } as const;

/**
 * A Zip board as an SVG. Same picture as the game: walls over the line,
 * numbers over everything, each stretch in its own color. The replay view
 * draws what the player submitted and turns the board's border red when that
 * path doesn't actually solve it. `framed: false` draws the board alone.
 */
export function renderZipSvg(
  puzzle: ZipPuzzle,
  seed: number,
  opts: { theme?: "dark" | "light"; view?: "board" | "solution" | "replay"; replay?: number[]; framed?: boolean } = {},
): string {
  const { theme = "dark", view = "board", replay = [], framed = true } = opts;
  const n = puzzle.size;
  const cell = n <= 6 ? 52 : n <= 8 ? 42 : n <= 10 ? 34 : 30;
  // Unframed keeps 2px so the board's border isn't clipped.
  const pad = framed ? 24 : 2;
  const header = framed ? 40 : 0;
  const footer = framed ? 32 : 0;
  const grid = n * cell;
  const width = grid + pad * 2;
  const height = grid + pad * 2 + header + footer;

  const { bg, card: cellBg, border: line, text, muted } = svgPalette(theme);

  const path = view === "solution" ? puzzle.solution : view === "replay" ? replay : [];
  const broken = view === "replay" && !validatePath(puzzle, replay);
  const frame = broken ? "#f87171" : line;
  const x0 = pad;
  const y0 = pad + header;
  const cx = (c: number) => x0 + (c % n) * cell + cell / 2;
  const cy = (c: number) => y0 + Math.floor(c / n) * cell + cell / 2;

  const parts: string[] = [];
  if (framed) {
    const label = view === "replay" ? (broken ? "Replay (does not solve)" : "Replay") : view === "solution" ? "Solution" : "Board";
    const headerY = pad + 18;
    const footerY = y0 + grid + 22;
    parts.push(`<rect width="${width}" height="${height}" rx="6" fill="${bg}"/>`);
    parts.push(`<text x="${pad}" y="${headerY}" fill="${ZIP_YELLOW[theme]}" font-size="20" font-weight="900" letter-spacing="-0.4">Zip</text>`);
    parts.push(`<text x="${width - pad}" y="${headerY}" text-anchor="end" font-size="13" font-weight="600"><tspan fill="${broken ? "#f87171" : muted}">${label}</tspan><tspan dx="8" fill="${muted}">${n}×${n}</tspan></text>`);
    parts.push(`<text x="${pad}" y="${footerY}" fill="${muted}" font-size="11">${puzzle.checkpoints.length} dots, ${puzzle.walls.length} walls</text>`);
    parts.push(`<text x="${width - pad}" y="${footerY}" text-anchor="end" fill="${muted}" font-family="${SVG_MONO}" font-size="11">#${seed}</text>`);
  }
  parts.push(`<rect x="${x0}" y="${y0}" width="${grid}" height="${grid}" rx="6" fill="${cellBg}" stroke="${frame}" stroke-width="${broken ? 2 : 1}"/>`);

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
    parts.push(`<text x="${cx(c)}" y="${cy(c)}" fill="${bg}" font-size="${(cell * 0.26).toFixed(1)}" font-weight="800" text-anchor="middle" dominant-baseline="central">${i + 1}</text>`);
  });

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="${SVG_FONT}">${parts.join("")}</svg>`;
}

/* ── Public routes: board only, never a solution ───────────── */

const DIFFICULTIES = Object.keys(DIFFICULTY_CONFIG) as Difficulty[];

/** A seed and difficulty make a run of three boards; the share shows the first. */
function boardFromQuery(c: Context) {
  const seed = parseSeedParam(c.req.query("seed")) ?? randomSeed();
  const difficulty = parseOption(c.req.query("difficulty"), DIFFICULTIES, "medium");
  const puzzle = generateRun(seed, difficulty)[0]!;
  return { seed, difficulty, puzzle, filename: `zip-${difficulty}-${seed}.svg` };
}

export const zipImageRoutes = new Hono();

zipImageRoutes.get("/puzzle.svg", (c) => {
  const { seed, puzzle, filename } = boardFromQuery(c);
  return svgResponse(c, renderZipSvg(puzzle, seed, { theme: parseTheme(c.req.query("theme")) }), filename);
});

zipImageRoutes.get("/puzzle.svg/download", (c) => {
  const { seed, puzzle, filename } = boardFromQuery(c);
  return svgResponse(c, renderZipSvg(puzzle, seed, { theme: parseTheme(c.req.query("theme")) }), filename, true);
});

zipImageRoutes.get("/puzzle", (c) => {
  const { seed, difficulty, puzzle } = boardFromQuery(c);
  const baseUrl = getBaseUrl(c);
  const query = `difficulty=${difficulty}&seed=${seed}`;
  const playUrl = `${SITE_URL}/zip?from=puzzle&seed=${seed}&difficulty=${difficulty}`;
  if (c.req.query("play") === "1") return c.redirect(playUrl, 302);

  const size = DIFFICULTY_CONFIG[difficulty].size;
  return c.html(renderPuzzlePage({
    game: "Zip",
    color: ZIP_YELLOW.dark,
    subtitle: "Draw one line through every square, hitting the numbers in order.",
    title: `Zip Run: ${capitalize(difficulty)} ${size}×${size}`,
    description: `A seeded ${difficulty} Zip run: three ${size}×${size} boards. Seed ${seed}.`,
    pageUrl: `${baseUrl}/api/zip/puzzle?${query}`,
    imageUrl: `${baseUrl}/api/zip/puzzle.svg?${query}`,
    board: renderZipSvg(puzzle, seed, { framed: false }),
    pickerLabel: "Difficulty",
    options: DIFFICULTIES.map((d) => ({
      label: DIFFICULTY_CONFIG[d].label,
      hint: `${DIFFICULTY_CONFIG[d].size}×${DIFFICULTY_CONFIG[d].size}`,
      href: `${baseUrl}/api/zip/puzzle?difficulty=${d}`,
      accent: ZIP_YELLOW.dark,
      current: d === difficulty,
    })),
    seed,
    newUrl: `${baseUrl}/api/zip/puzzle?difficulty=${difficulty}`,
    downloadUrl: `${baseUrl}/api/zip/puzzle.svg/download?${query}`,
    playUrl,
    playLabel: "Play this run",
    links: [],
  }));
});
