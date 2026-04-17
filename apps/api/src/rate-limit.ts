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
