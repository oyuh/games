import { useEffect, useState, useSyncExternalStore } from "react";

type SyncSessionActivityStatus = "active" | "idle" | "resuming";

type SyncSessionActivityState = {
  status: SyncSessionActivityStatus;
  needsSync: boolean;
  lastActiveAt: number;
  idleStartedAt: number | null;
  resumeStartedAt: number | null;
};

const IDLE_AFTER_MS = import.meta.env.DEV ? 90_000 : 5 * 60_000;
const RESUME_ESTIMATE_SECS = import.meta.env.DEV ? 35 : 25;
const ACTIVITY_THROTTLE_MS = 2_000;

let state: SyncSessionActivityState = {
  status: "active",
  needsSync: false,
  lastActiveAt: Date.now(),
  idleStartedAt: null,
  resumeStartedAt: null,
};

let idleTimer: number | null = null;
let currentZeroConnected = false;
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
    resumeStartedAt: null,
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

export function configureSyncSessionActivity({
  needsSync,
  zeroConnected,
}: {
  needsSync: boolean;
  zeroConnected: boolean;
}) {
  currentZeroConnected = zeroConnected;

  if (!needsSync) {
    clearIdleTimer();
    if (state.needsSync || state.status !== "active") {
      setState({
        status: "active",
        needsSync: false,
        lastActiveAt: Date.now(),
        idleStartedAt: null,
        resumeStartedAt: null,
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
      resumeStartedAt: null,
    });
    scheduleIdleTimer();
    return;
  }

  if (state.status === "active" && Date.now() - state.lastActiveAt >= IDLE_AFTER_MS) {
    clearIdleTimer();
    setState({
      status: "idle",
      idleStartedAt: Date.now(),
      resumeStartedAt: null,
    });
    return;
  }

  if (state.status === "resuming" && zeroConnected) {
    setState({
      status: "active",
      lastActiveAt: Date.now(),
      idleStartedAt: null,
      resumeStartedAt: null,
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

  if (state.status === "idle" || state.status === "resuming") {
    setState({
      status: currentZeroConnected ? "active" : "resuming",
      lastActiveAt: now,
      idleStartedAt: null,
      resumeStartedAt: currentZeroConnected ? null : now,
    });
    if (currentZeroConnected) {
      scheduleIdleTimer();
    } else {
      clearIdleTimer();
    }
    return;
  }

  if (now - state.lastActiveAt >= IDLE_AFTER_MS) {
    setState({
      status: currentZeroConnected ? "active" : "resuming",
      lastActiveAt: now,
      idleStartedAt: null,
      resumeStartedAt: currentZeroConnected ? null : now,
    });
    if (currentZeroConnected) {
      scheduleIdleTimer();
    } else {
      clearIdleTimer();
    }
    return;
  }

  if (now - state.lastActiveAt < ACTIVITY_THROTTLE_MS) {
    return;
  }

  setState({ lastActiveAt: now });
  scheduleIdleTimer();
}

export function isSyncSessionInteractionBlocked() {
  return state.needsSync && state.status !== "active";
}

export function getSyncSessionBlockedMessage() {
  if (state.status === "idle") {
    return "Your multiplayer session is idle. Move, click, or press a key to resume controls.";
  }

  if (state.status === "resuming") {
    const elapsed = state.resumeStartedAt == null ? 0 : (Date.now() - state.resumeStartedAt) / 1000;
    const remaining = Math.max(1, Math.ceil(RESUME_ESTIMATE_SECS - elapsed));
    return `Sync is reconnecting after idle (~${remaining}s). Controls will unlock automatically.`;
  }

  return "Multiplayer controls are paused until sync is ready.";
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

export function useSyncSessionResumeCountdown(): number | null {
  const snapshot = useSyncSessionActivityState();
  const resumeStartedAt = snapshot.resumeStartedAt;
  const [remaining, setRemaining] = useState<number | null>(() => {
    if (resumeStartedAt == null) return null;
    const elapsed = (Date.now() - resumeStartedAt) / 1000;
    return Math.max(1, Math.ceil(RESUME_ESTIMATE_SECS - elapsed));
  });

  useEffect(() => {
    if (resumeStartedAt == null) {
      setRemaining(null);
      return;
    }

    const update = () => {
      const elapsed = (Date.now() - resumeStartedAt) / 1000;
      setRemaining(Math.max(1, Math.ceil(RESUME_ESTIMATE_SECS - elapsed)));
    };

    update();
    const timer = window.setInterval(update, 1_000);
    return () => window.clearInterval(timer);
  }, [resumeStartedAt]);

  return remaining;
}

export function useSyncSessionActivityTracker({
  needsSync,
  zeroConnected,
}: {
  needsSync: boolean;
  zeroConnected: boolean;
}) {
  useEffect(() => {
    configureSyncSessionActivity({ needsSync, zeroConnected });
  }, [needsSync, zeroConnected]);

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
