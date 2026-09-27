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
  apiCommitAdditions: number | null;
  apiCommitDeletions: number | null;
  apiCommitFilesChanged: number | null;
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
  apiCommitAdditions: null,
  apiCommitDeletions: null,
  apiCommitFilesChanged: null,
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
  // Zero hands over { type, reason } objects; the sentence is the useful part.
  if (typeof reason === "object" && "reason" in reason && typeof reason.reason === "string") {
    return reason.reason;
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

function numberOrKeep(value: number | undefined, previous: number | null) {
  return typeof value === "number" && Number.isFinite(value) ? value : previous;
}

export function setApiBuildInfo(next: {
  platform: string | undefined;
  commitSha: string | undefined;
  commitRef: string | undefined;
  commitMessage: string | undefined;
  commitTimestamp: string | undefined;
  commitStats: { additions?: number; deletions?: number; filesChanged?: number } | null | undefined;
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
  // The API answers null until its own GitHub lookup lands, and that arrives a
  // poll later than the rest of the commit. Keep the last real numbers rather
  // than blinking them out from under whoever has the popover open.
  state.apiCommitAdditions = numberOrKeep(next.commitStats?.additions, state.apiCommitAdditions);
  state.apiCommitDeletions = numberOrKeep(next.commitStats?.deletions, state.apiCommitDeletions);
  state.apiCommitFilesChanged = numberOrKeep(next.commitStats?.filesChanged, state.apiCommitFilesChanged);
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

const API_PROBE_TIMEOUT_MS = 8_000;

function describeFetchError(error: unknown) {
  if (error instanceof DOMException && error.name === "TimeoutError") {
    return `No answer after ${API_PROBE_TIMEOUT_MS / 1000}s`;
  }
  // fetch rejects with a bare TypeError for DNS, refused connections and CORS
  // alike, and each browser words it differently.
  if (error instanceof TypeError) {
    return "Couldn't reach it";
  }
  return stringifyReason(error);
}

/**
 * One round trip to build-info, which answers for the API and for the database
 * the API probes. The app polls this and the status page calls it on demand,
 * so both read the same numbers.
 */
export async function probeApiMetadata() {
  if (!state.apiInfoURL) {
    return;
  }

  const started = performance.now();
  // Only the first probe says "loading". Flipping back on every poll made the
  // footer and the wake toast blink "Checking" twice a minute.
  if (state.apiMetaState === "idle") {
    setApiConnectionProbe({ state: "loading" });
  }

  try {
    const response = await fetch(state.apiInfoURL, {
      cache: "no-store",
      signal: AbortSignal.timeout(API_PROBE_TIMEOUT_MS)
    });
    const latencyMs = Math.round(performance.now() - started);

    if (!response.ok) {
      throw new Error(`API answered ${response.status}`);
    }

    const payload = (await response.json()) as {
      platform?: string;
      commitSha?: string;
      commitRef?: string;
      commitMessage?: string;
      commitTimestamp?: string;
      commitStats?: { additions?: number; deletions?: number; filesChanged?: number } | null;
      buildTimestamp?: string;
      updatedAt?: string;
      startedAt?: string;
      uptimeMs?: number;
      database?: {
        state?: "ok" | "unknown" | "offline";
        reason?: string;
        key?: string;
        expectedValue?: string;
        actualValue?: string;
        checkedAt?: string;
      };
    };

    setApiBuildInfo({
      platform: payload.platform,
      commitSha: payload.commitSha,
      commitRef: payload.commitRef,
      commitMessage: payload.commitMessage,
      commitTimestamp: payload.commitTimestamp,
      commitStats: payload.commitStats,
      buildTimestamp: payload.buildTimestamp,
      updatedAt: payload.updatedAt,
      startedAt: payload.startedAt,
      uptimeMs: payload.uptimeMs
    });

    setApiConnectionProbe({ state: "ok", latencyMs, checkedAt: new Date().toISOString() });

    setDatabaseStatusProbe({
      state: payload.database?.state ?? "unknown",
      checkedAt: payload.database?.checkedAt ?? new Date().toISOString(),
      ...(payload.database?.reason ? { reason: payload.database.reason } : {}),
      ...(payload.database?.key ? { key: payload.database.key } : {}),
      ...(payload.database?.expectedValue ? { expectedValue: payload.database.expectedValue } : {}),
      ...(payload.database?.actualValue ? { actualValue: payload.database.actualValue } : {})
    });
  } catch (error) {
    const reason = describeFetchError(error);
    const checkedAt = new Date().toISOString();

    setApiConnectionProbe({
      state: "error",
      reason,
      latencyMs: Math.round(performance.now() - started),
      checkedAt
    });
    setDatabaseStatusProbe({ state: "offline", reason, checkedAt });
    addConnectionDebugEvent({ level: "warn", source: "api", message: "metadata probe failed", details: reason });
  }
}

export type ServiceTone = "loading" | "ok" | "partial" | "err";

/**
 * The one-word verdict the footer and the status page both lead with. Zero is
 * local-first, so a sleeping sync server is "partial", not an outage: the games
 * still play, they just aren't shared yet.
 */
export function overallTone(debug: ConnectionDebugState): ServiceTone {
  if (debug.dbState === "loading" || debug.dbState === "idle") return "loading";
  if (debug.apiMetaState !== "ok" || debug.dbState !== "ok") return "err";
  return debug.zeroState === "connected" ? "ok" : "partial";
}

export function formatUptime(ms: number) {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainMinutes = minutes % 60;
  if (hours < 24) return `${hours}h ${remainMinutes}m`;
  const days = Math.floor(hours / 24);
  const remainHours = hours % 24;
  return `${days}d ${remainHours}h`;
}

export function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function setPresenceConnectionState(next: { state: string; reason?: string }) {
  state.presenceState = next.state;
  state.presenceReason = next.reason ?? "";
  emit();
}

function setBrowserOnlineState(isOnline: boolean) {
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
 * React hook to subscribe to the debug state.
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
