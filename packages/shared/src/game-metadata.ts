export type MultiplayerGameType =
  | "imposter"
  | "password"
  | "chain_reaction"
  | "shade_signal"
  | "location_signal";

export type GameSlug =
  | "home"
  | "imposter"
  | "password"
  | "chain"
  | "shade"
  | "location"
  | "shikaku"
  | "pips"
  | "zip";

export type GameIconName =
  | "globe"
  | "eye"
  | "shield"
  | "link"
  | "droplet"
  | "map-pin"
  | "grid-3x3"
  | "domino"
  | "path";

export type GameMetadata = {
  slug: GameSlug;
  multiplayerType?: MultiplayerGameType;
  title: string;
  shortTitle: string;
  pageTitle: string;
  description: string;
  shortDescription: string;
  players: string;
  accent: string;
  themeColor: string;
  background: string;
  icon: GameIconName;
  href?: string;
};

export const GAME_ICON_SVGS: Record<GameIconName, { viewBox: string; markup: string }> = {
  globe: {
    viewBox: "0 0 24 24",
    markup: [
      '<circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
      '<path d="M2 12h20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
      '<path d="M12 2a15.3 15.3 0 0 1 0 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
      '<path d="M12 2a15.3 15.3 0 0 0 0 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
    ].join(""),
  },
  eye: {
    viewBox: "0 0 24 24",
    markup: [
      '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
      '<circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
    ].join(""),
  },
  shield: {
    viewBox: "0 0 24 24",
    markup: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  },
  link: {
    viewBox: "0 0 24 24",
    markup: [
      '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
      '<path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
    ].join(""),
  },
  droplet: {
    viewBox: "0 0 24 24",
    markup: '<path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0L12 2.69z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  },
  "map-pin": {
    viewBox: "0 0 24 24",
    markup: [
      '<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
      '<circle cx="12" cy="10" r="3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
    ].join(""),
  },
  // A grid cut into uneven rectangles, one clue dot in each.
  "grid-3x3": {
    viewBox: "0 0 24 24",
    markup: [
      '<rect x="3" y="3" width="18" height="18" rx="2.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
      '<path d="M3 11h10M13 3v18M13 15h8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
      '<circle cx="8" cy="7" r="1.5" fill="currentColor"/>',
      '<circle cx="17" cy="9" r="1.5" fill="currentColor"/>',
    ].join(""),
  },
  // One domino, a one and a two.
  domino: {
    viewBox: "0 0 24 24",
    markup: [
      '<rect x="2" y="6" width="20" height="12" rx="3" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
      '<path d="M12 6v12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
      '<circle cx="7" cy="12" r="1.5" fill="currentColor"/>',
      '<circle cx="15" cy="9.5" r="1.5" fill="currentColor"/>',
      '<circle cx="19" cy="14.5" r="1.5" fill="currentColor"/>',
    ].join(""),
  },
  // One line snaking through a grid, from a start dot to an end dot.
  path: {
    viewBox: "0 0 24 24",
    markup: [
      '<path d="M5 5h14v7H5v7h14" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round"/>',
      '<circle cx="5" cy="5" r="2.25" fill="currentColor"/>',
      '<circle cx="19" cy="19" r="2.25" fill="currentColor"/>',
    ].join(""),
  },
};

export const GAME_META: Record<GameSlug, GameMetadata> = {
  home: {
    slug: "home",
    title: "Games",
    shortTitle: "Games",
    pageTitle: "Games",
    description: "Browser-based party games and logic puzzles. Create a room, send a link, and play with friends.",
    shortDescription: "Create or join party games with friends.",
    players: "Party",
    accent: "#7ecbff",
    themeColor: "#181a1b",
    background: "#181a1b",
    icon: "globe",
    href: "/",
  },
  imposter: {
    slug: "imposter",
    multiplayerType: "imposter",
    title: "Imposter",
    shortTitle: "Imposter",
    pageTitle: "Imposter | Games",
    description: "A social deduction word game. Everyone gives clues, then votes for who is faking it.",
    shortDescription: "Find the fake from one-word clues.",
    players: "3-12",
    accent: "#f05252",
    themeColor: "#f05252",
    background: "#2e1a1c",
    icon: "eye",
  },
  password: {
    slug: "password",
    multiplayerType: "password",
    title: "Password",
    shortTitle: "Password",
    pageTitle: "Password | Games",
    description: "A team word-guessing game with one-word clues and fast rounds.",
    shortDescription: "Team word-guessing with one-word clues.",
    players: "4+",
    accent: "#a78bfa",
    themeColor: "#a78bfa",
    background: "#21272e",
    icon: "shield",
  },
  chain: {
    slug: "chain",
    multiplayerType: "chain_reaction",
    title: "Chain Reaction",
    shortTitle: "Chain",
    pageTitle: "Chain Reaction | Games",
    description: "A head-to-head word chain duel. Guess the hidden links between the start and end hints.",
    shortDescription: "1v1 word chain duel.",
    players: "2",
    accent: "#34d399",
    themeColor: "#34d399",
    background: "#1a2e26",
    icon: "link",
  },
  shade: {
    slug: "shade",
    multiplayerType: "shade_signal",
    title: "Shade Signal",
    shortTitle: "Shade",
    pageTitle: "Shade Signal | Games",
    description: "A color-guessing party game. The leader describes a secret shade and everyone guesses the cell.",
    shortDescription: "Guess the secret color from text clues.",
    players: "3-8",
    accent: "#f472b6",
    themeColor: "#f472b6",
    background: "#2a1a2e",
    icon: "droplet",
  },
  location: {
    slug: "location",
    multiplayerType: "location_signal",
    title: "Location Signal",
    shortTitle: "Location",
    pageTitle: "Location Signal | Games",
    description: "A map-based guessing game. Read the clues, place your guess, and score by distance.",
    shortDescription: "Guess the secret map location from clues.",
    players: "3-8",
    accent: "#f59e0b",
    themeColor: "#f59e0b",
    background: "#2a1e0e",
    icon: "map-pin",
  },
  shikaku: {
    slug: "shikaku",
    title: "Shikaku",
    shortTitle: "Shikaku",
    pageTitle: "Shikaku | Games",
    description: "A timed logic puzzle. Divide the grid into rectangles, each containing one number equal to its area.",
    shortDescription: "Divide the grid into numbered rectangles.",
    players: "Solo",
    accent: "#34d399",
    themeColor: "#34d399",
    background: "#11251c",
    icon: "grid-3x3",
    href: "/shikaku",
  },
  pips: {
    slug: "pips",
    title: "Pips",
    shortTitle: "Pips",
    pageTitle: "Pips | Games",
    description: "A timed domino logic run. Place every domino so each colored region satisfies its rule.",
    shortDescription: "Domino logic run with timed splits.",
    players: "Solo",
    accent: "#fb923c",
    themeColor: "#fb923c",
    background: "#2f2118",
    icon: "domino",
    href: "/pips",
  },
  zip: {
    slug: "zip",
    title: "Zip",
    shortTitle: "Zip",
    pageTitle: "Zip | Games",
    description: "A timed path puzzle. Draw one line through every square, hitting the numbers in order.",
    shortDescription: "Draw one line through every square.",
    players: "Solo",
    accent: "#facc15",
    themeColor: "#facc15",
    background: "#2c2712",
    icon: "path",
    href: "/zip",
  },
};

export const GAME_SLUGS = Object.keys(GAME_META) as GameSlug[];

export const MULTIPLAYER_GAME_TYPE_TO_SLUG: Record<MultiplayerGameType, GameSlug> = {
  imposter: "imposter",
  password: "password",
  chain_reaction: "chain",
  shade_signal: "shade",
  location_signal: "location",
};

export function multiplayerTypeToGameSlug(gameType: MultiplayerGameType): GameSlug {
  return MULTIPLAYER_GAME_TYPE_TO_SLUG[gameType];
}

export function getGameMeta(slug: GameSlug): GameMetadata {
  return GAME_META[slug];
}

export function getGameSlugFromPath(pathname: string): GameSlug {
  const normalized = pathname.startsWith("/") ? pathname : `/${pathname}`;
  if (normalized.startsWith("/imposter")) return "imposter";
  if (normalized.startsWith("/password")) return "password";
  if (normalized.startsWith("/chain")) return "chain";
  if (normalized.startsWith("/shade")) return "shade";
  if (normalized.startsWith("/location")) return "location";
  if (/^\/shikaku(\/|$)/.test(normalized)) return "shikaku";
  if (/^\/pips(\/|$)/.test(normalized)) return "pips";
  if (/^\/zip(\/|$)/.test(normalized)) return "zip";
  return "home";
}

function escapeSvgAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function renderGameIconSvg(iconName: GameIconName, color: string, size = 24): string {
  const icon = GAME_ICON_SVGS[iconName];
  const safeColor = escapeSvgAttr(color);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="${icon.viewBox}" color="${safeColor}">${icon.markup}</svg>`;
}

export function renderGameFaviconSvg(slug: GameSlug, size = 32): string {
  const meta = GAME_META[slug];
  const icon = GAME_ICON_SVGS[meta.icon];
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 32 32">`,
    `<rect width="32" height="32" rx="7" fill="${escapeSvgAttr(meta.background)}"/>`,
    `<svg x="5" y="5" width="22" height="22" viewBox="${icon.viewBox}" color="${escapeSvgAttr(meta.accent)}">`,
    icon.markup,
    "</svg>",
    "</svg>",
  ].join("");
}

export function svgToDataUri(svg: string): string {
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
