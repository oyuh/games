/**
 * The site's colors and type for the SVGs the API draws (Shikaku, Pips, Zip).
 * Mirrors the tokens in apps/web base.css (dark) and themes.css (light), so
 * keep the two in step. Plain hex only: these get rasterized by link-preview
 * bots that don't understand color-mix().
 */

export type SvgTheme = "dark" | "light";

// Axiforma and Plex only show up where the page around the SVG loaded them
// (the inline board on /api/shikaku/puzzle). As a bare <img> the fallbacks win.
export const SVG_FONT = "Axiforma, ui-sans-serif, system-ui, -apple-system, sans-serif";
export const SVG_MONO = "'IBM Plex Mono', ui-monospace, 'SF Mono', Consolas, monospace";

export interface SvgPalette {
  bg: string;
  card: string;
  border: string;
  text: string;
  muted: string;
}

/** `color` laid over `base` at `amount` (0 to 1), as hex. Both take #rrggbb. */
export function mixHex(color: string, base: string, amount: number): string {
  const channel = (hex: string, i: number) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
  return `#${[0, 1, 2]
    .map((i) => Math.round(channel(color, i) * amount + channel(base, i) * (1 - amount)).toString(16).padStart(2, "0"))
    .join("")}`;
}

export function svgPalette(theme: SvgTheme): SvgPalette {
  return theme === "dark"
    ? { bg: "#181a1b", card: "#232323", border: "#333333", text: "#f5f5f5", muted: "#bdbdbd" }
    : { bg: "#e8e6e3", card: "#f0eeeb", border: "#c8c5c1", text: "#1a1a1a", muted: "#64748b" };
}
