/**
 * The shareable puzzle page every solo game serves at /api/<game>/puzzle:
 * the board, a picker, the seed with new and download buttons, and one button
 * that drops you into the game on that seed. Plus the bits each game's routes
 * share, like seed parsing and the SVG response headers.
 *
 * The page is a standalone copy of the site's solo menu (game-shared.css
 * .solo-*), so if that look changes, this should follow.
 */

import type { Context } from "hono";

export const SITE_URL = "https://games.lawsonhart.me";
const MAX_SEED = 2_147_483_647;

/* ── Request parsing ───────────────────────────────────────── */

export function randomSeed(): number {
  return Math.floor(Math.random() * MAX_SEED) + 1;
}

export function parseSeedParam(val: string | undefined): number | null {
  if (val) {
    const n = parseInt(val, 10);
    if (Number.isFinite(n) && n > 0 && n <= MAX_SEED) return n;
  }
  return null;
}

export function parseTheme(val: string | undefined): "dark" | "light" {
  return val === "light" ? "light" : "dark";
}

/** The first of `options` when `val` isn't one of them. */
export function parseOption<T extends string>(val: string | undefined, options: readonly T[], fallback: T): T {
  return options.includes(val as T) ? (val as T) : fallback;
}

export function getRequestProto(c: Context): string {
  return c.req.header("x-forwarded-proto") || "https";
}

export function getBaseUrl(c: Context): string {
  return `${getRequestProto(c)}://${c.req.header("host") || "localhost:3001"}`;
}

export function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/* ── SVG response ──────────────────────────────────────────── */

// Never cached: a random-seed URL in a README should be a new board each load.
export function svgResponse(c: Context, svg: string, filename: string, download = false) {
  return c.body(svg, 200, {
    "Content-Type": "image/svg+xml",
    "Cache-Control": "max-age=0, no-cache, no-store, must-revalidate",
    "Pragma": "no-cache",
    "Expires": "0",
    "ETag": `"${filename}-${Date.now()}"`,
    "Vary": "*",
    "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${filename}"`,
  });
}

/* ── The page ──────────────────────────────────────────────── */

export interface PuzzlePageOption {
  label: string;
  hint: string;
  href: string;
  accent: string;
  current: boolean;
}

export interface PuzzlePage {
  game: string;
  /** The game's color: the title and the play button. */
  color: string;
  subtitle: string;
  title: string;
  description: string;
  pageUrl: string;
  imageUrl: string;
  /** Board-only SVG markup, inlined so it picks up the page's fonts. */
  board: string;
  pickerLabel: string;
  options: PuzzlePageOption[];
  seed: number;
  newUrl: string;
  downloadUrl: string;
  playUrl: string;
  playLabel: string;
  links: { href: string; label: string }[];
}

const ICON_ATTRS = `viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"`;
const AXIFORMA_WEIGHTS: [string, number][] = [["Regular", 400], ["SemiBold", 600], ["Bold", 700], ["ExtraBold", 800], ["Black", 900]];

export function renderPuzzlePage(page: PuzzlePage): string {
  const fontFaces = AXIFORMA_WEIGHTS.map(([name, weight]) =>
    `@font-face { font-family: "Axiforma"; src: url("${SITE_URL}/font/Axiforma-${name}.woff2") format("woff2"); font-weight: ${weight}; font-display: swap; ascent-override: 100%; descent-override: 23%; line-gap-override: 0%; }`,
  ).join("\n    ");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${page.title}</title>
  <meta name="description" content="${page.description}">

  <meta property="og:type" content="website">
  <meta property="og:title" content="${page.title}">
  <meta property="og:description" content="${page.description}">
  <meta property="og:image" content="${page.imageUrl}">
  <meta property="og:url" content="${page.pageUrl}">
  <meta property="og:site_name" content="Games by Lawson Hart">

  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${page.title}">
  <meta name="twitter:description" content="${page.description}">
  <meta name="twitter:image" content="${page.imageUrl}">

  <meta name="theme-color" content="#181a1b">

  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet">
  <style>
    ${fontFaces}

    /* No shadows, no glows: depth comes from borders and fills. */
    :root {
      color-scheme: dark;
      --background: #181a1b;
      --foreground: #f5f5f5;
      --card: #232323;
      --border: #333;
      --accent: #444;
      --muted-foreground: #bdbdbd;
      --primary: ${page.color};
      --primary-foreground: #181a1b;
      --font-mono: "IBM Plex Mono", ui-monospace, "SF Mono", "Cascadia Code", Consolas, monospace;
      --radius-scale: 0.375;
      --radius-sm: calc(0.375rem * var(--radius-scale));
      --radius-lg: calc(0.75rem * var(--radius-scale));
      --pad: 0.25rem;
      --control-h: 3.5rem;
    }

    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      min-height: 100dvh;
      display: grid;
      place-items: center;
      padding: 2rem 1rem;
      background: var(--background);
      color: var(--foreground);
      font-family: "Axiforma", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      -webkit-font-smoothing: antialiased;
    }

    a { color: inherit; text-decoration: none; }
    a:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }

    .page {
      width: min(540px, 100%);
      display: flex;
      flex-direction: column;
      gap: 1.4rem;
    }

    .hero { display: flex; flex-direction: column; align-items: center; gap: 0.4rem; text-align: center; }
    .title { color: var(--primary); font-size: clamp(2.3rem, 8vw, 3rem); font-weight: 900; line-height: 1; letter-spacing: -0.02em; }
    .sub { max-width: 30rem; color: var(--muted-foreground); font-size: 0.92rem; line-height: 1.45; }

    /* No frame here: the SVG draws its own bordered board. */
    .board svg { display: block; width: 100%; height: auto; }

    .setup { display: flex; flex-direction: column; }

    .seg {
      display: grid;
      grid-auto-columns: 1fr;
      grid-auto-flow: column;
      padding: var(--pad);
      border: 1px solid var(--border);
      border-radius: var(--radius-lg) var(--radius-lg) 0 0;
    }
    .opt {
      height: var(--control-h);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 0.12rem;
      border: 1px solid transparent;
      border-radius: calc(var(--radius-lg) - var(--pad));
      color: var(--muted-foreground);
      transition: color 0.18s;
    }
    .opt:hover { color: var(--foreground); }
    .opt[aria-current] {
      color: var(--opt-accent);
      border-color: color-mix(in srgb, var(--opt-accent) 55%, transparent);
      background: color-mix(in srgb, var(--opt-accent) 16%, var(--card));
    }
    .opt-name { font-size: 0.82rem; font-weight: 700; line-height: 1.1; }
    .opt-hint { font-size: 0.7rem; font-weight: 600; line-height: 1.1; font-variant-numeric: tabular-nums; opacity: 0.7; }

    /* Hangs off the picker with its top corners flattened, like the seed drawer. */
    .drawer {
      display: flex;
      align-items: center;
      gap: 0.3rem;
      padding: var(--pad) var(--pad) var(--pad) 0.7rem;
      border: 1px solid var(--border);
      border-top: 0;
      border-radius: 0 0 var(--radius-lg) var(--radius-lg);
    }
    .seed-icon { color: var(--muted-foreground); font-size: 0.95rem; font-weight: 800; }
    .seed { flex: 1; min-width: 0; padding: 0 0.35rem; font-family: var(--font-mono); font-size: 0.9rem; }
    .icon-btn {
      display: grid;
      place-items: center;
      width: 2.75rem;
      height: 2.75rem;
      border-radius: var(--radius-sm);
      color: var(--muted-foreground);
      transition: background 0.14s, color 0.14s;
    }
    .icon-btn:hover { background: var(--accent); color: var(--foreground); }

    /* The site's primary button, at the menu's control height. */
    .start {
      display: flex;
      align-items: center;
      justify-content: space-between;
      height: var(--control-h);
      padding: 0 1.1rem;
      border-radius: var(--radius-lg);
      background: linear-gradient(180deg, color-mix(in srgb, var(--primary) 86%, white), var(--primary));
      color: var(--primary-foreground);
      box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.38), inset 0 -1px 0 rgb(0 0 0 / 0.16), 0 0 0 1px color-mix(in srgb, var(--primary) 62%, black);
      font-size: 1rem;
      font-weight: 800;
    }
    .start:hover { background: linear-gradient(180deg, color-mix(in srgb, var(--primary) 78%, white), color-mix(in srgb, var(--primary) 92%, white)); }
    .start svg { transition: translate 0.16s; }
    .start:hover svg { translate: 3px 0; }

    .links { display: flex; flex-wrap: wrap; justify-content: center; column-gap: 1.5rem; }
    .links a {
      display: inline-flex;
      align-items: center;
      min-height: 2.75rem;
      color: var(--muted-foreground);
      font-size: 0.875rem;
      font-weight: 600;
      text-decoration: underline;
      text-decoration-color: transparent;
      text-underline-offset: 0.25em;
      transition: color 0.12s, text-decoration-color 0.12s;
    }
    .links a:hover { color: var(--foreground); text-decoration-color: currentColor; }

    @media (max-width: 600px) {
      .page { gap: 1.1rem; }
      .opt-name { font-size: 0.76rem; }
    }

    @media (prefers-reduced-motion: reduce) {
      * { transition: none !important; }
    }
  </style>
</head>
<body>
  <main class="page">
    <header class="hero">
      <h1 class="title">${page.game}</h1>
      <p class="sub">${page.subtitle}</p>
    </header>

    <figure class="board" role="img" aria-label="${page.title}">${page.board}</figure>

    <div class="setup">
      <nav class="seg" aria-label="${page.pickerLabel}">
        ${page.options.map((o) => `<a class="opt" style="--opt-accent:${o.accent}" href="${o.href}"${o.current ? ` aria-current="page"` : ""}><span class="opt-name">${o.label}</span><span class="opt-hint">${o.hint}</span></a>`).join("")}
      </nav>
      <div class="drawer">
        <span class="seed-icon" aria-hidden="true">#</span>
        <span class="seed" aria-label="Seed">${page.seed}</span>
        <a class="icon-btn" href="${page.newUrl}" aria-label="New puzzle" title="New puzzle"><svg width="18" height="18" ${ICON_ATTRS}><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg></a>
        <a class="icon-btn" href="${page.downloadUrl}" aria-label="Download SVG" title="Download SVG"><svg width="18" height="18" ${ICON_ATTRS}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg></a>
      </div>
    </div>

    <a class="start" href="${page.playUrl}">${page.playLabel}<svg width="20" height="20" ${ICON_ATTRS}><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg></a>

    <nav class="links">
      ${page.links.map((l) => `<a href="${l.href}">${l.label}</a>`).join("\n      ")}
      <a href="${SITE_URL}">More games</a>
      <a href="https://github.com/oyuh/games">GitHub</a>
    </nav>
  </main>
</body>
</html>`;
}
