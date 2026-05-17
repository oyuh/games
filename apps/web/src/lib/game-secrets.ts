import { useCallback, useEffect, useRef, useState } from "react";
import { decryptSecret, isEncrypted } from "@games/shared";
import { getSessionRequestHeaders } from "./session";

const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

interface UseGameSecretOptions {
  gameType: "imposter" | "password" | "chain_reaction" | "shade_signal" | "location_signal";
  gameId: string;
  sessionId: string;
  /** Enable fetching — set to false until the game is in a phase where secrets are needed. */
  enabled?: boolean;
}

interface UseGameSecretResult {
  /** True while the key is being fetched. */
  loading: boolean;
  /** Non-null if key fetch failed or caller is not authorized (e.g. imposter player). */
  error: string | null;
  /** Viewer-specific role metadata returned by the API. */
  myRole: string | null;
  /** Viewer-specific scopes returned by the API. */
  scopes: string[];
  /**
   * Decrypts an "enc:<...>" ciphertext string.
   * Returns the original plaintext if the string is not encrypted.
   * Returns null if the key is not yet loaded.
   */
  decryptValue: (value: string | null | undefined) => Promise<string | null>;
}

/**
 * React hook that fetches a game's decryption key from the server
 * and exposes a `decryptValue` function for decrypting Zero-synced encrypted fields.
 *
 * Usage:
 *   const { decryptValue, loading } = useGameSecret({ gameType: "imposter", gameId, sessionId });
 *   const word = await decryptValue(game.secret_word); // returns plaintext
 *
 * The key is only fetched once per mount and cached in memory.
 * Authorized players (e.g. non-imposters in Imposter) get the key; others get a 403.
 */
export function useGameSecret({ gameType, gameId, sessionId, enabled = true }: UseGameSecretOptions): UseGameSecretResult {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [myRole, setMyRole] = useState<string | null>(null);
  const [scopes, setScopes] = useState<string[]>([]);
  const keyRef = useRef<string | null>(null);
  const fetchedRef = useRef(false);
  const keyFetchPromiseRef = useRef<Promise<string | null> | null>(null);

  useEffect(() => {
    keyRef.current = null;
    fetchedRef.current = false;
    keyFetchPromiseRef.current = null;
    setError(null);
    setLoading(false);
    setMyRole(null);
    setScopes([]);
  }, [gameType, gameId, sessionId]);

  useEffect(() => {
    if (!enabled || !gameId || !sessionId || fetchedRef.current) return;
    fetchedRef.current = true;
    setLoading(true);

    const keyFetchPromise = fetch(`${API_BASE}/api/game-secret/key`, {
      method: "POST",
      credentials: "include",
      headers: getSessionRequestHeaders(sessionId, {
        "Content-Type": "application/json"
      }),
      body: JSON.stringify({ gameType, gameId, sessionId })
    })
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({})) as { error?: string };
          throw new Error(body.error ?? `HTTP ${res.status}`);
        }
        const data = await res.json() as { key?: string | null; myRole?: string | null; scopes?: string[] };
        keyRef.current = typeof data.key === "string" ? data.key : null;
        setMyRole(data.myRole ?? null);
        setScopes(Array.isArray(data.scopes) ? data.scopes : []);
        return keyRef.current;
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : String(err));
        return null;
      })
      .finally(() => setLoading(false));

    keyFetchPromiseRef.current = keyFetchPromise;
  }, [enabled, gameType, gameId, sessionId]);

  const decryptValue = useCallback(async (value: string | null | undefined): Promise<string | null> => {
    if (!value) return null;
    if (!isEncrypted(value)) return value; // plaintext passthrough
    if (!keyRef.current && keyFetchPromiseRef.current) {
      await keyFetchPromiseRef.current;
    }
    if (!keyRef.current) return null;
    try {
      return await decryptSecret(value, keyRef.current);
    } catch {
      return null;
    }
  }, []);

  return { loading, error, myRole, scopes, decryptValue };
}

/**
 * Calls the server to encrypt the current game secret and overwrite it in Zero.
 * Uses the same key across rounds so the client hook only needs to fetch once.
 * Idempotent — safe to call multiple times.
 */
export async function callGameSecretInit(
  gameType: "imposter" | "shade_signal" | "location_signal",
  gameId: string,
  sessionId: string
): Promise<void> {
  try {
    const res = await fetch(`${API_BASE}/api/game-secret/init`, {
      method: "POST",
      credentials: "include",
      headers: getSessionRequestHeaders(sessionId, { "Content-Type": "application/json" }),
      body: JSON.stringify({ gameId, gameType, sessionId })
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as { error?: string };
      console.warn("[game-secret/init]", body.error ?? `HTTP ${res.status}`);
    }
  } catch (e) {
    console.warn("[game-secret/init failed]", e);
  }
}

