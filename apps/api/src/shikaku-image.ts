/**
 * Shikaku puzzle image generator — serves dynamic SVG puzzle images
 * and an HTML preview page with OG/Twitter embed tags.
 *
 * Routes:
 *   GET /api/shikaku/puzzle.svg  — random puzzle SVG (query: ?difficulty=&seed=&theme=)
 *   GET /api/shikaku/puzzle      — HTML page with puzzle display, download, and embeds
 */

import { Hono } from "hono";

/* ── Minimal Shikaku engine (self-contained for server-side) ── */

interface Rect { r: number; c: number; w: number; h: number }
interface NumberCell { r: number; c: number; value: number }
interface ShikakuPuzzle { rows: number; cols: number; numbers: NumberCell[]; solution: Rect[] }

type Difficulty = "easy" | "medium" | "hard" | "expert";

const DIFFICULTY_CONFIG: Record<Difficulty, { rows: number; cols: number; label: string }> = {
  easy:   { rows: 5,  cols: 5,  label: "5×5" },
  medium: { rows: 9,  cols: 9,  label: "9×9" },
  hard:   { rows: 15, cols: 15, label: "15×15" },
  expert: { rows: 22, cols: 22, label: "22×22" },
};

function mulberry32(seed: number) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleArray<T>(arr: T[], rng: () => number) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const current = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = current;
  }
}

function getRectCandidates(startR: number, startC: number, rows: number, cols: number, grid: Int8Array[], maxArea: number): Rect[] {
  const candidates: Rect[] = [];
  const maxH = rows - startR;
  const maxW = cols - startC;
  const areaLimit = Math.min(maxH * maxW, maxArea);
  for (let h = 1; h <= maxH; h++) {
    for (let w = 1; w <= maxW; w++) {
      if (h * w > areaLimit) break;
      if (h * w < 2 && (maxH > 1 || maxW > 1)) continue;
      let valid = true;
      for (let dr = 0; dr < h && valid; dr++) {
        for (let dc = 0; dc < w && valid; dc++) {
          if (grid[startR + dr]![startC + dc] !== -1) valid = false;
        }
      }
      if (valid) candidates.push({ r: startR, c: startC, w, h });
    }
  }
  return candidates;
}

function tryGeneratePuzzle(rows: number, cols: number, rng: () => number, maxArea: number): ShikakuPuzzle | null {
  const grid = Array.from({ length: rows }, () => new Int8Array(cols).fill(-1));
  const rects: Rect[] = [];
  let rectId = 0;
  const cellOrder: [number, number][] = [];
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      cellOrder.push([r, c]);
  for (let i = cellOrder.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const current = cellOrder[i]!;
    cellOrder[i] = cellOrder[j]!;
    cellOrder[j] = current;
  }
  for (const [r, c] of cellOrder) {
    if (grid[r]![c] !== -1) continue;
    const candidates = getRectCandidates(r, c, rows, cols, grid, maxArea);
    if (candidates.length === 0) continue;
    shuffleArray(candidates, rng);
    candidates.sort((a, b) => (b.w * b.h) - (a.w * a.h));
    const pickIdx = Math.floor(rng() * Math.min(3, candidates.length));
    const rect = candidates[pickIdx]!;
    for (let dr = 0; dr < rect.h; dr++)
      for (let dc = 0; dc < rect.w; dc++)
        grid[rect.r + dr]![rect.c + dc] = rectId;
    rects.push(rect);
    rectId++;
  }
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      if (grid[r]![c] === -1) {
        grid[r]![c] = rectId;
        rects.push({ r, c, w: 1, h: 1 });
        rectId++;
      }
  const numbers: NumberCell[] = [];
  for (let i = 0; i < rects.length; i++) {
    const rect = rects[i]!;
    const area = rect.w * rect.h;
    const dr = Math.floor(rng() * rect.h);
    const dc = Math.floor(rng() * rect.w);
    numbers.push({ r: rect.r + dr, c: rect.c + dc, value: area });
  }
  return { rows, cols, numbers, solution: rects };
}

function generatePuzzle(rows: number, cols: number, rng: () => number): ShikakuPuzzle {
  const maxArea = rows <= 5 ? 10 : rows <= 9 ? 16 : rows <= 15 ? 25 : 36;
  for (let attempt = 0; attempt < 80; attempt++) {
    const result = tryGeneratePuzzle(rows, cols, rng, maxArea);
    if (result) return result;
  }
  // Fallback: trivial 1×1 grid
  const numbers: NumberCell[] = [];
  const solution: Rect[] = [];
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      numbers.push({ r, c, value: 1 });
      solution.push({ r, c, w: 1, h: 1 });
    }
  return { rows, cols, numbers, solution };
}

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

interface RenderOptions {
  theme?: "dark" | "light";
  showSolution?: boolean;
  transparentBg?: boolean;
}

function renderPuzzleSvg(puzzle: ShikakuPuzzle, difficulty: Difficulty, seed: number, opts: RenderOptions = {}): string {
  const { theme = "dark", showSolution = false, transparentBg = false } = opts;
  const { rows, cols, numbers, solution } = puzzle;

  const cellSize = rows <= 9 ? 48 : rows <= 15 ? 32 : 24;
  const padding = 40;
  const headerHeight = 44;
  const footerHeight = 32;
  const gridW = cols * cellSize;
  const gridH = rows * cellSize;
  const totalW = gridW + padding * 2;
  const totalH = gridH + padding * 2 + headerHeight + footerHeight;

  const cellBg = theme === "dark" ? "#1a1d27" : "#f3f4f6";
  const gridLine = theme === "dark" ? "#2a2d3a" : "#d1d5db";
  const textColor = theme === "dark" ? "#e2e8f0" : "#1f2937";
  const mutedText = theme === "dark" ? "#64748b" : "#9ca3af";
  const accent = DIFF_ACCENT[difficulty];

  const gridX = padding;
  const gridY = padding + headerHeight;

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${totalW}" height="${totalH}" viewBox="0 0 ${totalW} ${totalH}">`;

  // Background (optional)
  if (!transparentBg) {
    const bg = theme === "dark" ? "#0f1117" : "#ffffff";
    svg += `<rect width="${totalW}" height="${totalH}" rx="12" fill="${bg}"/>`;
  }

  // Header — only when background is visible
  if (!transparentBg) {
    svg += `<text x="${totalW / 2}" y="${padding + 8}" text-anchor="middle" font-family="system-ui,-apple-system,sans-serif" font-size="18" font-weight="800" fill="${accent}">SHIKAKU</text>`;
    svg += `<text x="${totalW / 2}" y="${padding + 28}" text-anchor="middle" font-family="system-ui,-apple-system,sans-serif" font-size="11" fill="${mutedText}">${difficulty.toUpperCase()} · ${rows}×${cols} · seed ${seed}</text>`;
  }

  // Cell backgrounds
  if (showSolution) {
    for (let i = 0; i < solution.length; i++) {
      const rect = solution[i]!;
      const color = RECT_COLORS[i % RECT_COLORS.length]!;
      svg += `<rect x="${gridX + rect.c * cellSize + 1}" y="${gridY + rect.r * cellSize + 1}" width="${rect.w * cellSize - 2}" height="${rect.h * cellSize - 2}" rx="3" fill="${color}" opacity="0.25"/>`;
      svg += `<rect x="${gridX + rect.c * cellSize + 1}" y="${gridY + rect.r * cellSize + 1}" width="${rect.w * cellSize - 2}" height="${rect.h * cellSize - 2}" rx="3" fill="none" stroke="${color}" stroke-width="2" opacity="0.6"/>`;
    }
  } else {
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        svg += `<rect x="${gridX + c * cellSize}" y="${gridY + r * cellSize}" width="${cellSize}" height="${cellSize}" fill="${cellBg}"/>`;
      }
    }
  }

  // Grid lines
  for (let r = 0; r <= rows; r++) {
    svg += `<line x1="${gridX}" y1="${gridY + r * cellSize}" x2="${gridX + gridW}" y2="${gridY + r * cellSize}" stroke="${gridLine}" stroke-width="1"/>`;
  }
  for (let c = 0; c <= cols; c++) {
    svg += `<line x1="${gridX + c * cellSize}" y1="${gridY}" x2="${gridX + c * cellSize}" y2="${gridY + gridH}" stroke="${gridLine}" stroke-width="1"/>`;
  }

  // Outer border
  svg += `<rect x="${gridX}" y="${gridY}" width="${gridW}" height="${gridH}" fill="none" stroke="${accent}" stroke-width="2" rx="2"/>`;

  // Numbers
  const fontSize = cellSize <= 24 ? 11 : cellSize <= 32 ? 14 : 18;
  for (const num of numbers) {
    const cx = gridX + num.c * cellSize + cellSize / 2;
    const cy = gridY + num.r * cellSize + cellSize / 2;
    svg += `<text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="central" font-family="system-ui,-apple-system,sans-serif" font-size="${fontSize}" font-weight="700" fill="${textColor}">${num.value}</text>`;
  }

  // Watermark — bottom-right, subtle
  const wmY = gridY + gridH + 18;
  const wmX = totalW - padding + 4;
  svg += `<text x="${wmX}" y="${wmY}" text-anchor="end" font-family="system-ui,-apple-system,sans-serif" font-size="8" font-weight="500" fill="${mutedText}" opacity="0.5">games · Lawson Hart</text>`;

  // Footer — only when background is visible
  if (!transparentBg) {
    const footerY = gridY + gridH + footerHeight - 4;
    svg += `<text x="${padding}" y="${footerY}" text-anchor="start" font-family="system-ui,-apple-system,sans-serif" font-size="10" fill="${mutedText}">games · shikaku puzzle</text>`;
  }

  svg += `</svg>`;
  return svg;
}

/* ── Parameter parsing ─────────────────────────────────────── */

function parseDifficulty(val: string | undefined): Difficulty {
  const valid: Difficulty[] = ["easy", "medium", "hard", "expert"];
  if (val && valid.includes(val as Difficulty)) return val as Difficulty;
  return "medium";
}

function parseSeed(val: string | undefined): number {
  if (val) {
    const n = parseInt(val, 10);
    if (Number.isFinite(n) && n > 0 && n <= 2_147_483_647) return n;
  }
  return Math.floor(Math.random() * 2_147_483_647) + 1;
}

function parseTheme(val: string | undefined): "dark" | "light" {
  if (val === "light") return "light";
  return "dark";
}

/* ── Routes ────────────────────────────────────────────────── */

export const shikakuImageRoutes = new Hono();

// SVG image endpoint
shikakuImageRoutes.get("/puzzle.svg", (c) => {
  const difficulty = parseDifficulty(c.req.query("difficulty"));
  const seed = parseSeed(c.req.query("seed"));
  const theme = parseTheme(c.req.query("theme"));
  const showSolution = c.req.query("solution") === "true";
  const transparentBg = c.req.query("bg") === "transparent";

  const { rows, cols } = DIFFICULTY_CONFIG[difficulty];
  const rng = mulberry32(seed);
  const puzzle = generatePuzzle(rows, cols, rng);

  const svg = renderPuzzleSvg(puzzle, difficulty, seed, { theme, showSolution, transparentBg });

  return c.body(svg, 200, {
    "Content-Type": "image/svg+xml",
    "Cache-Control": "no-cache, no-store, must-revalidate",
    "Content-Disposition": `inline; filename="shikaku-${difficulty}-${seed}.svg"`,
  });
});

// Download endpoint (forces download)
shikakuImageRoutes.get("/puzzle.svg/download", (c) => {
  const difficulty = parseDifficulty(c.req.query("difficulty"));
  const seed = parseSeed(c.req.query("seed"));
  const theme = parseTheme(c.req.query("theme"));
  const showSolution = c.req.query("solution") === "true";
  const transparentBg = c.req.query("bg") === "transparent";

  const { rows, cols } = DIFFICULTY_CONFIG[difficulty];
  const rng = mulberry32(seed);
  const puzzle = generatePuzzle(rows, cols, rng);

  const svg = renderPuzzleSvg(puzzle, difficulty, seed, { theme, showSolution, transparentBg });

  return c.body(svg, 200, {
    "Content-Type": "image/svg+xml",
    "Cache-Control": "no-cache, no-store, must-revalidate",
    "Content-Disposition": `attachment; filename="shikaku-${difficulty}-${seed}.svg"`,
  });
});

// HTML preview page with OG/Twitter embed meta tags — styled to match the main site
shikakuImageRoutes.get("/puzzle", (c) => {
  const difficulty = parseDifficulty(c.req.query("difficulty"));
  const seed = parseSeed(c.req.query("seed"));
  const theme = parseTheme(c.req.query("theme"));
  const showingSolution = c.req.query("solution") === "true";

  const proto = c.req.header("x-forwarded-proto") || "https";
  const host = c.req.header("host") || "localhost:3001";
  const baseUrl = `${proto}://${host}`;
  const pageUrl = `${baseUrl}/api/shikaku/puzzle?difficulty=${difficulty}&seed=${seed}&theme=${theme}`;
  const imageUrl = `${baseUrl}/api/shikaku/puzzle.svg?difficulty=${difficulty}&seed=${seed}&theme=${theme}`;
  const downloadUrl = `${baseUrl}/api/shikaku/puzzle.svg/download?difficulty=${difficulty}&seed=${seed}&theme=${theme}`;
  const newPuzzleUrl = `${baseUrl}/api/shikaku/puzzle?difficulty=${difficulty}&theme=${theme}`;
  const siteUrl = "https://games.lawsonhart.me";
  const playUrl = `${siteUrl}/shikaku`;

  const { rows, cols } = DIFFICULTY_CONFIG[difficulty];
  const title = `Shikaku Puzzle — ${difficulty.charAt(0).toUpperCase() + difficulty.slice(1)} ${rows}×${cols}`;
  const description = `A ${rows}×${cols} ${difficulty} Shikaku logic puzzle. Cover every cell with rectangles matching the numbers!`;
  const accent = DIFF_ACCENT[difficulty];

  const imgW = cols * (rows <= 9 ? 48 : rows <= 15 ? 32 : 24) + 80;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
  <meta name="description" content="${description}">

  <!-- Open Graph -->
  <meta property="og:type" content="website">
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${description}">
  <meta property="og:image" content="${imageUrl}">
  <meta property="og:url" content="${pageUrl}">
  <meta property="og:site_name" content="Games · Lawson Hart">

  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${title}">
  <meta name="twitter:description" content="${description}">
  <meta name="twitter:image" content="${imageUrl}">

  <!-- Discord / oEmbed -->
  <meta name="theme-color" content="${accent}">

  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Geist+Mono:wght@400;500;600;700&display=swap" rel="stylesheet">

  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      min-height: 100dvh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 1.25rem;
      padding: 2rem 1.25rem;
      background: #181a1b;
      color: #f5f5f5;
      font-family: 'Geist Mono', 'SF Mono', 'Fira Code', monospace;
      position: relative;
      overflow-x: hidden;
    }

    /* Corner glow effect — like the main site */
    body::before {
      content: "";
      position: fixed;
      inset: 0;
      pointer-events: none;
      background:
        radial-gradient(ellipse 55% 55% at 0% 0%, ${accent}18 0%, transparent 70%),
        radial-gradient(ellipse 55% 55% at 100% 0%, ${accent}10 0%, transparent 70%),
        radial-gradient(ellipse 55% 55% at 0% 100%, ${accent}10 0%, transparent 70%),
        radial-gradient(ellipse 55% 55% at 100% 100%, ${accent}18 0%, transparent 70%);
      opacity: 0.5;
    }

    /* Subtle grid pattern overlay */
    body::after {
      content: "";
      position: fixed;
      inset: -40%;
      pointer-events: none;
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' fill='none' stroke='${accent.replace("#", "%23")}' stroke-width='2' stroke-linecap='round'%3E%3Crect x='3' y='3' width='7' height='7' rx='1'/%3E%3Crect x='14' y='3' width='7' height='7' rx='1'/%3E%3Crect x='3' y='14' width='7' height='7' rx='1'/%3E%3Crect x='14' y='14' width='7' height='7' rx='1'/%3E%3C/svg%3E");
      background-size: 72px 72px;
      opacity: 0.06;
      filter: blur(1.5px);
      transform: rotate(-20deg);
      mask-image:
        radial-gradient(ellipse 60% 60% at 0% 0%, black 0%, transparent 65%),
        radial-gradient(ellipse 60% 60% at 100% 100%, black 0%, transparent 65%);
      -webkit-mask-image:
        radial-gradient(ellipse 60% 60% at 0% 0%, black 0%, transparent 65%),
        radial-gradient(ellipse 60% 60% at 100% 100%, black 0%, transparent 65%);
    }

    body > * { position: relative; z-index: 1; }

    .hero { display: flex; flex-direction: column; align-items: center; gap: 0.35rem; }

    h1 {
      font-size: 2rem;
      font-weight: 800;
      color: ${accent};
      text-align: center;
      letter-spacing: -0.03em;
      line-height: 1.1;
    }

    .subtitle {
      font-size: 0.8rem;
      color: #bdbdbd;
      text-align: center;
      max-width: 420px;
      line-height: 1.5;
      font-weight: 400;
    }

    .meta-row {
      display: flex;
      gap: 0.5rem;
      align-items: center;
      flex-wrap: wrap;
      justify-content: center;
    }

    .tag {
      font-size: 0.65rem;
      padding: 0.2rem 0.6rem;
      border-radius: 6px;
      background: #232323;
      color: #bdbdbd;
      border: 1px solid #333;
      font-weight: 500;
      letter-spacing: 0.02em;
    }

    .tag-accent {
      color: ${accent};
      border-color: ${accent}40;
      background: ${accent}12;
    }

    .puzzle-wrap {
      border-radius: 14px;
      padding: 2px;
      background: linear-gradient(135deg, ${accent}30, transparent 50%, ${accent}20);
      max-width: 100%;
    }

    .puzzle-frame {
      border-radius: 12px;
      overflow: hidden;
      background: #0f1117;
      max-width: 100%;
    }

    .puzzle-frame img {
      display: block;
      max-width: 100%;
      height: auto;
    }

    .actions {
      display: flex;
      gap: 0.6rem;
      flex-wrap: wrap;
      justify-content: center;
    }

    .btn {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      padding: 0.55rem 1.1rem;
      border-radius: 10px;
      font-size: 0.78rem;
      font-weight: 600;
      text-decoration: none;
      transition: all 0.15s ease;
      cursor: pointer;
      border: none;
      font-family: inherit;
      letter-spacing: -0.01em;
    }

    .btn-play {
      background: ${accent};
      color: #181a1b;
      box-shadow: 0 0 20px ${accent}40;
    }
    .btn-play:hover { box-shadow: 0 0 30px ${accent}60; transform: translateY(-1px); }

    .btn-secondary {
      background: #232323;
      color: #f5f5f5;
      border: 1px solid #333;
    }
    .btn-secondary:hover { border-color: ${accent}80; transform: translateY(-1px); }

    .btn-ghost {
      background: transparent;
      color: #bdbdbd;
      border: 1px solid #333;
    }
    .btn-ghost:hover { border-color: ${accent}; color: ${accent}; }

    .divider {
      width: 60px;
      height: 1px;
      background: #333;
    }

    .footer {
      font-size: 0.7rem;
      color: #64748b;
      text-align: center;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.3rem;
    }

    .footer a {
      color: ${accent};
      text-decoration: none;
      transition: opacity 0.15s;
    }
    .footer a:hover { opacity: 0.7; }

    .footer-brand {
      font-size: 0.65rem;
      color: #475569;
      letter-spacing: 0.05em;
      text-transform: uppercase;
    }
  </style>
</head>
<body>
  <div class="hero">
    <h1>Shikaku</h1>
    <p class="subtitle">${description}</p>
  </div>

  <div class="meta-row">
    <span class="tag tag-accent">${difficulty.toUpperCase()}</span>
    <span class="tag">${rows}×${cols}</span>
    <span class="tag">seed: ${seed}</span>
  </div>

  <div class="puzzle-wrap">
    <div class="puzzle-frame">
      <img src="${imageUrl}&bg=transparent" alt="${title}" width="${imgW}">
    </div>
  </div>

  <div class="actions">
    <a class="btn btn-play" href="${playUrl}">▶ Play Shikaku</a>
    <a class="btn btn-secondary" href="${downloadUrl}">⬇ Download</a>
    <a class="btn btn-secondary" href="${newPuzzleUrl}">⟳ New Puzzle</a>
    <a class="btn btn-ghost" href="${showingSolution ? pageUrl : pageUrl + "&solution=true"}">${showingSolution ? "✕ Hide Solution" : "◉ Solution"}</a>
  </div>

  ${showingSolution ? `
  <div class="puzzle-wrap">
    <div class="puzzle-frame">
      <img src="${imageUrl}&solution=true&bg=transparent" alt="Solution" width="${imgW}">
    </div>
  </div>` : ""}

  <div class="divider"></div>

  <div class="footer">
    <span class="footer-brand">games · Lawson Hart</span>
    <span>
      <a href="${siteUrl}">games.lawsonhart.me</a> ·
      <a href="https://github.com/oyuh/games">github</a>
    </span>
  </div>
</body>
</html>`;

  return c.html(html);
});
