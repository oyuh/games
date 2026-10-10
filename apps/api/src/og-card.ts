/**
 * The 1200×630 link preview card every share and embed hands to Discord,
 * Slack, iMessage and friends: who it is and what it is on the left, the
 * board (or the room code, or the game's icon) on the right, and a stripe of
 * the game's color along the bottom.
 *
 * Link-preview bots won't draw an SVG og:image, so the card is rasterized to
 * PNG with resvg. resvg only sees the fonts in apps/api/fonts, so text set in
 * anything else falls back to Urbanist.
 */

import { readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";
import { GAME_ICON_SVGS, type GameIconName } from "@games/shared";
import { svgPalette, SVG_FONT, SVG_MONO } from "./svg-theme";

export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;

const FONT_DIR = fileURLToPath(new URL("../fonts/", import.meta.url));
const FONT_FILES = readdirSync(FONT_DIR).filter((f) => f.endsWith(".ttf")).map((f) => join(FONT_DIR, f));

export function svgToPng(svg: string): Uint8Array<ArrayBuffer> {
  const resvg = new Resvg(svg, {
    font: {
      fontFiles: FONT_FILES,
      loadSystemFonts: false,
      defaultFontFamily: "Urbanist",
      sansSerifFamily: "Urbanist",
      monospaceFamily: "IBM Plex Mono",
    },
  });
  return new Uint8Array(resvg.render().asPng());
}

export interface OgCard {
  accent: string;
  icon: GameIconName;
  game: string;
  headline: string;
  details: string[];
  seed?: number;
  /** SVG markup for the right side, scaled to fit. */
  board?: string;
  /** A room code, drawn on the right when there's no board. */
  code?: string;
}

const PAD = 72;
const RIGHT_X = 640;
const RIGHT_W = OG_WIDTH - RIGHT_X - 56;
const RIGHT_Y = 56;
const RIGHT_H = OG_HEIGHT - RIGHT_Y * 2 - 8;
const STRIPE = 8;

function escapeXml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Greedy word wrap on a rough average glyph width. Good enough for short copy. */
function wrap(text: string, fontSize: number, maxWidth: number, maxLines: number): string[] {
  const perLine = Math.max(8, Math.floor(maxWidth / (fontSize * 0.56)));
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > perLine && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    lines.length = maxLines;
    lines[maxLines - 1] = `${lines[maxLines - 1]!.replace(/[\s,.;:]+$/, "")}…`;
  }
  return lines;
}

/** Moves an <svg> into the box, keeping its viewBox so it scales to fit. */
function placeSvg(svg: string, x: number, y: number, width: number, height: number): string {
  return svg.replace(/^<svg\b([^>]*)>/, (_, attrs: string) =>
    `<svg${attrs.replace(/\s(?:width|height|x|y)="[^"]*"/g, "")} x="${x}" y="${y}" width="${width}" height="${height}">`);
}

function renderRight(card: OgCard, palette: ReturnType<typeof svgPalette>): string {
  if (card.board) return placeSvg(card.board, RIGHT_X, RIGHT_Y, RIGHT_W, RIGHT_H);

  const boxX = RIGHT_X + 24;
  const boxW = RIGHT_W - 24;
  if (card.code) {
    const boxH = 260;
    const boxY = (OG_HEIGHT - STRIPE - boxH) / 2;
    const codeSize = Math.min(112, Math.floor((boxW - 64) / (card.code.length * 0.62)));
    return [
      `<rect x="${boxX}" y="${boxY}" width="${boxW}" height="${boxH}" rx="10" fill="${palette.card}" stroke="${palette.border}" stroke-width="2"/>`,
      `<text x="${boxX + 40}" y="${boxY + 64}" fill="${palette.muted}" font-size="28" font-weight="600">Room code</text>`,
      `<text x="${boxX + 40}" y="${boxY + 64 + 40 + codeSize * 0.8}" fill="${palette.text}" font-family="${SVG_MONO}" font-size="${codeSize}" font-weight="500" letter-spacing="4">${escapeXml(card.code)}</text>`,
    ].join("");
  }

  const icon = GAME_ICON_SVGS[card.icon];
  const size = 300;
  return `<svg x="${boxX + (boxW - size) / 2}" y="${(OG_HEIGHT - STRIPE - size) / 2}" width="${size}" height="${size}" viewBox="${icon.viewBox}" color="${card.accent}">${icon.markup}</svg>`;
}

export function renderOgCardSvg(card: OgCard): string {
  const palette = svgPalette("dark");
  const textW = RIGHT_X - PAD - 40;
  const icon = GAME_ICON_SVGS[card.icon];

  const gameSize = Math.min(104, Math.floor(textW / (card.game.length * 0.62)));
  const gameY = 150 + gameSize * 0.75;
  const headline = wrap(card.headline, 42, textW, 2);
  const headlineY = gameY + 70;
  const details = card.details.flatMap((detail) => wrap(detail, 28, textW, 3)).slice(0, 4);
  const detailsY = headlineY + (headline.length - 1) * 52 + 64;

  const parts = [
    `<rect width="${OG_WIDTH}" height="${OG_HEIGHT}" fill="${palette.bg}"/>`,
    `<rect y="${OG_HEIGHT - STRIPE}" width="${OG_WIDTH}" height="${STRIPE}" fill="${card.accent}"/>`,
    `<svg x="${PAD}" y="${PAD - 6}" width="40" height="40" viewBox="${icon.viewBox}" color="${card.accent}">${icon.markup}</svg>`,
    `<text x="${PAD + 56}" y="${PAD + 24}" fill="${palette.muted}" font-size="26" font-weight="600">Games by Lawson Hart</text>`,
    `<text x="${PAD - 4}" y="${gameY}" fill="${card.accent}" font-size="${gameSize}" font-weight="900" letter-spacing="-2">${escapeXml(card.game)}</text>`,
    ...headline.map((line, i) => `<text x="${PAD}" y="${headlineY + i * 52}" fill="${palette.text}" font-size="42" font-weight="700">${escapeXml(line)}</text>`),
    ...details.map((line, i) => `<text x="${PAD}" y="${detailsY + i * 40}" fill="${palette.muted}" font-size="28">${escapeXml(line)}</text>`),
  ];
  if (card.seed !== undefined) {
    parts.push(`<text x="${PAD}" y="${OG_HEIGHT - STRIPE - PAD + 8}" fill="${palette.muted}" font-family="${SVG_MONO}" font-size="30">#${card.seed}</text>`);
  }
  parts.push(renderRight(card, palette));

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${OG_WIDTH}" height="${OG_HEIGHT}" viewBox="0 0 ${OG_WIDTH} ${OG_HEIGHT}" font-family="${SVG_FONT}">${parts.join("")}</svg>`;
}

export function renderOgCardPng(card: OgCard): Uint8Array<ArrayBuffer> {
  return svgToPng(renderOgCardSvg(card));
}
