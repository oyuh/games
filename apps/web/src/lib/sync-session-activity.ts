import { useEffect, useSyncExternalStore } from "react";

type SyncSessionActivityStatus = "active" | "idle";

type SyncSessionActivityState = {
  status: SyncSessionActivityStatus;
  needsSync: boolean;
  lastActiveAt: number;
  idleStartedAt: number | null;
};

const IDLE_AFTER_MS = import.meta.env.DEV ? 90_000 : 5 * 60_000;
const ACTIVITY_THROTTLE_MS = 2_000;

let state: SyncSessionActivityState = {
  status: "active",
  needsSync: false,
  lastActiveAt: Date.now(),
  idleStartedAt: null,
};

let idleTimer: number | null = null;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

function setState(next: Partial<SyncSessionActivityState>) {
  state = { ...state, ...next };
  emit();
}

function clearIdleTimer() {
  if (idleTimer !== null) {
    window.clearTimeout(idleTimer);
    idleTimer = null;
  }
}

function markIdleIfNeeded() {
  if (!state.needsSync || state.status !== "active") {
    return;
  }

  const now = Date.now();
  if (now - state.lastActiveAt < IDLE_AFTER_MS) {
    scheduleIdleTimer();
    return;
  }

  setState({
    status: "idle",
    idleStartedAt: now,
  });
}

function scheduleIdleTimer() {
  clearIdleTimer();

  if (!state.needsSync || state.status !== "active") {
    return;
  }

  const waitMs = Math.max(1_000, IDLE_AFTER_MS - (Date.now() - state.lastActiveAt));
  idleTimer = window.setTimeout(markIdleIfNeeded, waitMs);
}

export function configureSyncSessionActivity({ needsSync }: { needsSync: boolean }) {
  if (!needsSync) {
    clearIdleTimer();
    if (state.needsSync || state.status !== "active") {
      setState({
        status: "active",
        needsSync: false,
        lastActiveAt: Date.now(),
        idleStartedAt: null,
      });
    }
    return;
  }

  if (!state.needsSync) {
    setState({
      status: "active",
      needsSync: true,
      lastActiveAt: Date.now(),
      idleStartedAt: null,
    });
    scheduleIdleTimer();
    return;
  }

  if (state.status === "active") {
    scheduleIdleTimer();
  }
}

export function noteSyncSessionActivity() {
  if (!state.needsSync) {
    return;
  }

  const now = Date.now();

  if (state.status === "idle") {
    setState({
      status: "active",
      lastActiveAt: now,
      idleStartedAt: null,
    });
    scheduleIdleTimer();
    return;
  }

  if (now - state.lastActiveAt < ACTIVITY_THROTTLE_MS) {
    return;
  }

  setState({ lastActiveAt: now });
  scheduleIdleTimer();
}

export function useSyncSessionActivityState() {
  return useSyncExternalStore(
    (callback) => {
      listeners.add(callback);
      return () => listeners.delete(callback);
    },
    () => state,
  );
}

export function useSyncSessionActivityTracker({ needsSync }: { needsSync: boolean }) {
  useEffect(() => {
    configureSyncSessionActivity({ needsSync });
  }, [needsSync]);

  useEffect(() => {
    if (!needsSync) {
      return;
    }

    const handleActivity = () => {
      if (!document.hidden) {
        noteSyncSessionActivity();
      }
    };

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        noteSyncSessionActivity();
      }
    };

    const options: AddEventListenerOptions = { capture: true, passive: true };
    window.addEventListener("pointerdown", handleActivity, options);
    window.addEventListener("pointermove", handleActivity, options);
    window.addEventListener("keydown", handleActivity, options);
    window.addEventListener("wheel", handleActivity, options);
    window.addEventListener("touchstart", handleActivity, options);
    window.addEventListener("focus", handleActivity, options);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    scheduleIdleTimer();

    return () => {
      window.removeEventListener("pointerdown", handleActivity, options);
      window.removeEventListener("pointermove", handleActivity, options);
      window.removeEventListener("keydown", handleActivity, options);
      window.removeEventListener("wheel", handleActivity, options);
      window.removeEventListener("touchstart", handleActivity, options);
      window.removeEventListener("focus", handleActivity, options);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [needsSync]);
}
