import { useEffect, useState } from "react";

const DEFAULT_CREATE_GRACE_MS = 12_000;
const DEFAULT_LOOKUP_GRACE_MS = 4_000;

export const PENDING_GAME_CREATE_NAV_STATE = { pendingGameCreate: true } as const;
export const PENDING_GAME_JOIN_NAV_STATE = { pendingGameJoin: true } as const;
export const PENDING_GAME_NAV_STATE = PENDING_GAME_CREATE_NAV_STATE;

export function hasPendingGameCreate(locationState: unknown) {
  if (!locationState || typeof locationState !== "object") {
    return false;
  }
  return Boolean((locationState as { pendingGameCreate?: boolean }).pendingGameCreate);
}

export function hasPendingGameJoin(locationState: unknown) {
  if (!locationState || typeof locationState !== "object") {
    return false;
  }
  return Boolean((locationState as { pendingGameJoin?: boolean }).pendingGameJoin);
}

export function getPendingGameTitle(pendingCreate: boolean, pendingJoin: boolean) {
  if (pendingCreate) {
    return "Opening your lobby...";
  }
  if (pendingJoin) {
    return "Joining game...";
  }
  return "Loading game...";
}

export function getPendingGameMessage(
  pendingCreate: boolean,
  zeroConnected: boolean,
  syncCountdown: number | null,
  pendingJoin = false
) {
  if (!zeroConnected) {
    return `Sync server is waking${syncCountdown != null ? ` (~${syncCountdown}s)` : ""}.`;
  }
  if (pendingJoin) {
    return "Waiting for your joined game to appear.";
  }
  return pendingCreate
    ? "Waiting for your new lobby to appear."
    : "Waiting for the live game state to catch up.";
}

export function getPendingGameLoadTimeoutMs({
  pendingCreate,
  pendingJoin = false,
  zeroConnected,
  createGraceMs = DEFAULT_CREATE_GRACE_MS,
  lookupGraceMs = DEFAULT_LOOKUP_GRACE_MS,
}: {
  pendingCreate: boolean;
  pendingJoin?: boolean;
  zeroConnected: boolean;
  createGraceMs?: number;
  lookupGraceMs?: number;
}) {
  return pendingCreate || pendingJoin || !zeroConnected ? createGraceMs : lookupGraceMs;
}

export function usePendingGamePageLoad({
  gameFound,
  pendingCreate,
  pendingJoin = false,
  zeroConnected,
  createGraceMs = DEFAULT_CREATE_GRACE_MS,
  lookupGraceMs = DEFAULT_LOOKUP_GRACE_MS,
}: {
  gameFound: boolean;
  pendingCreate: boolean;
  pendingJoin?: boolean;
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
      getPendingGameLoadTimeoutMs({ pendingCreate, pendingJoin, zeroConnected, createGraceMs, lookupGraceMs })
    );
    return () => window.clearTimeout(timer);
  }, [createGraceMs, gameFound, lookupGraceMs, pendingCreate, pendingJoin, zeroConnected]);

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
