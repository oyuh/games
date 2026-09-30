import { useSyncExternalStore } from "react";
import { getSessionRequestHeaders } from "./session";

/**
 * Client half of the bot check. The API decides when a session is in limbo
 * (apps/api/src/bot-score.ts) and says so over the realtime socket, in a 403
 * on a gated request, or from the status endpoint. This module only holds that
 * one flag and lets gated requests wait for it to clear.
 */

const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:3001";
const CHALLENGE_REQUIRED = "CHALLENGE_REQUIRED";

export type ChallengeStatus = { score: number; limbo: boolean };

/**
 * Cloudflare's published test site keys. The dev API's default test secret
 * accepts the dummy token every one of them hands out.
 */
export const TURNSTILE_TEST_SITE_KEYS = {
  pass: "1x00000000000000000000AA",
  interactive: "3x00000000000000000000FF",
  fail: "2x00000000000000000000AB",
} as const;

export type TurnstileTestMode = keyof typeof TURNSTILE_TEST_SITE_KEYS;

const DEV_SITE_KEY_STORAGE = "turnstile-test-mode";

export function getTurnstileTestMode(): TurnstileTestMode {
  const saved = localStorage.getItem(DEV_SITE_KEY_STORAGE);
  return saved === "interactive" || saved === "fail" ? saved : "pass";
}

export function setTurnstileTestMode(mode: TurnstileTestMode) {
  localStorage.setItem(DEV_SITE_KEY_STORAGE, mode);
}

/** Empty when production has no key; the modal then says to wait it out. */
export function turnstileSiteKey(): string {
  const configured = import.meta.env.VITE_TURNSTILE_SITE_KEY?.trim();
  if (configured) return configured;
  return import.meta.env.DEV ? TURNSTILE_TEST_SITE_KEYS[getTurnstileTestMode()] : "";
}

let required = false;
const listeners = new Set<() => void>();

export function setChallengeRequired(next: boolean) {
  if (required === next) return;
  required = next;
  listeners.forEach((cb) => cb());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

export function useChallengeRequired() {
  return useSyncExternalStore(subscribe, () => required);
}

function waitForClear() {
  return new Promise<void>((resolve) => {
    const off = subscribe(() => {
      if (!required) {
        off();
        resolve();
      }
    });
  });
}

/**
 * fetch for the routes the API gates. A 403 that says the check is required
 * raises the modal and holds the request until the player passes it, then
 * sends it again, so a finished run's score is never dropped on the floor.
 */
export async function fetchWithChallenge(input: string, init?: RequestInit): Promise<Response> {
  for (;;) {
    const res = await fetch(input, init);
    if (res.status !== 403) return res;
    const body = await res.clone().json().catch(() => null) as { code?: string } | null;
    if (body?.code !== CHALLENGE_REQUIRED) return res;
    setChallengeRequired(true);
    await waitForClear();
  }
}

async function challengeRequest(path: string, body?: unknown): Promise<ChallengeStatus & { ok?: boolean; errors?: string[] }> {
  const res = await fetch(`${API_BASE}/api/challenge/${path}`, {
    method: body === undefined ? "GET" : "POST",
    credentials: "include",
    headers: getSessionRequestHeaders(undefined, body === undefined ? {} : { "Content-Type": "application/json" }),
    body: body === undefined ? null : JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  if (!data || (!res.ok && !Array.isArray(data.errors))) {
    throw new Error(`Challenge ${path} failed (${res.status})`);
  }
  return data;
}

/** Asks the API to look at the session again; a cooled-off session is let out. */
export async function refreshChallengeStatus() {
  const status = await challengeRequest("status");
  setChallengeRequired(status.limbo);
  return status;
}

export async function submitChallengeToken(token: string) {
  const result = await challengeRequest("verify", { token });
  if (result.ok) setChallengeRequired(false);
  return result;
}

/** Dev only: the API refuses this route outside development. */
export async function setDevBotScore(score: number) {
  const status = await challengeRequest("dev", { score });
  setChallengeRequired(status.limbo);
  return status;
}
