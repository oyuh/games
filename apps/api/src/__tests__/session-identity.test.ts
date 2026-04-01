import { describe, expect, it } from "vitest";
import {
  chooseCanonicalSession,
  createSignedSessionCookieValue,
  createSignedSessionProofValue,
  normalizeSessionId,
  readSignedSessionCookie,
  readSignedSessionProof,
  sanitizeSessionName,
  SESSION_COOKIE_NAME,
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
});
