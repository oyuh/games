import { describe, it, expect } from "bun:test";
import { Hono } from "hono";
import { rateLimiter } from "../rate-limit";

function makeApp(opts: { windowMs: number; maxRequests: number; scope: string }) {
  const app = new Hono();
  app.use("*", rateLimiter(opts));
  app.get("/test", (c) => c.json({ ok: true }));
  return app;
}

async function req(app: Hono, ip = "127.0.0.1") {
  return app.request("/test", {
    method: "GET",
    headers: { "x-forwarded-for": ip },
  });
}

// ─── Sliding Window ─────────────────────────────────────────
describe("rateLimiter: sliding window", () => {
  it("allows requests under the limit", async () => {
    const app = makeApp({ windowMs: 60_000, maxRequests: 5, scope: "test-allow" });
    for (let i = 0; i < 5; i++) {
      const res = await req(app, "10.0.0.1");
      expect(res.status).toBe(200);
    }
  });

  it("returns 429 when limit exceeded", async () => {
    const app = makeApp({ windowMs: 60_000, maxRequests: 3, scope: "test-block" });
    await req(app, "10.0.0.2");
    await req(app, "10.0.0.2");
    await req(app, "10.0.0.2");
    const blocked = await req(app, "10.0.0.2");
    expect(blocked.status).toBe(429);
    const body = await blocked.json();
    expect(body.code).toBe("RATE_LIMITED");
    expect(body.retryAfterMs).toBeGreaterThan(0);
  });

  it("includes Retry-After header on 429", async () => {
    const app = makeApp({ windowMs: 60_000, maxRequests: 1, scope: "test-header" });
    await req(app, "10.0.0.3");
    const blocked = await req(app, "10.0.0.3");
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("Retry-After")).toBeTruthy();
    const retryAfter = Number(blocked.headers.get("Retry-After"));
    expect(retryAfter).toBeGreaterThan(0);
  });

  it("different IPs have independent limits", async () => {
    const app = makeApp({ windowMs: 60_000, maxRequests: 2, scope: "test-multi" });
    await req(app, "10.0.0.4");
    await req(app, "10.0.0.4");
    // IP .4 is now exhausted
    const blocked = await req(app, "10.0.0.4");
    expect(blocked.status).toBe(429);
    // IP .5 should still be fine
    const ok = await req(app, "10.0.0.5");
    expect(ok.status).toBe(200);
  });

  it("different scopes are independent", async () => {
    const app = new Hono();
    app.use("/a/*", rateLimiter({ windowMs: 60_000, maxRequests: 1, scope: "scope-a" }));
    app.use("/b/*", rateLimiter({ windowMs: 60_000, maxRequests: 1, scope: "scope-b" }));
    app.get("/a/test", (c) => c.json({ ok: true }));
    app.get("/b/test", (c) => c.json({ ok: true }));

    const resA = await app.request("/a/test", {
      method: "GET",
      headers: { "x-forwarded-for": "10.0.0.6" },
    });
    expect(resA.status).toBe(200);

    // Same IP, different scope, so this should still be allowed
    const resB = await app.request("/b/test", {
      method: "GET",
      headers: { "x-forwarded-for": "10.0.0.6" },
    });
    expect(resB.status).toBe(200);
  });
});

// ─── IP Extraction ──────────────────────────────────────────
describe("rateLimiter: IP extraction", () => {
  it("uses first IP from x-forwarded-for", async () => {
    const app = makeApp({ windowMs: 60_000, maxRequests: 1, scope: "test-ip-fwd" });
    const res1 = await app.request("/test", {
      method: "GET",
      headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8" },
    });
    expect(res1.status).toBe(200);

    // Same first IP should be limited
    const res2 = await app.request("/test", {
      method: "GET",
      headers: { "x-forwarded-for": "1.2.3.4, 9.10.11.12" },
    });
    expect(res2.status).toBe(429);
  });

  it('falls back to "unknown" without x-forwarded-for', async () => {
    const app = makeApp({ windowMs: 60_000, maxRequests: 1, scope: "test-ip-unknown" });
    const res = await app.request("/test", { method: "GET" });
    expect(res.status).toBe(200);
    // Second request from "unknown" should hit the same bucket
    const res2 = await app.request("/test", { method: "GET" });
    expect(res2.status).toBe(429);
  });
});

// ─── Input validation helpers (tested via API behavior) ─────
describe("rateLimiter: edge cases", () => {
  it("includes scope in the 429 response body", async () => {
    const app = makeApp({ windowMs: 60_000, maxRequests: 1, scope: "my_scope" });
    await req(app, "10.0.0.20");
    const res = await req(app, "10.0.0.20");
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.scope).toBe("my_scope");
  });

  it("retryAfterMs is at least 500", async () => {
    const app = makeApp({ windowMs: 1_000, maxRequests: 1, scope: "test-retry-min" });
    await req(app, "10.0.0.21");
    const res = await req(app, "10.0.0.21");
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.retryAfterMs).toBeGreaterThanOrEqual(500);
  });
});

// ─── Sessions ───────────────────────────────────────────────
describe("rateLimiter: per session", () => {
  // Stands in for the bot gate in index.ts, which sets the verified session.
  function sessionApp(opts: { maxRequests: number; ipMaxRequests: number; scope: string }) {
    const app = new Hono();
    app.use("*", (c, next) => {
      c.set("sessionId", c.req.header("x-test-session") ?? null);
      return next();
    });
    app.use("*", rateLimiter({ windowMs: 60_000, ...opts }));
    app.get("/test", (c) => c.json({ ok: true }));
    return app;
  }

  const hit = (app: Hono, session: string) =>
    app.request("/test", { headers: { "x-forwarded-for": "10.9.9.9", "x-test-session": session } });

  it("gives each session on one network its own budget, under a wider cap for the address", async () => {
    const app = sessionApp({ maxRequests: 2, ipMaxRequests: 5, scope: "test-sessions" });
    expect((await hit(app, "a")).status).toBe(200);
    expect((await hit(app, "a")).status).toBe(200);
    expect((await hit(app, "a")).status).toBe(429);

    // A classmate on the same IP is not blocked by "a" spending its budget.
    expect((await hit(app, "b")).status).toBe(200);
    expect((await hit(app, "b")).status).toBe(200);

    // Four landed from this address (a's third was refused); one more fills it.
    expect((await hit(app, "c")).status).toBe(200);
    const capped = await hit(app, "d");
    expect(capped.status).toBe(429);
  });
});
