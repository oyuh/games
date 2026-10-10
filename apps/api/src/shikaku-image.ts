/**
 * Shikaku puzzle image generator. Serves dynamic SVG puzzle images
 * and an HTML preview page with OG/Twitter embed tags.
 *
 * Routes:
 *   GET /api/shikaku/puzzle.svg  Random puzzle SVG (query: ?difficulty=&seed=&theme=)
 *   GET /api/shikaku/puzzle      HTML page with puzzle display, download, and embeds
 */

import { Context, Hono } from "hono";

import { DIFFICULTY_CONFIG, generatePuzzle, mulberry32, type Difficulty, type Rect, type ShikakuPuzzle } from "@games/shared/games/shikaku-engine";
import { capitalize, getBaseUrl, getRequestProto, parseOption, parseSeedParam, parseTheme, randomSeed, renderPuzzlePage, SITE_URL, svgResponse } from "./puzzle-page";
import { svgPalette, SVG_FONT, SVG_MONO } from "./svg-theme";

/* ── SVG rendering ─────────────────────────────────────────── */

const RECT_COLORS = [
  "#34d399", "#60a5fa", "#f472b6", "#a78bfa", "#fb923c",
  "#facc15", "#4ade80", "#38bdf8", "#f87171", "#c084fc",
  "#2dd4bf", "#fbbf24", "#818cf8", "#e879f9", "#22d3ee",
  "#a3e635", "#fb7185", "#fdba74", "#86efac", "#93c5fd",
];

const DIFF_ACCENT: Record<Difficulty, string> = {
  easy:   "#34d399",
  medium: "#60a5fa",
  hard:   "#f59e0b",
  expert: "#f87171",
};

// The same four, dark enough to read on the light theme's #e8e6e3.
const DIFF_ACCENT_LIGHT: Record<Difficulty, string> = {
  easy:   "#047857",
  medium: "#1d4ed8",
  hard:   "#b45309",
  expert: "#b91c1c",
};

const SHIKAKU_GREEN = { dark: "#34d399", light: "#047857" } as const;

const README_SEED_TTL_MS = 15 * 60 * 1000;
const README_SEED_COOKIE_MAX_AGE_SECONDS = README_SEED_TTL_MS / 1000;
const readmeSeedCache = new Map<string, { seed: number; createdAt: number }>();

type PaddingMode = "normal" | "tight" | "none";

interface RenderOptions {
  theme?: "dark" | "light";
  showSolution?: boolean;
  /**
   * The rectangles a player actually submitted. Drawn instead of the canonical
   * solution, with anything that is not also a canonical rectangle outlined,
   * so a flagged run becomes a picture rather than a validation code.
   */
  replay?: Rect[];
  transparentBg?: boolean;
  paddingMode?: PaddingMode;
}

export function renderPuzzleSvg(puzzle: ShikakuPuzzle, difficulty: Difficulty, seed: number, opts: RenderOptions = {}): string {
  const { theme = "dark", showSolution = false, transparentBg = false, paddingMode = "normal", replay } = opts;
  const { rows, cols, numbers, solution } = puzzle;
  const palette = svgPalette(theme);

  const cellSize = rows <= 9 ? 48 : rows <= 15 ? 32 : 24;
  // "none" keeps one pixel so the board's own border isn't cut in half.
  const padding = paddingMode === "none" ? 1 : paddingMode === "tight" ? 8 : 24;
  const framed = !transparentBg && paddingMode === "normal";
  const headerHeight = framed ? 40 : 0;
  const footerHeight = framed ? 32 : 0;
  const gridW = cols * cellSize;
  const gridH = rows * cellSize;
  const totalW = gridW + padding * 2;
  const totalH = gridH + padding * 2 + headerHeight + footerHeight;
  const gridX = padding;
  const gridY = padding + headerHeight;
  const accent = (theme === "dark" ? DIFF_ACCENT : DIFF_ACCENT_LIGHT)[difficulty];
  const difficultyName = difficulty.charAt(0).toUpperCase() + difficulty.slice(1);

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${totalW}" height="${totalH}" viewBox="0 0 ${totalW} ${totalH}" font-family="${SVG_FONT}">`;

  if (!transparentBg) {
    svg += `<rect width="${totalW}" height="${totalH}" rx="6" fill="${palette.bg}"/>`;
  }

  if (framed) {
    const baseline = padding + 18;
    svg += `<text x="${padding}" y="${baseline}" font-size="20" font-weight="900" letter-spacing="-0.4" fill="${SHIKAKU_GREEN[theme]}">Shikaku</text>`;
    svg += `<text x="${totalW - padding}" y="${baseline}" text-anchor="end" font-size="13" font-weight="700"><tspan fill="${accent}">${difficultyName}</tspan><tspan dx="8" fill="${palette.muted}" font-weight="600">${rows}×${cols}</tspan></text>`;
  }

  svg += `<rect x="${gridX}" y="${gridY}" width="${gridW}" height="${gridH}" rx="6" fill="${palette.card}"/>`;

  const drawRect = (rect: Rect, color: string, strokeWidth: number, fillOpacity: number, strokeOpacity: number) => {
    const x = gridX + rect.c * cellSize + 2;
    const y = gridY + rect.r * cellSize + 2;
    const w = rect.w * cellSize - 4;
    const h = rect.h * cellSize - 4;
    svg += `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="3" fill="${color}" fill-opacity="${fillOpacity}" stroke="${color}" stroke-width="${strokeWidth}" stroke-opacity="${strokeOpacity}"/>`;
  };

  if (replay) {
    // A rectangle is "canonical" if the solution contains one at the same
    // position and size. Anything else is what the player did differently.
    const canonical = new Set(solution.map((rect) => `${rect.r},${rect.c},${rect.w},${rect.h}`));
    replay.forEach((rect, i) => {
      const matches = canonical.has(`${rect.r},${rect.c},${rect.w},${rect.h}`);
      if (matches) drawRect(rect, RECT_COLORS[i % RECT_COLORS.length]!, 2, 0.22, 0.7);
      else drawRect(rect, "#f87171", 3, 0.18, 1);
    });
  } else if (showSolution) {
    solution.forEach((rect, i) => drawRect(rect, RECT_COLORS[i % RECT_COLORS.length]!, 2, 0.22, 0.7));
  }

  // Inner grid lines only; the board's border covers the outside edge.
  for (let r = 1; r < rows; r++) {
    svg += `<line x1="${gridX}" y1="${gridY + r * cellSize}" x2="${gridX + gridW}" y2="${gridY + r * cellSize}" stroke="${palette.border}" stroke-width="1"/>`;
  }
  for (let c = 1; c < cols; c++) {
    svg += `<line x1="${gridX + c * cellSize}" y1="${gridY}" x2="${gridX + c * cellSize}" y2="${gridY + gridH}" stroke="${palette.border}" stroke-width="1"/>`;
  }
  svg += `<rect x="${gridX}" y="${gridY}" width="${gridW}" height="${gridH}" rx="6" fill="none" stroke="${palette.border}" stroke-width="1"/>`;

  const fontSize = cellSize <= 24 ? 11 : cellSize <= 32 ? 14 : 18;
  for (const num of numbers) {
    const cx = gridX + num.c * cellSize + cellSize / 2;
    const cy = gridY + num.r * cellSize + cellSize / 2;
    svg += `<text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="central" font-size="${fontSize}" font-weight="700" fill="${palette.text}">${num.value}</text>`;
  }

  if (framed) {
    const baseline = gridY + gridH + 22;
    svg += `<text x="${padding}" y="${baseline}" font-size="11" fill="${palette.muted}">games.lawsonhart.me</text>`;
    svg += `<text x="${totalW - padding}" y="${baseline}" text-anchor="end" font-family="${SVG_MONO}" font-size="11" fill="${palette.muted}">#${seed}</text>`;
  }

  svg += `</svg>`;
  return svg;
}

/* ── Parameter parsing ─────────────────────────────────────── */

const DIFFICULTIES: Difficulty[] = ["easy", "medium", "hard", "expert"];

function parsePadding(val: string | undefined): PaddingMode {
  if (val === "none" || val === "0") return "none";
  if (val === "tight" || val === "small") return "tight";
  return "normal";
}

function parseBooleanFlag(val: string | undefined): boolean {
  return val === "1" || val === "true" || val === "yes";
}

function parseCookieHeader(cookieHeader: string | undefined): Map<string, string> {
  const cookies = new Map<string, string>();
  if (!cookieHeader) return cookies;
  for (const chunk of cookieHeader.split(";")) {
    const [name, ...rawValue] = chunk.trim().split("=");
    if (!name || rawValue.length === 0) continue;
    cookies.set(name, decodeURIComponent(rawValue.join("=")));
  }
  return cookies;
}

function isReadmeHandoffRequest(val: string | undefined): boolean {
  return val === "readme" || val === "profile" || val === "1" || val === "true";
}

function getReadmeScope(val: string | undefined): string {
  const clean = val?.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 40);
  return clean || "default";
}

function getReadmeSeedKey(difficulty: Difficulty, scope: string): string {
  return `${scope}:${difficulty}`;
}

function getReadmeSeedCookieName(difficulty: Difficulty, scope: string): string {
  return `shikaku_readme_${scope}_${difficulty}`;
}

function rememberReadmeSeed(
  c: Context,
  difficulty: Difficulty,
  scope: string,
  seed: number,
) {
  readmeSeedCache.set(getReadmeSeedKey(difficulty, scope), { seed, createdAt: Date.now() });
  const sameSite = getRequestProto(c) === "https" ? "SameSite=None; Secure" : "SameSite=Lax";
  c.header(
    "Set-Cookie",
    `${getReadmeSeedCookieName(difficulty, scope)}=${seed}; Path=/api/shikaku; Max-Age=${README_SEED_COOKIE_MAX_AGE_SECONDS}; ${sameSite}`,
  );
}

function getRememberedReadmeSeed(
  c: Context,
  difficulty: Difficulty,
  scope: string,
): number | null {
  const cookieSeed = parseSeedParam(parseCookieHeader(c.req.header("cookie")).get(getReadmeSeedCookieName(difficulty, scope)));
  if (cookieSeed !== null) return cookieSeed;

  const cached = readmeSeedCache.get(getReadmeSeedKey(difficulty, scope));
  if (!cached) return null;
  if (Date.now() - cached.createdAt > README_SEED_TTL_MS) {
    readmeSeedCache.delete(getReadmeSeedKey(difficulty, scope));
    return null;
  }
  return cached.seed;
}

/** The SVG both image routes draw, from the same query string. */
function svgFromQuery(c: Context) {
  const difficulty = parseOption(c.req.query("difficulty"), DIFFICULTIES, "medium");
  const seed = parseSeedParam(c.req.query("seed")) ?? randomSeed();
  const { rows, cols } = DIFFICULTY_CONFIG[difficulty];
  const svg = renderPuzzleSvg(generatePuzzle(rows, cols, mulberry32(seed)), difficulty, seed, {
    theme: parseTheme(c.req.query("theme")),
    showSolution: parseBooleanFlag(c.req.query("solution")),
    transparentBg: c.req.query("bg") === "transparent",
    paddingMode: parsePadding(c.req.query("padding")),
  });
  return { svg, difficulty, seed, filename: `shikaku-${difficulty}-${seed}.svg` };
}

/* ── Routes ────────────────────────────────────────────────── */

export const shikakuImageRoutes = new Hono();

shikakuImageRoutes.get("/puzzle.svg", (c) => {
  const { svg, difficulty, seed, filename } = svgFromQuery(c);
  if (isReadmeHandoffRequest(c.req.query("from")) || isReadmeHandoffRequest(c.req.query("readme"))) {
    rememberReadmeSeed(c, difficulty, getReadmeScope(c.req.query("scope")), seed);
  }
  return svgResponse(c, svg, filename);
});

shikakuImageRoutes.get("/puzzle.svg/download", (c) => {
  const { svg, filename } = svgFromQuery(c);
  return svgResponse(c, svg, filename, true);
});

shikakuImageRoutes.get("/puzzle", (c) => {
  const difficulty = parseOption(c.req.query("difficulty"), DIFFICULTIES, "medium");
  const theme = parseTheme(c.req.query("theme"));
  const showingSolution = parseBooleanFlag(c.req.query("solution"));
  const isReadmeHandoff = isReadmeHandoffRequest(c.req.query("from")) || isReadmeHandoffRequest(c.req.query("readme"));
  const readmeScope = getReadmeScope(c.req.query("scope"));
  const seed = parseSeedParam(c.req.query("seed"))
    ?? (isReadmeHandoff ? getRememberedReadmeSeed(c, difficulty, readmeScope) : null)
    ?? randomSeed();

  if (isReadmeHandoff) {
    rememberReadmeSeed(c, difficulty, readmeScope, seed);
  }

  const baseUrl = getBaseUrl(c);
  const query = `difficulty=${difficulty}&seed=${seed}&theme=${theme}`;
  const puzzlePageUrl = `${baseUrl}/api/shikaku/puzzle?${query}`;
  const playUrl = `${SITE_URL}/shikaku?from=puzzle&seed=${seed}&difficulty=${difficulty}&challenge=1`;

  if (parseBooleanFlag(c.req.query("play"))) {
    return c.redirect(playUrl, 302);
  }

  const { rows, cols } = DIFFICULTY_CONFIG[difficulty];
  const puzzle = generatePuzzle(rows, cols, mulberry32(seed));

  return c.html(renderPuzzlePage({
    game: "Shikaku",
    color: SHIKAKU_GREEN.dark,
    subtitle: "Divide the grid into rectangles, each holding exactly one number equal to its area.",
    title: `Shikaku ${showingSolution ? "Solution" : "Puzzle"}: ${capitalize(difficulty)} ${rows}×${cols}`,
    description: showingSolution
      ? `The solution for a ${rows}×${cols} ${difficulty} Shikaku logic puzzle.`
      : `A ${rows}×${cols} ${difficulty} Shikaku logic puzzle. Cover every cell with rectangles matching the numbers!`,
    pageUrl: showingSolution ? `${puzzlePageUrl}&solution=1` : puzzlePageUrl,
    imageUrl: `${baseUrl}/api/shikaku/puzzle.svg?${query}`,
    board: renderPuzzleSvg(puzzle, difficulty, seed, { showSolution: showingSolution, transparentBg: true, paddingMode: "none" }),
    pickerLabel: "Difficulty",
    options: DIFFICULTIES.map((d) => ({
      label: capitalize(d),
      hint: DIFFICULTY_CONFIG[d].label,
      href: `${baseUrl}/api/shikaku/puzzle?difficulty=${d}&theme=${theme}`,
      accent: DIFF_ACCENT[d],
      current: d === difficulty,
    })),
    seed,
    newUrl: `${baseUrl}/api/shikaku/puzzle?difficulty=${difficulty}&theme=${theme}`,
    downloadUrl: `${baseUrl}/api/shikaku/puzzle.svg/download?${query}`,
    playUrl,
    playLabel: "Play this puzzle",
    links: [{
      href: showingSolution ? puzzlePageUrl : `${puzzlePageUrl}&solution=1`,
      label: showingSolution ? "Hide solution" : "Show solution",
    }],
  }));
});
