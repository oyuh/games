import { describe, expect, it } from "vitest";

function normalizeAdminProxyPath(path: string | null) {
  if (!path) return null;
  if (!path.startsWith("/")) return null;
  if (path.startsWith("//") || path.includes("://")) return null;
  const segments = path.split("/");
  if (segments.some((segment) => segment === "." || segment === "..")) {
    return null;
  }
  return path;
}

function canSignInWithGithubId(allowedIds: string[], providerAccountId: string | null | undefined) {
  const githubId = providerAccountId?.trim();
  if (!githubId) return false;
  if (allowedIds.length === 0) return false;
  return allowedIds.includes(githubId);
}

describe("admin proxy path normalization", () => {
  it("accepts normal admin paths", () => {
    expect(normalizeAdminProxyPath("/bans")).toBe("/bans");
    expect(normalizeAdminProxyPath("/games/abc123")).toBe("/games/abc123");
  });

  it("rejects traversal and absolute URL tricks", () => {
    expect(normalizeAdminProxyPath("../admin")).toBeNull();
    expect(normalizeAdminProxyPath("/../admin")).toBeNull();
    expect(normalizeAdminProxyPath("/bans/../../secrets")).toBeNull();
    expect(normalizeAdminProxyPath("//evil.example/path")).toBeNull();
    expect(normalizeAdminProxyPath("https://evil.example")).toBeNull();
    expect(normalizeAdminProxyPath("/https://evil.example")).toBeNull();
  });
});

describe("admin GitHub allowlist", () => {
  it("matches immutable provider account ids", () => {
    expect(canSignInWithGithubId(["12345"], "12345")).toBe(true);
    expect(canSignInWithGithubId(["12345"], "99999")).toBe(false);
  });

  it("does not depend on mutable usernames", () => {
    const allowedIds = ["12345"];
    expect(canSignInWithGithubId(allowedIds, "12345")).toBe(true);
    expect(canSignInWithGithubId(allowedIds, "renamed-user")).toBe(false);
  });
});
