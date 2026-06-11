import {
  GAME_META,
  getGameSlugFromPath,
  type GameSlug,
} from "@games/shared";
import {
  chainReactionGames,
  imposterGames,
  locationSignalGames,
  passwordGames,
  shadeSignalGames,
} from "@games/shared/db";
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
  accent: string;
  code?: string;
  status?: string;
  details: string[];
};

type JsonRecord = Record<string, unknown>;

export const embedRoutes = new Hono();

embedRoutes.get("/html", async (c) => {
  const path = normalizePath(c.req.query("path"));
  const model = await resolveEmbedModel(path, getWebOrigin(c));

  return c.html(renderEmbedHtml(model), 200, {
    "Cache-Control": "public, max-age=60, s-maxage=300",
    "Content-Type": "text/html; charset=utf-8",
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

async function resolveEmbedModel(path: string, webOrigin: string): Promise<EmbedModel> {
  const slug = getGameSlugFromPath(path);
  const meta = GAME_META[slug];
  const webUrl = new URL(path, webOrigin).toString();
  const fallback: EmbedModel = {
    slug,
    title: meta.pageTitle,
    description: meta.description,
    webUrl,
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

function renderEmbedHtml(model: EmbedModel): string {
  const title = escapeHtml(model.title);
  const description = escapeHtml(model.description);
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
    <meta property="og:url" content="${webUrl}">
    <meta property="og:site_name" content="${SITE_NAME}">
    <meta name="twitter:card" content="summary">
    <meta name="twitter:title" content="${title}">
    <meta name="twitter:description" content="${description}">
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
