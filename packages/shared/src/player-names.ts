export const playerNameAdjectives = [
  "Swift", "Sneaky", "Cosmic", "Lucky", "Dizzy", "Frosty", "Bold", "Chill",
  "Witty", "Fierce", "Jolly", "Mystic", "Nifty", "Pixel", "Rapid", "Silent",
  "Turbo", "Vivid", "Wacky", "Zesty", "Brave", "Clever", "Funky", "Groovy",
  "Hyper", "Keen", "Lively", "Plucky", "Radiant", "Spunky", "Sleepy", "Stormy",
  "Sunny", "Fuzzy", "Crispy", "Bouncy", "Shifty", "Sparky", "Tricky", "Zippy",
];

export const playerNameNouns = [
  "Panda", "Fox", "Falcon", "Otter", "Wolf", "Shark", "Raven", "Lynx",
  "Cobra", "Badger", "Hawk", "Tiger", "Bear", "Moose", "Owl", "Penguin",
  "Dragon", "Phoenix", "Pirate", "Knight", "Ninja", "Wizard", "Ghost", "Robot",
  "Yeti", "Gremlin", "Goblin", "Squid", "Toucan", "Ferret", "Walrus", "Jackal",
  "Beetle", "Puffin", "Coyote", "Mole", "Parrot", "Wasp", "Mantis", "Orca",
];

export const MAX_PLAYER_NAME_LEN = 30;

export function sanitizePlayerName(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const sanitized = value
    .trim()
    .replace(/<[^>]+>/g, "")
    .replace(/\s/g, "")
    .slice(0, MAX_PLAYER_NAME_LEN);

  return sanitized || null;
}

export function randomPlayerName() {
  const adj = playerNameAdjectives[Math.floor(Math.random() * playerNameAdjectives.length)]!;
  const noun = playerNameNouns[Math.floor(Math.random() * playerNameNouns.length)]!;
  return `${adj}${noun}`;
}

function hashSeed(seed: string) {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function fallbackPlayerName(seed?: string | null) {
  const normalizedSeed = typeof seed === "string" ? seed.trim() : "";
  if (!normalizedSeed) {
    return randomPlayerName();
  }

  const hash = hashSeed(normalizedSeed);
  const adj = playerNameAdjectives[hash % playerNameAdjectives.length]!;
  const noun = playerNameNouns[Math.floor(hash / playerNameAdjectives.length) % playerNameNouns.length]!;
  return `${adj}${noun}`;
}

export function resolvePlayerName(name: unknown, seed?: string | null) {
  return sanitizePlayerName(name) ?? fallbackPlayerName(seed);
}
