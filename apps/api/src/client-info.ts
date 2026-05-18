import { isIP } from "node:net";

export type HeaderReader = {
  header: (name: string) => string | undefined;
};

export type ClientInfo = {
  ip: string;
  region: string;
  userAgent: string;
};

const UNKNOWN_IP = "unknown";
const UNKNOWN_REGION = "unknown";
const GEOIP_SUCCESS_TTL_MS = 12 * 60 * 60 * 1000;
const GEOIP_FAILURE_TTL_MS = 10 * 60 * 1000;
const GEOIP_TIMEOUT_MS = 2_000;

const regionCache = new Map<string, { region: string; expiresAt: number }>();
const inflightLookups = new Map<string, Promise<string>>();

function firstNonEmpty(values: Array<string | undefined>) {
  for (const value of values) {
    if (value && value.trim()) {
      return value.trim();
    }
  }
  return "";
}

function sanitizeRegion(rawValue: string | undefined) {
  const token = (rawValue ?? "").trim().split(/[\s,;]+/)[0] ?? "";
  const normalized = token.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 10);

  if (!normalized) {
    return UNKNOWN_REGION;
  }

  if (normalized.toLowerCase() === UNKNOWN_REGION) {
    return UNKNOWN_REGION;
  }

  return normalized.toUpperCase();
}

function sanitizeUserAgent(rawValue: string | undefined) {
  const normalized = (rawValue ?? UNKNOWN_IP).replace(/[\u0000-\u001f\u007f]+/g, " ").trim();
  return (normalized || UNKNOWN_IP).slice(0, 500);
}

function normalizeIpCandidate(rawValue: string | undefined) {
  let candidate = (rawValue ?? "").trim();
  if (!candidate) {
    return "";
  }

  candidate = candidate.split(",")[0]?.trim() ?? "";
  candidate = candidate.split(/\s+/)[0] ?? candidate;

  if (candidate.startsWith("[") && candidate.includes("]")) {
    candidate = candidate.slice(1, candidate.indexOf("]"));
  }

  if (candidate.toLowerCase().startsWith("::ffff:")) {
    candidate = candidate.slice(7);
  }

  if (/^\d{1,3}(?:\.\d{1,3}){3}:\d+$/.test(candidate)) {
    candidate = candidate.replace(/:\d+$/, "");
  }

  candidate = candidate.replace(/[\u0000-\u001f\u007f]+/g, "").trim();
  return candidate.slice(0, 45);
}

function isPrivateIpv4(ip: string) {
  const octets = ip.split(".").map((value) => Number(value));
  if (octets.length !== 4 || octets.some((value) => !Number.isFinite(value))) {
    return true;
  }

  const [first = -1, second = -1] = octets;

  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    (first === 198 && (second === 18 || second === 19))
  );
}

function isPrivateIpv6(ip: string) {
  const normalized = ip.toLowerCase();
  return (
    normalized === "::" ||
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe80") ||
    normalized.startsWith("2001:db8")
  );
}

function isLookupEligibleIp(ip: string) {
  if (!ip || ip === UNKNOWN_IP) {
    return false;
  }

  const family = isIP(ip);
  if (family === 4) {
    return !isPrivateIpv4(ip);
  }
  if (family === 6) {
    return !isPrivateIpv6(ip);
  }
  return false;
}

function getCachedRegion(ip: string) {
  const cached = regionCache.get(ip);
  if (!cached) {
    return null;
  }
  if (cached.expiresAt <= Date.now()) {
    regionCache.delete(ip);
    return null;
  }
  return cached.region;
}

function cacheRegion(ip: string, region: string, ttlMs: number) {
  regionCache.set(ip, {
    region,
    expiresAt: Date.now() + ttlMs,
  });
}

async function lookupRegionFromIpApi(ip: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GEOIP_TIMEOUT_MS);

  try {
    const response = await fetch(`https://ipwho.is/${encodeURIComponent(ip)}`, {
      signal: controller.signal,
      headers: {
        "User-Agent": "games-refac-api/geoip",
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      cacheRegion(ip, UNKNOWN_REGION, GEOIP_FAILURE_TTL_MS);
      return UNKNOWN_REGION;
    }

    const payload = (await response.json()) as {
      success?: boolean;
      country_code?: string;
      region_code?: string;
    };

    if (!payload.success) {
      cacheRegion(ip, UNKNOWN_REGION, GEOIP_FAILURE_TTL_MS);
      return UNKNOWN_REGION;
    }

    const resolvedRegion = sanitizeRegion(payload.country_code ?? payload.region_code);
    const finalRegion = resolvedRegion === UNKNOWN_REGION ? UNKNOWN_REGION : resolvedRegion;
    cacheRegion(
      ip,
      finalRegion,
      finalRegion === UNKNOWN_REGION ? GEOIP_FAILURE_TTL_MS : GEOIP_SUCCESS_TTL_MS
    );
    return finalRegion;
  } catch {
    cacheRegion(ip, UNKNOWN_REGION, GEOIP_FAILURE_TTL_MS);
    return UNKNOWN_REGION;
  } finally {
    clearTimeout(timeout);
  }
}

export function extractClientInfo(headers: HeaderReader): ClientInfo {
  const ip = firstNonEmpty([
    normalizeIpCandidate(headers.header("cf-connecting-ip")),
    normalizeIpCandidate(headers.header("x-real-ip")),
    normalizeIpCandidate(headers.header("x-client-ip")),
    normalizeIpCandidate(headers.header("x-forwarded-for")),
    normalizeIpCandidate(headers.header("x-vercel-forwarded-for")),
  ]);

  return {
    ip: ip || UNKNOWN_IP,
    region: sanitizeRegion(firstNonEmpty([headers.header("cf-ipcountry"), headers.header("x-vercel-ip-country")])),
    userAgent: sanitizeUserAgent(headers.header("user-agent")),
  };
}

export async function resolveRegionForIp(ip: string, fallbackRegion = UNKNOWN_REGION) {
  const normalizedFallback = sanitizeRegion(fallbackRegion);
  if (normalizedFallback !== UNKNOWN_REGION) {
    return normalizedFallback;
  }

  if (!isLookupEligibleIp(ip)) {
    return UNKNOWN_REGION;
  }

  const cachedRegion = getCachedRegion(ip);
  if (cachedRegion) {
    return cachedRegion;
  }

  const inflight = inflightLookups.get(ip);
  if (inflight) {
    return inflight;
  }

  const lookup = lookupRegionFromIpApi(ip).finally(() => {
    inflightLookups.delete(ip);
  });

  inflightLookups.set(ip, lookup);
  return lookup;
}

export async function getClientInfo(headers: HeaderReader): Promise<ClientInfo> {
  const baseInfo = extractClientInfo(headers);
  return {
    ...baseInfo,
    region: await resolveRegionForIp(baseInfo.ip, baseInfo.region),
  };
}

export function resetClientInfoCachesForTests() {
  regionCache.clear();
  inflightLookups.clear();
}
