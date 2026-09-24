import { describe, expect, it } from "vitest";
import {
  chooseCanonicalSession,
  createSignedSessionCookieValue,
  createSignedSessionProofValue,
  normalizeSessionId,
  readBearerToken,
  readSignedSessionCookie,
  readSignedSessionProof,
  sanitizeSessionName,
  SESSION_COOKIE_NAME,
  verifyClaimedSessionId,
} from "../session-identity";

describe("session identity helpers", () => {
  it("normalizes session ids", () => {
    expect(normalizeSessionId("  abc123  ")).toBe("abc123");
    expect(normalizeSessionId(42)).toBe("");
  });

  it("sanitizes session names consistently", () => {
    expect(sanitizeSessionName("  <b>Test Player</b>  ")).toBe("TestPlayer");
    expect(sanitizeSessionName("    ")).toBeNull();
  });

  it("round-trips a signed session cookie", () => {
    const secret = "cookie-secret";
    const cookieValue = createSignedSessionCookieValue("session-1", secret);
    const cookieHeader = `${SESSION_COOKIE_NAME}=${encodeURIComponent(cookieValue)}`;
    expect(readSignedSessionCookie(cookieHeader, secret)).toBe("session-1");
  });

  it("rejects tampered session cookies", () => {
    const secret = "cookie-secret";
    const cookieValue = createSignedSessionCookieValue("session-1", secret);
    const cookieHeader = `${SESSION_COOKIE_NAME}=${encodeURIComponent(`${cookieValue}tampered`)}`;
    expect(readSignedSessionCookie(cookieHeader, secret)).toBeNull();
  });

  it("round-trips a signed Zero session proof", () => {
    const secret = "proof-secret";
    const proof = createSignedSessionProofValue("session-2", secret);
    expect(readSignedSessionProof(proof, secret)).toBe("session-2");
  });

  it("extracts bearer tokens for Zero auth transport", () => {
    expect(readBearerToken("Bearer signed-proof-token")).toBe("signed-proof-token");
    expect(readBearerToken("bearer signed-proof-token")).toBe("signed-proof-token");
    expect(readBearerToken("Basic abc123")).toBeNull();
  });

  it("rejects tampered Zero session proofs", () => {
    const secret = "proof-secret";
    const proof = createSignedSessionProofValue("session-2", secret);
    expect(readSignedSessionProof(`${proof}tampered`, secret)).toBeNull();
  });

  it("prefers the signed cookie session over a tampered claimed id", () => {
    const decision = chooseCanonicalSession({
      cookieSessionId: "real-session",
      claimedSessionId: "fake-session",
      claimedName: "PlayerOne",
      fingerprint: "fp-1",
      cookieSession: { id: "real-session", name: "PlayerOne", fingerprint: "fp-1", lastSeen: 10 },
      claimedSession: { id: "fake-session", name: "Fake", fingerprint: "fp-2", lastSeen: 10 },
      fingerprintSession: { id: "real-session", name: "PlayerOne", fingerprint: "fp-1", lastSeen: 10 },
      allowCreate: true,
      newSessionId: "new-session",
    });

    expect(decision).toMatchObject({
      sessionId: "real-session",
      source: "cookie",
      shouldResetSession: true,
    });
  });

  it("falls back to the fingerprint session when the claimed id drifts", () => {
    const decision = chooseCanonicalSession({
      cookieSessionId: null,
      claimedSessionId: "fake-session",
      claimedName: "PlayerOne",
      fingerprint: "fp-1",
      cookieSession: null,
      claimedSession: { id: "fake-session", name: "Fake", fingerprint: "fp-2", lastSeen: 10 },
      fingerprintSession: { id: "real-session", name: "PlayerOne", fingerprint: "fp-1", lastSeen: 20 },
      allowCreate: true,
      newSessionId: "new-session",
    });

    expect(decision).toMatchObject({
      sessionId: "real-session",
      source: "fingerprint",
      shouldResetSession: true,
    });
  });

  it("keeps a brand-new claimed id over an older session on the same device", () => {
    // The client made this id up and used it offline before the API woke.
    const decision = chooseCanonicalSession({
      cookieSessionId: null,
      claimedSessionId: "offline-session",
      claimedName: "PlayerOne",
      fingerprint: "fp-1",
      cookieSession: null,
      claimedSession: null,
      fingerprintSession: { id: "older-session", name: "Someone", fingerprint: "fp-1", lastSeen: 20 },
      allowCreate: true,
      newSessionId: "new-session",
    });

    expect(decision).toMatchObject({
      sessionId: "offline-session",
      source: "created",
      shouldCreate: true,
      shouldResetSession: false,
      shouldResetName: false,
    });
  });

  it("still falls back to the device's session when it may not create one", () => {
    const decision = chooseCanonicalSession({
      cookieSessionId: null,
      claimedSessionId: "unknown-session",
      claimedName: "PlayerOne",
      fingerprint: "fp-1",
      cookieSession: null,
      claimedSession: null,
      fingerprintSession: { id: "older-session", name: "Someone", fingerprint: "fp-1", lastSeen: 20 },
      allowCreate: false,
      newSessionId: "new-session",
    });

    expect(decision).toMatchObject({ sessionId: "older-session", source: "fingerprint" });
  });

  it("creates a new random id instead of trusting an occupied foreign id", () => {
    const decision = chooseCanonicalSession({
      cookieSessionId: null,
      claimedSessionId: "occupied-session",
      claimedName: "PlayerOne",
      fingerprint: "fp-1",
      cookieSession: null,
      claimedSession: { id: "occupied-session", name: "Victim", fingerprint: "other-fp", lastSeen: 20 },
      fingerprintSession: null,
      allowCreate: true,
      newSessionId: "replacement-session",
    });

    expect(decision).toMatchObject({
      sessionId: "replacement-session",
      source: "created",
      shouldResetSession: true,
    });
  });

  it("does not force a name reset when the caller omitted claimedName", () => {
    const decision = chooseCanonicalSession({
      cookieSessionId: null,
      claimedSessionId: "real-session",
      claimedName: undefined,
      fingerprint: "fp-1",
      cookieSession: null,
      claimedSession: { id: "real-session", name: "Lawson", fingerprint: "fp-1", lastSeen: 20 },
      fingerprintSession: { id: "real-session", name: "Lawson", fingerprint: "fp-1", lastSeen: 20 },
      allowCreate: false,
      newSessionId: "new-session",
    });

    expect(decision).toMatchObject({
      sessionId: "real-session",
      shouldResetSession: false,
      shouldResetName: false,
      source: "claimed",
    });
  });
});

describe("verifyClaimedSessionId in production", () => {
  it("accepts a claim that matches the signed proof", () => {
    expect(verifyClaimedSessionId("me", "me", "me", true)).toBe("me");
  });

  it("rejects a header with no proof behind it", () => {
    expect(verifyClaimedSessionId("victim", null, "victim", true)).toBeNull();
  });

  it("rejects a header that disagrees with the proof", () => {
    expect(verifyClaimedSessionId("victim", "me", "me", true)).toBeNull();
  });

  it("rejects a claimed session that is not the proven one", () => {
    expect(verifyClaimedSessionId("me", "me", "victim", true)).toBeNull();
  });

  it("falls back to the proof when nothing is claimed", () => {
    expect(verifyClaimedSessionId("anon", "me", undefined, true)).toBe("me");
  });
});

describe("verifyClaimedSessionId in dev", () => {
  it("trusts the claimed id without a proof", () => {
    expect(verifyClaimedSessionId("anon", null, "anyone", false)).toBe("anyone");
  });
});
