import { adminRestrictedNames } from "@games/shared";
import { drizzleClient } from "./db-provider";
import { sanitizeSessionName } from "./session-identity";

const RESTRICTED_NAME_CACHE_TTL_MS = 10_000;

let cachedRestrictedPatterns: string[] = [];
let cachedRestrictedPatternsAt = 0;

function escapeRestrictedPattern(pattern: string) {
  return pattern.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
}

export function normalizeRestrictedNamePattern(pattern: string) {
  return pattern.trim().toLowerCase();
}

export function primeRestrictedNamePatternCache(patterns: string[]) {
  cachedRestrictedPatterns = patterns
    .map(normalizeRestrictedNamePattern)
    .filter(Boolean);
  cachedRestrictedPatternsAt = Date.now();
}

export async function loadRestrictedNamePatterns(options?: { force?: boolean }) {
  const force = options?.force ?? false;
  if (!force && cachedRestrictedPatternsAt > 0 && Date.now() - cachedRestrictedPatternsAt < RESTRICTED_NAME_CACHE_TTL_MS) {
    return cachedRestrictedPatterns;
  }

  const restricted = await drizzleClient
    .select({ pattern: adminRestrictedNames.pattern })
    .from(adminRestrictedNames);
  const patterns = restricted.map((entry) => entry.pattern);
  primeRestrictedNamePatternCache(patterns);
  return cachedRestrictedPatterns;
}

export function matchesRestrictedNamePattern(name: string, pattern: string) {
  const normalizedName = sanitizeSessionName(name)?.toLowerCase();
  const normalizedPattern = normalizeRestrictedNamePattern(pattern);

  if (!normalizedName || !normalizedPattern) {
    return false;
  }

  if (normalizedPattern.includes("*")) {
    const wildcardPattern = escapeRestrictedPattern(normalizedPattern).replace(/\*/g, ".*");
    return new RegExp(`^${wildcardPattern}$`, "i").test(normalizedName);
  }

  return normalizedName === normalizedPattern;
}

export function isRestrictedName(name: string | null | undefined, patterns: string[]) {
  const normalizedName = sanitizeSessionName(name)?.toLowerCase();
  if (!normalizedName) {
    return false;
  }

  return patterns.some((pattern) => matchesRestrictedNamePattern(normalizedName, pattern));
}

export async function findRestrictedNameMatch(name: string | null | undefined) {
  const normalizedName = sanitizeSessionName(name);
  if (!normalizedName) {
    return null;
  }

  const patterns = await loadRestrictedNamePatterns();
  return patterns.find((pattern) => matchesRestrictedNamePattern(normalizedName, pattern)) ?? null;
}

export async function allowUnrestrictedSessionName(name: string | null | undefined) {
  const normalizedName = sanitizeSessionName(name);
  if (!normalizedName) {
    return null;
  }

  return (await findRestrictedNameMatch(normalizedName)) ? null : normalizedName;
}
