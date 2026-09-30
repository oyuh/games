import type { MiddlewareHandler } from "hono";

declare module "hono" {
  interface ContextVariableMap {
    /** Verified session behind the request, set by the bot gate in index.ts. */
    sessionId: string | null;
    /** Which bucket turned the request away, so only a session's own 429s score it. */
    rateLimitedBy: "session" | "ip";
  }
}

interface RateLimitOptions {
  windowMs: number;
  /** Per session, or per IP for a request with no session. */
  maxRequests: number;
  /** Everyone behind one IP together. Defaults to IP_SHARE times maxRequests. */
  ipMaxRequests?: number;
  scope: string;
}

/**
 * A school or office puts a whole room behind one address, so the IP bucket
 * is a spam ceiling rather than a per-player budget: room for this many
 * players at full tilt before the address is turned away.
 */
const IP_SHARE = 5;

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

/** Recent hits in the bucket, or how long until it has room again. */
function check(bucketKey: string, max: number, windowMs: number, now: number) {
  const timestamps = (store.get(bucketKey) ?? []).filter((t) => t > now - windowMs);
  return timestamps.length >= max
    ? { timestamps, retryAfterMs: Math.max(500, windowMs - (now - timestamps[0]!)) }
    : { timestamps, retryAfterMs: 0 };
}

export function rateLimiter(options: RateLimitOptions): MiddlewareHandler {
  const { windowMs, maxRequests, scope } = options;
  // In local development (not test, not production), multiply the limit by 10x
  // so rapid manual testing isn't blocked by rate limits.
  const isDev = process.env.NODE_ENV !== "production" && process.env.NODE_ENV !== "test";
  const devScale = isDev ? 10 : 1;
  const effectiveMax = maxRequests * devScale;
  const effectiveIpMax = (options.ipMaxRequests ?? maxRequests * IP_SHARE) * devScale;

  return async (c, next) => {
    const ip = getClientIP(c);
    const sessionId = c.get("sessionId") ?? null;
    const now = Date.now();

    // A session gets its own budget and the address a wider shared one. With
    // no session the address is all there is, so it gets the tight budget.
    const buckets = sessionId
      ? [
          { by: "session" as const, key: `${scope}:s:${sessionId}`, max: effectiveMax },
          { by: "ip" as const, key: `${scope}:ip:${ip}`, max: effectiveIpMax },
        ]
      : [{ by: "ip" as const, key: `${scope}:${ip}`, max: effectiveMax }];

    const checked = buckets.map((bucket) => ({ ...bucket, ...check(bucket.key, bucket.max, windowMs, now) }));
    const full = checked.find((bucket) => bucket.retryAfterMs > 0);
    if (full) {
      c.set("rateLimitedBy", full.by);
      c.header("Retry-After", String(Math.ceil(full.retryAfterMs / 1000)));
      return c.json(
        {
          error: "Too many requests",
          code: "RATE_LIMITED",
          message: "Too many requests. Please slow down.",
          retryAfterMs: full.retryAfterMs,
          scope,
        },
        429
      );
    }

    for (const bucket of checked) {
      // Prevent unbounded memory growth from many unique IPs and sessions
      if (!store.has(bucket.key) && store.size >= MAX_BUCKETS) continue;
      bucket.timestamps.push(now);
      store.set(bucket.key, bucket.timestamps);
    }

    await next();
  };
}

// ─── Rate limit tiers ───────────────────────────────────────
// Central, named tiers so every route pulls from one tunable table instead of
// scattering magic numbers. All windows are 60s. maxRequests is per session
// (per IP when there is none); each IP also gets IP_SHARE times that, shared.
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
  // Every push arrives from zero-cache's own address, so the IP bucket here is
  // one ceiling for the whole server, not per player; the session bucket is
  // the real per-player limit.
  zero: { windowMs: 60_000, maxRequests: 240, ipMaxRequests: 12_000 },

  // Session/identity resolution, hit on most page loads and reconnects.
  sessionSync: { windowMs: 60_000, maxRequests: 120 },

  // Per-game encryption key exchange.
  gameSecret: { windowMs: 60_000, maxRequests: 30 },

  // Bot check status and Turnstile verify. Verify calls Cloudflare, and a
  // person solves one check a minute at most.
  challenge: { windowMs: 60_000, maxRequests: 30 },

  // Map tile config (cheap, static-ish).
  mapsConfig: { windowMs: 60_000, maxRequests: 60 },

  // Geocoding proxies an external provider (Nominatim), so keep it tight.
  mapsGeocode: { windowMs: 60_000, maxRequests: 15 },

  // Solo-game reads: leaderboards, eligibility checks, puzzle image generation.
  game: { windowMs: 60_000, maxRequests: 30 },

  // Leaderboard search. Typing fires more requests than a plain board read even
  // debounced, so it gets its own budget instead of eating the "game" one, and
  // a tighter one because every search is an unindexed scan.
  leaderboardSearch: { windowMs: 60_000, maxRequests: 40 },

  // Solo-game score submission: the strictest public tier (anti-cheat + write).
  score: { windowMs: 60_000, maxRequests: 6 },

  // Rich-link embeds for crawlers/social previews (does DB reads).
  embed: { windowMs: 60_000, maxRequests: 60 },

  // Public read-only lookups (restricted-name list, admin status banner).
  publicRead: { windowMs: 60_000, maxRequests: 60 },

  // Admin dashboard is secret-authed and polls several endpoints, so generous.
  admin: { windowMs: 60_000, maxRequests: 120 },

  // Cron-triggered + secret-authed cleanup.
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
  return rateLimiter({ ...RATE_LIMITS[tier], scope: scope ?? tier });
}
