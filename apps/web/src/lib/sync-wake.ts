import { useSyncExternalStore, useEffect, useState } from "react";

/**
 * Estimated cold-start time in seconds.
 * Slightly overestimated so it feels fast when the server comes up earlier.
 */
const ESTIMATE_SECS = import.meta.env.DEV ? 35 : 25;
const UNAVAILABLE_AFTER_MS = 25_000;

let connectingStartedAt: number | null = null;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

export function markSyncConnecting() {
  if (connectingStartedAt === null) {
    connectingStartedAt = Date.now();
    emit();
  }
}

export function markSyncConnected() {
  connectingStartedAt = null;
  emit();
}

export function useSyncCountdown(): number | null {
  const startedAt = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
    () => connectingStartedAt,
  );

  const [remaining, setRemaining] = useState<number | null>(() => {
    if (startedAt === null) return null;
    const elapsed = (Date.now() - startedAt) / 1000;
    return Math.max(1, Math.ceil(ESTIMATE_SECS - elapsed));
  });

  useEffect(() => {
    if (startedAt === null) {
      setRemaining(null);
      return;
    }
    const update = () => {
      const elapsed = (Date.now() - startedAt) / 1000;
      const left = Math.max(1, Math.ceil(ESTIMATE_SECS - elapsed));
      setRemaining(left);
    };
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [startedAt]);

  return remaining;
}

export function useSyncTimedOut(): boolean {
  const startedAt = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
    () => connectingStartedAt,
  );

  const [timedOut, setTimedOut] = useState(() => {
    return startedAt !== null && Date.now() - startedAt >= UNAVAILABLE_AFTER_MS;
  });

  useEffect(() => {
    if (startedAt === null) {
      setTimedOut(false);
      return;
    }

    const update = () => {
      setTimedOut(Date.now() - startedAt >= UNAVAILABLE_AFTER_MS);
    };

    update();
    const timer = window.setInterval(update, 500);
    return () => window.clearInterval(timer);
  }, [startedAt]);

  return timedOut;
}
