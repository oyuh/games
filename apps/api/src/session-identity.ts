import { createHmac, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE_NAME = "games_session";
export const ZERO_SESSION_PROOF_HEADER = "x-zero-session-proof";
export const MAX_SESSION_ID_LEN = 64;
export const MAX_SESSION_NAME_LEN = 30;

export type SessionIdentityCandidate = {
  id: string;
  name: string | null;
  fingerprint: string | null;
  lastSeen: number;
};

export type SessionResolutionSource = "cookie" | "claimed" | "fingerprint" | "created";

export type SessionResolutionInput = {
  cookieSessionId: string | null;
  claimedSessionId: unknown;
  claimedName: unknown;
  fingerprint: string;
  cookieSession: SessionIdentityCandidate | null;
  claimedSession: SessionIdentityCandidate | null;
  fingerprintSession: SessionIdentityCandidate | null;
  forcedName?: string | null;
  allowCreate: boolean;
  newSessionId: string;
};

export type SessionResolutionDecision = {
  sessionId: string;
  canonicalName: string | null;
  shouldCreate: boolean;
  shouldResetSession: boolean;
  shouldResetName: boolean;
  source: SessionResolutionSource;
};

type SessionSignaturePurpose = "cookie" | "proof";

function getSignature(sessionId: string, secret: string, purpose: SessionSignaturePurpose) {
  return createHmac("sha256", secret).update(`${purpose}:${sessionId}`).digest();
}

export function normalizeSessionId(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > MAX_SESSION_ID_LEN) {
    return "";
  }
  return trimmed;
}

export function sanitizeSessionName(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const sanitized = value
    .trim()
    .replace(/<[^>]+>/g, "")
    .replace(/\s/g, "")
    .slice(0, MAX_SESSION_NAME_LEN);

  return sanitized || null;
}

export function createSignedSessionCookieValue(sessionId: string, secret: string): string {
  const normalizedId = normalizeSessionId(sessionId);
  if (!normalizedId) {
    return "";
  }
  const signature = getSignature(normalizedId, secret, "cookie").toString("base64url");
  return `${normalizedId}.${signature}`;
}

export function createSignedSessionProofValue(sessionId: string, secret: string): string {
  const normalizedId = normalizeSessionId(sessionId);
  if (!normalizedId) {
    return "";
  }
  const signature = getSignature(normalizedId, secret, "proof").toString("base64url");
  return `${normalizedId}.${signature}`;
}

function parseCookieHeader(cookieHeader: string | undefined) {
  const cookies = new Map<string, string>();
  if (!cookieHeader) {
    return cookies;
  }

  for (const chunk of cookieHeader.split(";")) {
    const [rawName, ...rawValue] = chunk.split("=");
    const name = rawName?.trim();
    if (!name) {
      continue;
    }
    cookies.set(name, rawValue.join("=").trim());
  }

  return cookies;
}

function readSignedValue(rawValue: string | undefined, secret: string, purpose: SessionSignaturePurpose): string | null {
  if (!rawValue) {
    return null;
  }

  let decoded = rawValue;
  try {
    decoded = decodeURIComponent(rawValue);
  } catch {
    decoded = rawValue;
  }

  const splitIndex = decoded.lastIndexOf(".");
  if (splitIndex <= 0) {
    return null;
  }

  const normalizedId = normalizeSessionId(decoded.slice(0, splitIndex));
  const rawSignature = decoded.slice(splitIndex + 1);
  if (!normalizedId || !rawSignature) {
    return null;
  }

  let providedSignature: Buffer;
  try {
    providedSignature = Buffer.from(rawSignature, "base64url");
  } catch {
    return null;
  }

  const expectedSignature = getSignature(normalizedId, secret, purpose);
  if (providedSignature.length !== expectedSignature.length) {
    return null;
  }
  if (!timingSafeEqual(providedSignature, expectedSignature)) {
    return null;
  }

  return normalizedId;
}

export function readSignedSessionCookie(cookieHeader: string | undefined, secret: string): string | null {
  return readSignedValue(parseCookieHeader(cookieHeader).get(SESSION_COOKIE_NAME), secret, "cookie");
}

export function readSignedSessionProof(proofHeader: string | undefined, secret: string): string | null {
  return readSignedValue(proofHeader, secret, "proof");
}

export function serializeSessionCookie(cookieValue: string, secure: boolean): string {
  const base = `${SESSION_COOKIE_NAME}=${encodeURIComponent(cookieValue)}; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax`;
  return secure ? `${base}; Secure` : base;
}

export function shouldUseSecureCookie(forwardedProto: string | undefined, origin: string | undefined): boolean {
  const normalizedProto = forwardedProto?.split(",")[0]?.trim().toLowerCase();
  if (normalizedProto === "https") {
    return true;
  }
  return Boolean(origin?.startsWith("https://"));
}

export function chooseCanonicalSession(input: SessionResolutionInput): SessionResolutionDecision | null {
  const claimedSessionId = normalizeSessionId(input.claimedSessionId);
  const claimedName = sanitizeSessionName(input.claimedName);
  const claimedNameWasProvided = input.claimedName !== undefined;
  const forcedName = sanitizeSessionName(input.forcedName ?? null);

  let sessionId = "";
  let source: SessionResolutionSource | null = null;
  let existingName: string | null = null;

  if (input.cookieSessionId && input.cookieSession?.id === input.cookieSessionId) {
    sessionId = input.cookieSession.id;
    existingName = input.cookieSession.name;
    source = "cookie";
  } else if (
    claimedSessionId &&
    input.claimedSession?.id === claimedSessionId &&
    (!input.claimedSession.fingerprint || input.claimedSession.fingerprint === input.fingerprint)
  ) {
    sessionId = input.claimedSession.id;
    existingName = input.claimedSession.name;
    source = "claimed";
  } else if (input.fingerprintSession) {
    sessionId = input.fingerprintSession.id;
    existingName = input.fingerprintSession.name;
    source = "fingerprint";
  } else if (input.allowCreate) {
    const safeCreatedId = input.claimedSession
      ? normalizeSessionId(input.newSessionId)
      : claimedSessionId || normalizeSessionId(input.newSessionId);
    if (!safeCreatedId) {
      return null;
    }
    sessionId = safeCreatedId;
    existingName = null;
    source = "created";
  }

  if (!sessionId || !source) {
    return null;
  }

  const canonicalName = forcedName ?? existingName ?? claimedName ?? null;

  return {
    sessionId,
    canonicalName,
    shouldCreate: source === "created",
    shouldResetSession: sessionId !== claimedSessionId,
    shouldResetName: claimedNameWasProvided && canonicalName !== claimedName,
    source,
  };
}
