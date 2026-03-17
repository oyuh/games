import type { MiddlewareHandler } from "hono";

interface RateLimitOptions {
  windowMs: number;
  maxRequests: number;
  scope: string;
}

// In-memory sliding window store: compositeKey → timestamps[]
const store = new Map<string, number[]>();

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
  return c.req.header("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

export function rateLimiter(options: RateLimitOptions): MiddlewareHandler {
  const { windowMs, maxRequests, scope } = options;

  return async (c, next) => {
    const ip = getClientIP(c);
    const now = Date.now();
    const windowStart = now - windowMs;

    const bucketKey = `${scope}:${ip}`;
    let timestamps = store.get(bucketKey) || [];
    timestamps = timestamps.filter((t) => t > windowStart);

    if (timestamps.length >= maxRequests) {
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

    timestamps.push(now);
    store.set(bucketKey, timestamps);

    await next();
  };
}
