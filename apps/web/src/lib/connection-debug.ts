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
  presenceURL: string;
  location: string;
  isOnline: boolean;
  zeroState: string;
  zeroReason: string;
  presenceState: string;
  presenceReason: string;
  events: ConnectionDebugEvent[];
};

const MAX_EVENTS = 40;

const state: ConnectionDebugState = {
  bootedAt: new Date().toISOString(),
  sessionId: "",
  zeroCacheURL: "",
  presenceURL: "",
  location: typeof window !== "undefined" ? window.location.href : "",
  isOnline: typeof navigator !== "undefined" ? navigator.onLine : true,
  zeroState: "unknown",
  zeroReason: "",
  presenceState: "unknown",
  presenceReason: "",
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
  presenceURL: string;
}) {
  state.sessionId = config.sessionId;
  state.zeroCacheURL = config.zeroCacheURL;
  state.presenceURL = config.presenceURL;
  state.location = typeof window !== "undefined" ? window.location.href : state.location;
  state.isOnline = typeof navigator !== "undefined" ? navigator.onLine : state.isOnline;
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
