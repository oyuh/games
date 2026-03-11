import { useEffect, useState } from "react";
import type { ConnectionState } from "@rocicorp/zero";

type DebugLevel = "info" | "warn" | "error";

export type ConnectionDebugEvent = {
  id: number;
  at: string;
  level: DebugLevel;
  source: string;
  message: string;
  details?: string;
};

export type ConnectionDebugState = {
  bootedAt: string;
  sessionId: string;
  zeroCacheURL: string;
  apiBaseURL: string;
  apiInfoURL: string;
  location: string;
  isOnline: boolean;
  zeroState: string;
  zeroReason: string;
  presenceState: string;
  presenceReason: string;
  apiMetaState: "idle" | "loading" | "ok" | "error";
  apiMetaReason: string;
  apiMetaCheckedAt: string;
  apiLatencyMs: number | null;
  dbState: "idle" | "loading" | "ok" | "unknown" | "offline";
  dbReason: string;
  dbCheckedAt: string;
  dbKey: string;
  dbExpectedValue: string;
  dbActualValue: string;
  apiCommitSha: string;
  apiCommitRef: string;
  apiCommitMessage: string;
  apiCommitTimestamp: string;
  apiBuildTimestamp: string;
  apiUpdatedAt: string;
  apiStartedAt: string;
  apiUptimeMs: number | null;
  apiPlatform: string;
  presenceConnectLatencyMs: number | null;
  events: ConnectionDebugEvent[];
};

const MAX_EVENTS = 40;

const state: ConnectionDebugState = {
  bootedAt: new Date().toISOString(),
  sessionId: "",
  zeroCacheURL: "",
  apiBaseURL: "",
  apiInfoURL: "",
  location: typeof window !== "undefined" ? window.location.href : "",
  isOnline: typeof navigator !== "undefined" ? navigator.onLine : true,
  zeroState: "unknown",
  zeroReason: "",
  presenceState: "unknown",
  presenceReason: "",
  apiMetaState: "idle",
  apiMetaReason: "",
  apiMetaCheckedAt: "",
  apiLatencyMs: null,
  dbState: "idle",
  dbReason: "",
  dbCheckedAt: "",
  dbKey: "",
  dbExpectedValue: "",
  dbActualValue: "",
  apiCommitSha: "",
  apiCommitRef: "",
  apiCommitMessage: "",
  apiCommitTimestamp: "",
  apiBuildTimestamp: "",
  apiUpdatedAt: "",
  apiStartedAt: "",
  apiUptimeMs: null,
  apiPlatform: "",
  presenceConnectLatencyMs: null,
  events: []
};

const listeners = new Set<() => void>();
let eventId = 0;
let globalCaptureStarted = false;
let lastZeroSignature = "";

function emit() {
  listeners.forEach((listener) => listener());
}

function stringifyReason(reason: unknown) {
  if (!reason) {
    return "";
  }
  if (typeof reason === "string") {
    return reason;
  }
  if (reason instanceof Error) {
    return reason.message;
  }

  try {
    return JSON.stringify(reason);
  } catch {
    return String(reason);
  }
}

export function getConnectionDebugState() {
  return state;
}

export function subscribeConnectionDebug(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function addConnectionDebugEvent(event: {
  level: DebugLevel;
  source: string;
  message: string;
  details?: string;
}) {
  const nextEvent: ConnectionDebugEvent = {
    id: ++eventId,
    at: new Date().toISOString(),
    level: event.level,
    source: event.source,
    message: event.message,
    ...(event.details ? { details: event.details } : {})
  };

  state.events = [
    nextEvent,
    ...state.events
  ].slice(0, MAX_EVENTS);

  emit();
}

export function initConnectionDebug(config: {
  sessionId: string;
  zeroCacheURL: string;
  apiBaseURL: string;
  apiInfoURL: string;
}) {
  state.sessionId = config.sessionId;
  state.zeroCacheURL = config.zeroCacheURL;
  state.apiBaseURL = config.apiBaseURL;
  state.apiInfoURL = config.apiInfoURL;
  state.location = typeof window !== "undefined" ? window.location.href : state.location;
  state.isOnline = typeof navigator !== "undefined" ? navigator.onLine : state.isOnline;
  emit();
}

export function setApiConnectionProbe(next: {
  state: ConnectionDebugState["apiMetaState"];
  reason?: string;
  latencyMs?: number;
  checkedAt?: string;
}) {
  state.apiMetaState = next.state;
  state.apiMetaReason = next.reason ?? "";

  if (typeof next.latencyMs === "number") {
    state.apiLatencyMs = next.latencyMs;
  }

  if (next.checkedAt) {
    state.apiMetaCheckedAt = next.checkedAt;
  }

  emit();
}

export function setDatabaseStatusProbe(next: {
  state: ConnectionDebugState["dbState"];
  reason?: string;
  checkedAt?: string;
  key?: string;
  expectedValue?: string;
  actualValue?: string;
}) {
  state.dbState = next.state;
  state.dbReason = next.reason ?? "";
  state.dbCheckedAt = next.checkedAt ?? state.dbCheckedAt;
  state.dbKey = next.key ?? state.dbKey;
  state.dbExpectedValue = next.expectedValue ?? state.dbExpectedValue;
  state.dbActualValue = next.actualValue ?? state.dbActualValue;
  emit();
}

export function setApiBuildInfo(next: {
  platform: string | undefined;
  commitSha: string | undefined;
  commitRef: string | undefined;
  commitMessage: string | undefined;
  commitTimestamp: string | undefined;
  buildTimestamp: string | undefined;
  updatedAt: string | undefined;
  startedAt: string | undefined;
  uptimeMs: number | undefined;
}) {
  state.apiPlatform = next.platform ?? "";
  state.apiCommitSha = next.commitSha ?? "";
  state.apiCommitRef = next.commitRef ?? "";
  state.apiCommitMessage = next.commitMessage ?? "";
  state.apiCommitTimestamp = next.commitTimestamp ?? "";
  state.apiBuildTimestamp = next.buildTimestamp ?? "";
  state.apiUpdatedAt = next.updatedAt ?? "";
  state.apiStartedAt = next.startedAt ?? "";
  state.apiUptimeMs = typeof next.uptimeMs === "number" ? next.uptimeMs : null;
  emit();
}

export function setPresenceConnectLatency(latencyMs: number) {
  state.presenceConnectLatencyMs = latencyMs;
  emit();
}

export function setZeroConnectionState(nextState: ConnectionState) {
  const reason = "reason" in nextState ? stringifyReason(nextState.reason) : "";
  const signature = `${nextState.name}:${reason}`;

  state.zeroState = nextState.name;
  state.zeroReason = reason;

  if (signature !== lastZeroSignature) {
    lastZeroSignature = signature;
    const nextEvent: {
      level: DebugLevel;
      source: string;
      message: string;
      details?: string;
    } = {
      level:
        nextState.name === "connected"
          ? "info"
          : nextState.name === "error" || nextState.name === "needs-auth"
            ? "error"
            : "warn",
      source: "zero",
      message: `state: ${nextState.name}`
    };

    if (reason) {
      nextEvent.details = reason;
    }

    addConnectionDebugEvent(nextEvent);
  } else {
    emit();
  }
}

export function setPresenceConnectionState(next: { state: string; reason?: string }) {
  state.presenceState = next.state;
  state.presenceReason = next.reason ?? "";
  emit();
}

export function setBrowserOnlineState(isOnline: boolean) {
  state.isOnline = isOnline;
  addConnectionDebugEvent({
    level: isOnline ? "info" : "warn",
    source: "browser",
    message: isOnline ? "online" : "offline"
  });
}

export function startGlobalConnectionDebugCapture() {
  if (globalCaptureStarted || typeof window === "undefined") {
    return () => {};
  }

  globalCaptureStarted = true;

  const onOnline = () => setBrowserOnlineState(true);
  const onOffline = () => setBrowserOnlineState(false);

  const onError = (event: ErrorEvent) => {
    const nextEvent: {
      level: DebugLevel;
      source: string;
      message: string;
      details?: string;
    } = {
      level: "error",
      source: "window.error",
      message: event.message || "Runtime error"
    };

    if (event.filename) {
      nextEvent.details = `${event.filename}:${event.lineno}`;
    }

    addConnectionDebugEvent({
      ...nextEvent
    });
  };

  const onUnhandledRejection = (event: PromiseRejectionEvent) => {
    addConnectionDebugEvent({
      level: "error",
      source: "window.unhandledrejection",
      message: "Unhandled promise rejection",
      details: stringifyReason(event.reason)
    });
  };

  window.addEventListener("online", onOnline);
  window.addEventListener("offline", onOffline);
  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onUnhandledRejection);

  return () => {
    globalCaptureStarted = false;
    window.removeEventListener("online", onOnline);
    window.removeEventListener("offline", onOffline);
    window.removeEventListener("error", onError);
    window.removeEventListener("unhandledrejection", onUnhandledRejection);
  };
}

/**
 * React hook — subscribe to the debug state.
 * Returns a fresh snapshot; re-renders whenever the state is mutated.
 */
export function useConnectionDebug() {
  const [snap, setSnap] = useState<ConnectionDebugState>(() => ({ ...getConnectionDebugState() }));
  useEffect(() => {
    const unsub = subscribeConnectionDebug(() => {
      setSnap({ ...getConnectionDebugState() });
    });
    return () => { unsub(); };
  }, []);
  return snap;
}
