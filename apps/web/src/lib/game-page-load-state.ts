import { useEffect, useState } from "react";

const DEFAULT_CREATE_GRACE_MS = 12_000;
const DEFAULT_LOOKUP_GRACE_MS = 4_000;

export const PENDING_GAME_NAV_STATE = { pendingGameCreate: true } as const;

export function hasPendingGameCreate(locationState: unknown) {
  if (!locationState || typeof locationState !== "object") {
    return false;
  }
  return Boolean((locationState as { pendingGameCreate?: boolean }).pendingGameCreate);
}

export function getPendingGameMessage(pendingCreate: boolean, zeroConnected: boolean, syncCountdown: number | null) {
  if (!zeroConnected) {
    return `Sync server is waking${syncCountdown != null ? ` (~${syncCountdown}s)` : ""}.`;
  }
  return pendingCreate
    ? "Waiting for your new lobby to appear."
    : "Waiting for the live game state to catch up.";
}

export function usePendingGamePageLoad({
  gameFound,
  pendingCreate,
  zeroConnected,
  createGraceMs = DEFAULT_CREATE_GRACE_MS,
  lookupGraceMs = DEFAULT_LOOKUP_GRACE_MS,
}: {
  gameFound: boolean;
  pendingCreate: boolean;
  zeroConnected: boolean;
  createGraceMs?: number;
  lookupGraceMs?: number;
}) {
  const [missingTimedOut, setMissingTimedOut] = useState(false);

  useEffect(() => {
    if (gameFound) {
      setMissingTimedOut(false);
      return;
    }

    const timer = window.setTimeout(
      () => setMissingTimedOut(true),
      pendingCreate || !zeroConnected ? createGraceMs : lookupGraceMs
    );
    return () => window.clearTimeout(timer);
  }, [createGraceMs, gameFound, lookupGraceMs, pendingCreate, zeroConnected]);

  return {
    missingTimedOut,
    waitingForGame: !gameFound && !missingTimedOut,
  };
}

export async function waitForMutationServer<T>(mutation: { client: Promise<unknown>; server: Promise<T> }) {
  const [, result] = await Promise.all([
    mutation.client.catch(() => undefined),
    mutation.server,
  ]);
  return result;
}
