import { useCallback, useEffect, useRef, useState } from "react";
import { decryptSecret, isEncrypted } from "@games/shared";
import { getSessionRequestHeaders } from "./session";

const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

interface UseGameSecretOptions {
  gameType: "imposter" | "password" | "chain_reaction" | "shade_signal" | "location_signal";
  gameId: string;
  sessionId: string;
  /** Enable fetching; set to false until the game is in a phase where secrets are needed. */
  enabled?: boolean;
  /**
   * Changing this starts the attempts over. Pass the phase: who is allowed the
   * key depends on it, so a refusal during one phase says nothing about the
   * next. The imposter is turned away all through the round and then handed
   * the key at the reveal.
   */
  resetOn?: string | number;
}

/* The server decides from the row in the database, and the client asks the
   moment its own optimistic copy says the round has started, which is a beat
   earlier. So the first ask can be refused for a game that is, a blink later,
   perfectly happy to answer. One shot and a shrug left the whole room staring
   at four dots for the rest of the round. */
const RETRY_MS = 1500;
const MAX_TRIES = 6;

interface UseGameSecretResult {
  /** True while the key is being fetched. */
  loading: boolean;
  /** Non-null if key fetch failed or caller is not authorized (e.g. imposter player). */
  error: string | null;
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
export function useGameSecret({ gameType, gameId, sessionId, enabled = true, resetOn }: UseGameSecretOptions): UseGameSecretResult {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /* The key is state as well as a ref. Callers decrypt inside an effect keyed
     on decryptValue, so the arriving key has to change its identity or nothing
     re-runs and the value they already gave up on stays given up on. */
  const [key, setKey] = useState<string | null>(null);
  const keyRef = useRef<string | null>(null);
  const triesRef = useRef(0);
  const keyFetchPromiseRef = useRef<Promise<string | null> | null>(null);

  const reset = () => {
    keyRef.current = null;
    triesRef.current = 0;
    keyFetchPromiseRef.current = null;
    setKey(null);
    setError(null);
    setLoading(false);
  };

  useEffect(reset, [gameType, gameId, sessionId]);

  /* Not a full reset: a key that already works keeps working across phases,
     and only the attempt budget goes back on the table. */
  useEffect(() => {
    triesRef.current = 0;
  }, [resetOn]);

  useEffect(() => {
    if (!enabled || !gameId || !sessionId || key) return;

    let cancelled = false;

    const attempt = (): Promise<string | null> => {
      triesRef.current += 1;
      setLoading(true);

      const promise = fetch(`${API_BASE}/api/game-secret/key`, {
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
          const data = await res.json() as { key: string };
          keyRef.current = data.key;
          if (!cancelled) {
            setKey(data.key);
            setError(null);
          }
          return data.key;
        })
        .catch((err: unknown) => {
          if (!cancelled) setError(err instanceof Error ? err.message : String(err));
          return null;
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });

      keyFetchPromiseRef.current = promise;
      return promise;
    };

    void attempt();

    /* Keep asking, but not forever. Some refusals are the honest answer for
       this phase: the imposter is not supposed to have the word, and pestering
       the server about it every second and a half all round is rude. */
    const timer = setInterval(() => {
      if (cancelled || keyRef.current || triesRef.current >= MAX_TRIES) return;
      void attempt();
    }, RETRY_MS);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [enabled, gameType, gameId, sessionId, key, resetOn]);

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
  }, [key]);

  return { loading, error, decryptValue };
}

/**
 * Calls the server to encrypt the current game secret and overwrite it in Zero.
 * Uses the same key across rounds so the client hook only needs to fetch once.
 * Idempotent, so it's safe to call multiple times.
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

/**
 * Calls the server to decrypt the target back to plaintext BEFORE triggering the
 * reveal/scoring mutator. The scoring mutator reads the plaintext target, so this
 * must be called first. Host-only.
 */
export async function callGameSecretPreReveal(
  gameType: "shade_signal" | "location_signal",
  gameId: string,
  sessionId: string
): Promise<void> {
  try {
    const res = await fetch(`${API_BASE}/api/game-secret/pre-reveal`, {
      method: "POST",
      credentials: "include",
      headers: getSessionRequestHeaders(sessionId, { "Content-Type": "application/json" }),
      body: JSON.stringify({ gameId, gameType, sessionId })
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as { error?: string };
      console.warn("[game-secret/pre-reveal]", body.error ?? `HTTP ${res.status}`);
    }
  } catch (e) {
    console.warn("[game-secret/pre-reveal failed]", e);
  }
}
