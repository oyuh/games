import type { MiddlewareHandler } from "hono";

interface RateLimitOptions {
  windowMs: number;
  maxRequests: number;
  scope: string;
}

// In-memory sliding window store: compositeKey → timestamps[]
const store = new Map<string, number[]>();
const MAX_BUCKETS = 50_000;

// Periodic cleanup every 5 minutes
setInterval(() => {
  const cutoff = Date.now() - 120_000;
  for (const [key, timestamps] of store) {
    const filtered = timestamps.filter((t) => t > cutoff);
    if (filtered.length === 0) {
      store.delete(key);
    } else {
      store.set(key, filtered);
    }
  }
}, 5 * 60_000).unref();

function getClientIP(c: { req: { header: (name: string) => string | undefined } }): string {
  const raw = c.req.header("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  // Cap length to prevent memory abuse from spoofed headers
  return raw.length <= 45 ? raw : raw.slice(0, 45);
}

export function rateLimiter(options: RateLimitOptions): MiddlewareHandler {
  const { windowMs, maxRequests, scope } = options;
  // In local development (not test, not production), multiply the limit by 10x
  // so rapid manual testing isn't blocked by rate limits.
  const isDev = process.env.NODE_ENV !== "production" && process.env.NODE_ENV !== "test";
  const effectiveMax = isDev ? maxRequests * 10 : maxRequests;

  return async (c, next) => {
    const ip = getClientIP(c);
    const now = Date.now();
    const windowStart = now - windowMs;

    const bucketKey = `${scope}:${ip}`;
    let timestamps = store.get(bucketKey) || [];
    timestamps = timestamps.filter((t) => t > windowStart);

    if (timestamps.length >= effectiveMax) {
      const retryAfterMs = Math.max(500, windowMs - (now - timestamps[0]!));
      c.header("Retry-After", String(Math.ceil(retryAfterMs / 1000)));
      return c.json(
        {
          error: "Too many requests",
          code: "RATE_LIMITED",
          message: "Too many requests. Please slow down.",
          retryAfterMs,
          scope,
        },
        429
      );
    }

    // Prevent unbounded memory growth from many unique IPs
    if (!store.has(bucketKey) && store.size >= MAX_BUCKETS) {
      await next();
      return;
    }

    timestamps.push(now);
    store.set(bucketKey, timestamps);

    await next();
  };
}

// ─── Rate limit tiers ───────────────────────────────────────
// Central, named tiers so every route pulls from one tunable table instead of
// scattering magic numbers. All windows are 60s and counted per client IP.
// (Dev gets a 10x multiplier, see rateLimiter above.) Tune a tier here and it
// applies everywhere that tier is used.
//
// Rough philosophy:
//   • global:      catch-all flood ceiling so NO route is ever unprotected.
//   • high-volume: real-time sync / identity; generous so play is never throttled.
//   • abuse-prone: score submission, external geocoding; tight.
//   • internal:    secret-authed (admin/cron); present but generous.
export const RATE_LIMITS = {
  // Catch-all safety net applied to every /api and /debug route. High ceiling:
  // it only stops pathological floods; tighter per-route tiers do the real work.
  global: { windowMs: 60_000, maxRequests: 600 },

  // Real-time Zero sync push endpoint. Chatty by design, so it stays generous.
  zero: { windowMs: 60_000, maxRequests: 240 },

  // Session/identity resolution, hit on most page loads and reconnects.
  sessionSync: { windowMs: 60_000, maxRequests: 120 },

  // Per-game encryption key exchange.
  gameSecret: { windowMs: 60_000, maxRequests: 30 },

  // Map tile config (cheap, static-ish).
  mapsConfig: { windowMs: 60_000, maxRequests: 60 },

  // Geocoding proxies an external provider (Nominatim), so keep it tight.
  mapsGeocode: { windowMs: 60_000, maxRequests: 15 },

  // Solo-game reads: leaderboards, eligibility checks, puzzle image generation.
  game: { windowMs: 60_000, maxRequests: 30 },

  // Solo-game score submission: the strictest public tier (anti-cheat + write).
  score: { windowMs: 60_000, maxRequests: 6 },

  // Rich-link embeds for crawlers/social previews (does DB reads).
  embed: { windowMs: 60_000, maxRequests: 60 },

  // Public read-only lookups (restricted-name list, admin status banner).
  publicRead: { windowMs: 60_000, maxRequests: 60 },

  // Admin dashboard is secret-authed and polls several endpoints, so generous.
  admin: { windowMs: 60_000, maxRequests: 120 },

  // Cron-triggered + secret-authed (cleanup / activity report).
  cron: { windowMs: 60_000, maxRequests: 10 },

  // Debug build-info runs a DB probe, so keep it modest.
  debug: { windowMs: 60_000, maxRequests: 20 },

  // Health check is the cheapest endpoint; the high ceiling just caps abuse.
  health: { windowMs: 60_000, maxRequests: 600 },
} as const;

export type RateLimitTier = keyof typeof RATE_LIMITS;

/**
 * Build rate-limit middleware from a named tier. The bucket scope defaults to
 * the tier name; pass an explicit `scope` when several routes share a tier but
 * must not share a counter (e.g. shikaku vs pips both use the "game"/"score"
 * tiers but need independent buckets).
 */
export function rateLimit(tier: RateLimitTier, scope?: string): MiddlewareHandler {
  const { windowMs, maxRequests } = RATE_LIMITS[tier];
  return rateLimiter({ windowMs, maxRequests, scope: scope ?? tier });
}
