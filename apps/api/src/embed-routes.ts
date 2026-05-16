import {
  GAME_ICON_SVGS,
  GAME_META,
  chainReactionGames,
  getGameSlugFromPath,
  imposterGames,
  locationSignalGames,
  passwordGames,
  shadeSignalGames,
  type GameSlug,
} from "@games/shared";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import type { Context } from "hono";
import { drizzleClient } from "./db-provider";

const SITE_NAME = "Games · Lawson Hart";
const DEFAULT_WEB_ORIGIN = "https://games.lawsonhart.me";

type EmbedModel = {
  slug: GameSlug;
  title: string;
  description: string;
  webUrl: string;
  imageUrl: string;
  accent: string;
  code?: string;
  status?: string;
  details: string[];
};

type JsonRecord = Record<string, unknown>;

export const embedRoutes = new Hono();

embedRoutes.get("/html", async (c) => {
  const path = normalizePath(c.req.query("path"));
  const model = await resolveEmbedModel(path, getWebOrigin(c), getApiOrigin(c));

  return c.html(renderEmbedHtml(model), 200, {
    "Cache-Control": "public, max-age=60, s-maxage=300",
    "Content-Type": "text/html; charset=utf-8",
  });
});

embedRoutes.get("/card.svg", async (c) => {
  const path = normalizePath(c.req.query("path"));
  const model = await resolveEmbedModel(path, getWebOrigin(c), getApiOrigin(c));

  return c.body(renderEmbedCardSvg(model), 200, {
    "Cache-Control": "public, max-age=300, s-maxage=900",
    "Content-Type": "image/svg+xml; charset=utf-8",
  });
});

embedRoutes.get("/card.png", async (c) => {
  const path = normalizePath(c.req.query("path"));
  const model = await resolveEmbedModel(path, getWebOrigin(c), getApiOrigin(c));
  const { default: sharp } = await import("sharp");
  const pngBuffer = await sharp(Buffer.from(renderEmbedCardSvg(model))).png().toBuffer();
  const png = new Uint8Array(pngBuffer.byteLength);
  png.set(pngBuffer);

  return c.body(png, 200, {
    "Cache-Control": "public, max-age=300, s-maxage=900",
    "Content-Type": "image/png",
  });
});

function normalizePath(value: string | undefined): string {
  if (!value) return "/";
  try {
    if (/^https?:\/\//i.test(value)) {
      return new URL(value).pathname || "/";
    }
  } catch {
    return "/";
  }
  const trimmed = value.trim() || "/";
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

function getRequestOrigin(c: Context, fallbackHost: string) {
  const proto = c.req.header("x-forwarded-proto") ?? (c.req.header("host")?.startsWith("localhost") ? "http" : "https");
  const host = c.req.header("host") ?? fallbackHost;
  return `${proto}://${host}`;
}

function getWebOrigin(c: Context) {
  const configured = process.env.WEB_ORIGIN?.trim();
  if (configured) return configured.replace(/\/$/, "");

  const origin = getRequestOrigin(c, "games.lawsonhart.me");
  if (origin.includes("localhost") || origin.includes("127.0.0.1")) {
    return "http://localhost:5173";
  }
  return DEFAULT_WEB_ORIGIN;
}

function getApiOrigin(c: Context) {
  return getRequestOrigin(c, "api.games.lawsonhart.me").replace(/\/$/, "");
}

async function resolveEmbedModel(path: string, webOrigin: string, apiOrigin: string): Promise<EmbedModel> {
  const slug = getGameSlugFromPath(path);
  const meta = GAME_META[slug];
  const webUrl = new URL(path, webOrigin).toString();
  const imageUrl = `${apiOrigin}/api/embed/card.png?path=${encodeURIComponent(path)}`;
  const fallback: EmbedModel = {
    slug,
    title: meta.pageTitle,
    description: meta.description,
    webUrl,
    imageUrl,
    accent: meta.accent,
    details: [meta.players, meta.shortDescription],
  };

  const gameId = getMultiplayerId(path, slug);
  if (!gameId) return fallback;

  try {
    if (slug === "imposter") {
      const [game] = await drizzleClient
        .select({
          code: imposterGames.code,
          phase: imposterGames.phase,
          players: imposterGames.players,
          spectators: imposterGames.spectators,
          settings: imposterGames.settings,
        })
        .from(imposterGames)
        .where(eq(imposterGames.id, gameId))
        .limit(1);
      if (!game) return fallback;
      const settings = asRecord(game.settings);
      const playerCount = arrayLength(game.players);
      const imposters = numberish(settings.imposters);
      const rounds = numberish(settings.rounds);
      return withGameRoom(fallback, game.code, game.phase, [
        `${playerCount} player${playerCount === 1 ? "" : "s"}`,
        rounds ? `${rounds} round${rounds === 1 ? "" : "s"}` : "",
        imposters ? `${imposters} imposter${imposters === 1 ? "" : "s"}` : "",
      ]);
    }

    if (slug === "password") {
      const [game] = await drizzleClient
        .select({
          code: passwordGames.code,
          phase: passwordGames.phase,
          teams: passwordGames.teams,
          spectators: passwordGames.spectators,
          settings: passwordGames.settings,
        })
        .from(passwordGames)
        .where(eq(passwordGames.id, gameId))
        .limit(1);
      if (!game) return fallback;
      const settings = asRecord(game.settings);
      const teams = Array.isArray(game.teams) ? game.teams : [];
      const playerCount = teams.reduce((sum, team) => {
        const members = asRecord(team).members;
        return sum + arrayLength(members);
      }, 0);
      const targetScore = numberish(settings.targetScore);
      return withGameRoom(fallback, game.code, game.phase, [
        `${playerCount} player${playerCount === 1 ? "" : "s"}`,
        `${teams.length} team${teams.length === 1 ? "" : "s"}`,
        targetScore ? `target ${targetScore}` : "",
      ]);
    }

    if (slug === "chain") {
      const [game] = await drizzleClient
        .select({
          code: chainReactionGames.code,
          phase: chainReactionGames.phase,
          players: chainReactionGames.players,
          spectators: chainReactionGames.spectators,
          settings: chainReactionGames.settings,
        })
        .from(chainReactionGames)
        .where(eq(chainReactionGames.id, gameId))
        .limit(1);
      if (!game) return fallback;
      const settings = asRecord(game.settings);
      const playerCount = arrayLength(game.players);
      const chainLength = numberish(settings.chainLength);
      const rounds = numberish(settings.rounds);
      return withGameRoom(fallback, game.code, game.phase, [
        `${playerCount} player${playerCount === 1 ? "" : "s"}`,
        chainLength ? `${chainLength} words` : "",
        rounds ? `${rounds} round${rounds === 1 ? "" : "s"}` : "",
      ]);
    }

    if (slug === "shade") {
      const [game] = await drizzleClient
        .select({
          code: shadeSignalGames.code,
          phase: shadeSignalGames.phase,
          players: shadeSignalGames.players,
          spectators: shadeSignalGames.spectators,
          settings: shadeSignalGames.settings,
        })
        .from(shadeSignalGames)
        .where(eq(shadeSignalGames.id, gameId))
        .limit(1);
      if (!game) return fallback;
      const settings = asRecord(game.settings);
      const playerCount = arrayLength(game.players);
      const roundsPerPlayer = numberish(settings.roundsPerPlayer);
      return withGameRoom(fallback, game.code, game.phase, [
        `${playerCount} player${playerCount === 1 ? "" : "s"}`,
        roundsPerPlayer ? `${roundsPerPlayer} turn${roundsPerPlayer === 1 ? "" : "s"} each` : "",
        settings.hardMode ? "hard clues" : "normal clues",
      ]);
    }

    if (slug === "location") {
      const [game] = await drizzleClient
        .select({
          code: locationSignalGames.code,
          phase: locationSignalGames.phase,
          players: locationSignalGames.players,
          spectators: locationSignalGames.spectators,
          settings: locationSignalGames.settings,
        })
        .from(locationSignalGames)
        .where(eq(locationSignalGames.id, gameId))
        .limit(1);
      if (!game) return fallback;
      const settings = asRecord(game.settings);
      const playerCount = arrayLength(game.players);
      const cluePairs = numberish(settings.cluePairs);
      const roundsPerPlayer = numberish(settings.roundsPerPlayer);
      return withGameRoom(fallback, game.code, game.phase, [
        `${playerCount} player${playerCount === 1 ? "" : "s"}`,
        cluePairs ? `${cluePairs} clue pair${cluePairs === 1 ? "" : "s"}` : "",
        roundsPerPlayer ? `${roundsPerPlayer} turn${roundsPerPlayer === 1 ? "" : "s"} each` : "",
      ]);
    }
  } catch (error) {
    console.warn("[embed] failed to load game metadata", error);
  }

  return fallback;
}

function getMultiplayerId(path: string, slug: GameSlug): string | null {
  if (!["imposter", "password", "chain", "shade", "location"].includes(slug)) return null;
  const match = path.match(/^\/(?:imposter|password|chain|shade|location)\/([^/?#]+)/);
  return match?.[1] ?? null;
}

function withGameRoom(base: EmbedModel, code: string, phase: string, detailValues: string[]): EmbedModel {
  const status = phaseLabel(phase);
  const details = detailValues.filter(Boolean);
  const suffix = details.length > 0 ? ` · ${details.join(" · ")}` : "";
  return {
    ...base,
    title: `${GAME_META[base.slug].title} ${code} | Games`,
    description: `Join ${GAME_META[base.slug].title} room ${code}. ${status}${suffix}.`,
    code,
    status,
    details,
  };
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" ? value as JsonRecord : {};
}

function arrayLength(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

function numberish(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function phaseLabel(phase: string): string {
  const labels: Record<string, string> = {
    lobby: "Lobby",
    playing: "In progress",
    submitting: "Submitting",
    voting: "Voting",
    results: "Results",
    picking: "Picking",
    clue1: "Clue 1",
    guess1: "Guess 1",
    clue2: "Clue 2",
    guess2: "Guess 2",
    clue3: "Clue 3",
    guess3: "Guess 3",
    clue4: "Clue 4",
    guess4: "Guess 4",
    reveal: "Reveal",
    finished: "Finished",
    ended: "Ended",
  };
  return labels[phase] ?? phase.charAt(0).toUpperCase() + phase.slice(1);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeXml(value: string): string {
  return escapeHtml(value).replace(/'/g, "&apos;");
}

function renderEmbedHtml(model: EmbedModel): string {
  const title = escapeHtml(model.title);
  const description = escapeHtml(model.description);
  const imageUrl = escapeHtml(model.imageUrl);
  const webUrl = escapeHtml(model.webUrl);
  const accent = escapeHtml(model.accent);

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${title}</title>
    <meta name="description" content="${description}">
    <meta name="theme-color" content="${accent}">
    <meta property="og:type" content="website">
    <meta property="og:title" content="${title}">
    <meta property="og:description" content="${description}">
    <meta property="og:image" content="${imageUrl}">
    <meta property="og:image:secure_url" content="${imageUrl}">
    <meta property="og:image:type" content="image/png">
    <meta property="og:image:width" content="1200">
    <meta property="og:image:height" content="630">
    <meta property="og:image:alt" content="${title}">
    <meta property="og:url" content="${webUrl}">
    <meta property="og:site_name" content="${SITE_NAME}">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${title}">
    <meta name="twitter:description" content="${description}">
    <meta name="twitter:image" content="${imageUrl}">
    <meta name="twitter:image:alt" content="${title}">
    <style>
      body { min-height: 100vh; margin: 0; display: grid; place-items: center; background: #181a1b; color: #f5f5f5; font-family: ui-sans-serif, system-ui, sans-serif; }
      a { color: ${accent}; font-weight: 800; }
    </style>
  </head>
  <body>
    <main>
      <p>${description}</p>
      <a href="${webUrl}">Open ${title}</a>
    </main>
  </body>
</html>`;
}

function renderEmbedCardSvg(model: EmbedModel): string {
  const meta = GAME_META[model.slug];
  const icon = GAME_ICON_SVGS[meta.icon];
  const accent = escapeXml(model.accent);
  const titleLines = wrapText(model.title.replace(" | Games", ""), 28, 2);
  const descriptionLines = wrapText(model.description, 58, 3);
  const details = model.details.slice(0, 3);
  const status = model.status ?? meta.players;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#202323"/>
      <stop offset="0.58" stop-color="#181a1b"/>
      <stop offset="1" stop-color="${accent}" stop-opacity="0.16"/>
    </linearGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="18" stdDeviation="22" flood-color="#000000" flood-opacity="0.38"/>
    </filter>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <circle cx="1058" cy="72" r="230" fill="${accent}" opacity="0.12"/>
  <circle cx="103" cy="572" r="180" fill="${accent}" opacity="0.08"/>
  <rect x="64" y="64" width="1072" height="502" rx="34" fill="#232323" stroke="${accent}" stroke-opacity="0.36" filter="url(#shadow)"/>
  <rect x="92" y="92" width="168" height="168" rx="30" fill="${escapeXml(meta.background)}" stroke="${accent}" stroke-opacity="0.45"/>
  <svg x="126" y="126" width="100" height="100" viewBox="${icon.viewBox}" color="${accent}">
    ${icon.markup}
  </svg>
  <text x="292" y="138" fill="${accent}" font-size="28" font-family="Arial, sans-serif" font-weight="800" letter-spacing="4">${escapeXml(SITE_NAME.toUpperCase())}</text>
  ${titleLines.map((line, index) => `<text x="292" y="${220 + index * 70}" fill="#f5f5f5" font-size="64" font-family="Arial, sans-serif" font-weight="900">${escapeXml(line)}</text>`).join("")}
  ${descriptionLines.map((line, index) => `<text x="292" y="${370 + index * 40}" fill="#cfcfcf" font-size="30" font-family="Arial, sans-serif" font-weight="600">${escapeXml(line)}</text>`).join("")}
  <g transform="translate(92 438)">
    <rect width="168" height="58" rx="18" fill="${accent}" fill-opacity="0.16" stroke="${accent}" stroke-opacity="0.5"/>
    <text x="84" y="37" fill="${accent}" text-anchor="middle" font-size="24" font-family="Arial, sans-serif" font-weight="900">${escapeXml(status)}</text>
  </g>
  ${model.code ? `<g transform="translate(92 510)"><text fill="#a7a7a7" font-size="20" font-family="Arial, sans-serif" font-weight="800">ROOM</text><text x="0" y="38" fill="#f5f5f5" font-size="34" font-family="Arial, sans-serif" font-weight="900" letter-spacing="3">${escapeXml(model.code)}</text></g>` : ""}
  <g transform="translate(292 506)">
    ${details.map((detail, index) => `<g transform="translate(${index * 232} 0)"><rect width="204" height="48" rx="16" fill="#2d2d2d" stroke="#3a3a3a"/><text x="102" y="31" text-anchor="middle" fill="#f5f5f5" font-size="22" font-family="Arial, sans-serif" font-weight="800">${escapeXml(detail)}</text></g>`).join("")}
  </g>
</svg>`;
}

function wrapText(text: string, maxChars: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxChars && current) {
      lines.push(current);
      current = word;
      if (lines.length === maxLines) break;
    } else {
      current = next;
    }
  }

  if (lines.length < maxLines && current) lines.push(current);
  if (lines.length > maxLines) return lines.slice(0, maxLines);
  const last = lines[lines.length - 1];
  if (words.join(" ").length > lines.join(" ").length && last) {
    lines[lines.length - 1] = `${last.replace(/\.*$/, "")}...`;
  }
  return lines;
}
