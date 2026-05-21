import { Zero } from "@rocicorp/zero";
import { ZeroProvider } from "@rocicorp/zero/react";
import type { ConnectionState } from "@rocicorp/zero";
import { mutators, schema } from "@games/shared";
import { Component, lazy, Suspense, useEffect, useRef, useState } from "react";
import { FiExternalLink, FiInfo, FiX } from "react-icons/fi";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import {
  addConnectionDebugEvent,
  initConnectionDebug,
  setApiBuildInfo,
  setApiConnectionProbe,
  setDatabaseStatusProbe,
  setZeroConnectionState,
  startGlobalConnectionDebugCapture,
  useConnectionDebug
} from "./lib/connection-debug";
import { syncSessionIdentity } from "./lib/session";
import { markSyncConnecting, markSyncConnected, useSyncCountdown, useSyncTimedOut } from "./lib/sync-wake";
import {
  useSyncSessionActivityState,
  useSyncSessionActivityTracker,
  useSyncSessionResumeCountdown
} from "./lib/sync-session-activity";
import { useAdminBroadcast } from "./hooks/useAdminBroadcast";
import { useButtonSounds } from "./hooks/useButtonSounds";

const HomePage = lazy(() => import("./pages/HomePage").then(({ HomePage }) => ({ default: HomePage })));
const HomePageStylePreview = lazy(() =>
  import("./pages/HomePageStylePreview").then(({ HomePageStylePreview }) => ({ default: HomePageStylePreview }))
);
const AdminScoresPage = lazy(() =>
  import("./pages/AdminScoresPage").then(({ AdminScoresPage }) => ({ default: AdminScoresPage }))
);
const ImposterPage = lazy(() => import("./pages/ImposterPage").then(({ ImposterPage }) => ({ default: ImposterPage })));
const PasswordBeginPage = lazy(() =>
  import("./pages/PasswordBeginPage").then(({ PasswordBeginPage }) => ({ default: PasswordBeginPage }))
);
const PasswordGamePage = lazy(() =>
  import("./pages/PasswordGamePage").then(({ PasswordGamePage }) => ({ default: PasswordGamePage }))
);
const PasswordResultsPage = lazy(() =>
  import("./pages/PasswordResultsPage").then(({ PasswordResultsPage }) => ({ default: PasswordResultsPage }))
);
const ChainReactionPage = lazy(() =>
  import("./pages/ChainReactionPage").then(({ ChainReactionPage }) => ({ default: ChainReactionPage }))
);
const ShadeSignalPage = lazy(() =>
  import("./pages/ShadeSignalPage").then(({ ShadeSignalPage }) => ({ default: ShadeSignalPage }))
);
const LocationSignalPage = lazy(() =>
  import("./pages/LocationSignalPage").then(({ LocationSignalPage }) => ({ default: LocationSignalPage }))
);
const ShikakuPage = lazy(() => import("./pages/ShikakuPage").then(({ ShikakuPage }) => ({ default: ShikakuPage })));
const PipsPage = lazy(() => import("./pages/PipsPage").then(({ PipsPage }) => ({ default: PipsPage })));

class ErrorBoundary extends Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 40, color: "#ff6b6b", fontFamily: "monospace" }}>
          <h2>Something crashed!</h2>
          <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
            {this.state.error.message}
          </pre>
          <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", fontSize: "0.8em", opacity: 0.7 }}>
            {this.state.error.stack}
          </pre>
          <button onClick={() => { this.setState({ error: null }); window.location.href = "/"; }}
            style={{ marginTop: 16, padding: "8px 16px", cursor: "pointer" }}>
            Go Home
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const API_METADATA_POLL_MS = 30_000;

const zeroCacheURL = import.meta.env.VITE_ZERO_CACHE_URL ?? "http://localhost:4848";
const apiBaseURL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";
const apiInfoURL = `${apiBaseURL}/debug/build-info`;
const SYNC_WAKE_NOTICE_DELAY_MS = 2_500;
const SYNC_WAKE_NOTICE_COOLDOWN_MS = 120_000;
const BUY_ME_A_COFFEE_URL = "https://buymeacoffee.com/lawsonhart";
let lastSyncWakeNoticeShownAt = 0;

function createZero(sessionId: string, sessionProof: string | null) {
  return new Zero({
    auth: sessionProof ?? undefined,
    userID: sessionId,
    cacheURL: zeroCacheURL,
    schema,
    mutators,
  });
}

function stringifyError(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function RouteLoading() {
  return (
    <div className="route-loading" role="status" aria-live="polite">
      <span className="route-loading-spinner" />
      <span>Loading</span>
    </div>
  );
}

function LazyRoute({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<RouteLoading />}>{children}</Suspense>;
}

/** Routes that don't use the Zero sync server (solo/offline games). */
const SYNC_FREE_ROUTES = ["/shikaku", "/pips", "/admin"];

function isSyncFreePath(pathname: string) {
  return SYNC_FREE_ROUTES.some((prefix) => pathname.startsWith(prefix));
}

function HostingInfoModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-panel sync-hosting-modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div className="sync-hosting-title">
            <FiInfo size={18} />
            <span className="modal-title">Why the server sleeps</span>
          </div>
          <button className="modal-close" type="button" onClick={onClose} aria-label="Close hosting info">
            <FiX size={18} />
          </button>
        </div>
        <div className="modal-body sync-hosting-modal-body">
          <p className="sync-hosting-copy">
            Multiplayer runs on a separate sync service. When traffic is quiet, I let it sleep so hosting stays cheap
            and the project does not burn money just sitting there idle.
          </p>
          <p className="sync-hosting-copy">
            That means the first multiplayer visit can take a little while to wake up. Solo games like Shikaku and
            Pips do not depend on that server, so they still work normally.
          </p>
          <div className="sync-hosting-note">
            Supporting the project helps cover hosting and makes it easier to keep the multiplayer stack online longer.
          </div>
          <div className="sync-hosting-actions">
            <a className="btn btn-primary" href={BUY_ME_A_COFFEE_URL} target="_blank" rel="noreferrer">
              Buy Me a Coffee
              <FiExternalLink size={16} />
            </a>
            <button className="btn btn-muted" type="button" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Route-aware wake notice for a real sync cold start. */
function SyncWakeToast() {
  const location = useLocation();
  const debug = useConnectionDebug();
  const zeroState = debug.zeroState;
  const needsSync = !isSyncFreePath(location.pathname);
  const zeroConnected = zeroState === "connected";
  const countdown = useSyncCountdown();
  const syncTimedOut = useSyncTimedOut();
  const syncActivity = useSyncSessionActivityState();
  const resumeCountdown = useSyncSessionResumeCountdown();
  const [showWakeNotice, setShowWakeNotice] = useState(false);
  const [showHostingInfo, setShowHostingInfo] = useState(false);
  const [dismissedWakeNoticeKey, setDismissedWakeNoticeKey] = useState<string | null>(null);
  const wakeNoticeTimerRef = useRef<number | null>(null);
  const syncIdle = needsSync && syncActivity.status === "idle";
  const syncResuming = needsSync && syncActivity.status === "resuming";
  const idleRelated = syncIdle || syncResuming;
  const showNeedsAuth = needsSync && !idleRelated && zeroState === "needs-auth";
  const backendHealthy = debug.apiMetaState === "ok" && debug.dbState === "ok";
  const syncConnectionDelayed = needsSync && !idleRelated && !showNeedsAuth && syncTimedOut;
  const showColdStartDelayed = syncConnectionDelayed && !backendHealthy;
  const showConnectionDelayed = syncConnectionDelayed && backendHealthy;
  const showUnavailable = showNeedsAuth || showColdStartDelayed || showConnectionDelayed;
  const wakeNoticeKey = `${location.pathname}:${zeroState}:${showUnavailable ? "delayed" : "connecting"}:${backendHealthy ? "backend-ok" : "backend-not-ok"}`;
  const wakeNoticeDismissed = !idleRelated && dismissedWakeNoticeKey === wakeNoticeKey;
  const syncWakeVisible = syncIdle || syncResuming || ((showWakeNotice || showUnavailable) && !wakeNoticeDismissed);
  const controlsPaused = syncIdle || syncResuming;

  useSyncSessionActivityTracker({ needsSync, zeroConnected });

  useEffect(() => {
    const clearWakeTimer = () => {
      if (wakeNoticeTimerRef.current !== null) {
        window.clearTimeout(wakeNoticeTimerRef.current);
        wakeNoticeTimerRef.current = null;
      }
    };

    if (idleRelated) {
      clearWakeTimer();
      setShowWakeNotice(false);
      setDismissedWakeNoticeKey(null);
      markSyncConnected();
      return clearWakeTimer;
    }

    const isWaitingForSync = needsSync && zeroState !== "connected" && !showUnavailable;

    if (isWaitingForSync) {
      markSyncConnecting();
      if (wakeNoticeDismissed) {
        clearWakeTimer();
      } else if (!showWakeNotice && wakeNoticeTimerRef.current === null) {
        wakeNoticeTimerRef.current = window.setTimeout(() => {
          wakeNoticeTimerRef.current = null;
          if (Date.now() - lastSyncWakeNoticeShownAt >= SYNC_WAKE_NOTICE_COOLDOWN_MS) {
            lastSyncWakeNoticeShownAt = Date.now();
            setShowWakeNotice(true);
          }
        }, SYNC_WAKE_NOTICE_DELAY_MS);
      }
    } else if (showUnavailable) {
      clearWakeTimer();
      if (!wakeNoticeDismissed) {
        setShowWakeNotice(true);
      }
    } else {
      clearWakeTimer();
      setShowWakeNotice(false);
      setDismissedWakeNoticeKey(null);
      markSyncConnected();
    }

    return clearWakeTimer;
  }, [idleRelated, needsSync, showUnavailable, showWakeNotice, wakeNoticeDismissed, zeroState]);

  useEffect(() => {
    setShowHostingInfo(false);
    setDismissedWakeNoticeKey(null);
  }, [location.pathname]);

  useEffect(() => {
    document.body.classList.toggle("has-sync-wake-toast", syncWakeVisible);
    document.body.classList.toggle("has-sync-paused-controls", controlsPaused);
    return () => {
      document.body.classList.remove("has-sync-wake-toast");
      document.body.classList.remove("has-sync-paused-controls");
    };
  }, [controlsPaused, syncWakeVisible]);

  if (!syncWakeVisible) return null;

  const toastTone = showColdStartDelayed ? "warn" : syncIdle ? "idle" : "info";
  const showSpinner = syncResuming || showNeedsAuth || showConnectionDelayed || (!showUnavailable && !syncIdle);
  const message = syncIdle
    ? "Session set to idle"
    : syncResuming
    ? "Sync reconnecting after idle"
    : showNeedsAuth
    ? "Multiplayer sync is reconnecting"
    : showColdStartDelayed
    ? "Sync server is still waking up"
    : showConnectionDelayed
    ? "Multiplayer sync is still connecting"
    : backendHealthy
    ? "Multiplayer sync is connecting"
    : "Sync server is waking up";

  const dismissWakeNotice = () => {
    setShowWakeNotice(false);
    setShowHostingInfo(false);
    setDismissedWakeNoticeKey(wakeNoticeKey);
  };

  return (
    <>
      <div className="sync-wake-toast-container">
        <div className={`sync-wake-toast sync-wake-toast--${toastTone}`}>
          <div className="sync-wake-toast-main">
            {showSpinner && <span className="sync-wake-spinner" />}
            <span className="sync-wake-msg">
              {message}
            </span>
            {syncIdle && <span className="sync-wake-detail">Move, click, or press a key to resume.</span>}
            {syncResuming && resumeCountdown != null && (
              <span className="sync-wake-countdown-link">
                ~{resumeCountdown}s
              </span>
            )}
            {!idleRelated && !showUnavailable && !backendHealthy && countdown != null && (
              <button
                type="button"
                className="sync-wake-countdown-link"
                onClick={() => setShowHostingInfo(true)}
              >
                ~{countdown}s
              </button>
            )}
          </div>
          {showColdStartDelayed && (
            <button type="button" className="sync-wake-link" onClick={() => setShowHostingInfo(true)}>
              Why does it sleep?
            </button>
          )}
          {!idleRelated && (
            <button
              type="button"
              className="sync-wake-dismiss"
              onClick={dismissWakeNotice}
              aria-label="Dismiss sync notice"
            >
              <FiX size={14} />
            </button>
          )}
        </div>
      </div>
      {showHostingInfo && <HostingInfoModal onClose={() => setShowHostingInfo(false)} />}
    </>
  );
}

/** Hook: is the Zero sync server currently connected? */
export function useZeroConnected() {
  const debug = useConnectionDebug();
  return debug.zeroState === "connected";
}

export function App({ initialSessionId, initialSessionProof }: { initialSessionId: string; initialSessionProof: string | null }) {
  const styleOnly = import.meta.env.VITE_STYLE_ONLY === "true";
  const [zero] = useState(() => createZero(initialSessionId, initialSessionProof));

  // Global admin broadcast listener (toasts, refresh, custom status, kick)
  useAdminBroadcast();

  // Global button hover/press sound effects
  useButtonSounds();

  useEffect(() => {
    if (styleOnly) {
      return;
    }

    // In dev mode, skip the periodic identity verification that triggers
    // page reloads - the server may return varying sessions due to relaxed
    // fingerprinting, which causes an infinite reload loop.
    if (import.meta.env.DEV) {
      return;
    }

    let cancelled = false;

    const verifyIdentity = async () => {
      if (isSyncFreePath(window.location.pathname)) {
        return;
      }
      const synced = await syncSessionIdentity(apiBaseURL, { allowCreate: true, reason: "app-verify" });
      if (!cancelled && !isSyncFreePath(window.location.pathname) && (synced.sessionId !== initialSessionId || synced.zeroSessionProof !== initialSessionProof)) {
        window.location.reload();
      }
    };

    const timer = window.setInterval(() => {
      void verifyIdentity();
    }, 60_000);

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        void verifyIdentity();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [initialSessionId, initialSessionProof, styleOnly]);

  useEffect(() => {
    initConnectionDebug({
      sessionId: initialSessionId,
      zeroCacheURL,
      apiBaseURL,
      apiInfoURL
    });

    addConnectionDebugEvent({
      level: "info",
      source: "app",
      message: `boot (${import.meta.env.PROD ? "prod" : "dev"})`
    });

    return startGlobalConnectionDebugCapture();
  }, [initialSessionId]);

  useEffect(() => {
    if (styleOnly) {
      return;
    }

    let cancelled = false;

    const poll = async () => {
      const started = performance.now();
      setApiConnectionProbe({ state: "loading" });

      try {
        const response = await fetch(apiInfoURL, {
          cache: "no-store"
        });
        const latencyMs = Math.round(performance.now() - started);

        if (!response.ok) {
          throw new Error(`status ${response.status}`);
        }

        const payload = (await response.json()) as {
          platform?: string;
          commitSha?: string;
          commitRef?: string;
          commitMessage?: string;
          commitTimestamp?: string;
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

        if (cancelled) {
          return;
        }

        setApiBuildInfo({
          platform: payload.platform,
          commitSha: payload.commitSha,
          commitRef: payload.commitRef,
          commitMessage: payload.commitMessage,
          commitTimestamp: payload.commitTimestamp,
          buildTimestamp: payload.buildTimestamp,
          updatedAt: payload.updatedAt,
          startedAt: payload.startedAt,
          uptimeMs: payload.uptimeMs
        });

        setApiConnectionProbe({
          state: "ok",
          latencyMs,
          checkedAt: new Date().toISOString()
        });

        const nextDatabaseProbe = {
          state: payload.database?.state ?? "unknown",
          checkedAt: payload.database?.checkedAt ?? new Date().toISOString(),
          ...(payload.database?.reason ? { reason: payload.database.reason } : {}),
          ...(payload.database?.key ? { key: payload.database.key } : {}),
          ...(payload.database?.expectedValue ? { expectedValue: payload.database.expectedValue } : {}),
          ...(payload.database?.actualValue ? { actualValue: payload.database.actualValue } : {})
        };

        setDatabaseStatusProbe(nextDatabaseProbe);
      } catch (error) {
        if (cancelled) {
          return;
        }

        const latencyMs = Math.round(performance.now() - started);
        setApiConnectionProbe({
          state: "error",
          reason: stringifyError(error),
          latencyMs,
          checkedAt: new Date().toISOString()
        });

        setDatabaseStatusProbe({
          state: "offline",
          reason: stringifyError(error),
          checkedAt: new Date().toISOString()
        });

        addConnectionDebugEvent({
          level: "warn",
          source: "api",
          message: "metadata probe failed",
          details: stringifyError(error)
        });
      }
    };

    void poll();
    const timer = window.setInterval(() => {
      void poll();
    }, API_METADATA_POLL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [apiInfoURL, styleOnly]);

  useEffect(() => {
    addConnectionDebugEvent({
      level: "info",
      source: "zero",
      message: "Zero client initialized"
    });

    const mapAndTrack = (next: ConnectionState) => {
      setZeroConnectionState(next);
    };

    mapAndTrack(zero.connection.state.current);

    const unsubscribeConnection = zero.connection.state.subscribe(mapAndTrack);
    const unsubscribeOnline = zero.onOnline((online) => {
      addConnectionDebugEvent({
        level: online ? "info" : "warn",
        source: "zero.online",
        message: online ? "online=true" : "online=false"
      });
    });

    return () => {
      unsubscribeConnection();
      unsubscribeOnline();
    };
  }, [zero]);

  if (styleOnly) {
    return (
      <BrowserRouter>
          <Routes>
            <Route element={<AppShell />}>
              <Route path="*" element={<LazyRoute><HomePageStylePreview /></LazyRoute>} />
            </Route>
          </Routes>
        </BrowserRouter>
    );
  }

  return (
    <ZeroProvider zero={zero}>
      <ErrorBoundary>
        <BrowserRouter>
          <SyncWakeToast />
          <Routes>
            <Route element={<AppShell />}>
              <Route path="/" element={<LazyRoute><HomePage sessionId={initialSessionId} /></LazyRoute>} />
              <Route path="/imposter/:id" element={<LazyRoute><ImposterPage sessionId={initialSessionId} /></LazyRoute>} />
              <Route path="/password/:id/begin" element={<LazyRoute><PasswordBeginPage sessionId={initialSessionId} /></LazyRoute>} />
              <Route path="/password/:id" element={<LazyRoute><PasswordGamePage sessionId={initialSessionId} /></LazyRoute>} />
              <Route path="/password/:id/results" element={<LazyRoute><PasswordResultsPage sessionId={initialSessionId} /></LazyRoute>} />
              <Route path="/chain/:id" element={<LazyRoute><ChainReactionPage sessionId={initialSessionId} /></LazyRoute>} />
              <Route path="/shade/:id" element={<LazyRoute><ShadeSignalPage sessionId={initialSessionId} /></LazyRoute>} />
              <Route path="/location/:id" element={<LazyRoute><LocationSignalPage sessionId={initialSessionId} /></LazyRoute>} />
              <Route path="/shikaku" element={<LazyRoute><ShikakuPage /></LazyRoute>} />
              <Route path="/pips" element={<LazyRoute><PipsPage /></LazyRoute>} />
              <Route path="/admin/scores" element={<LazyRoute><AdminScoresPage /></LazyRoute>} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </ErrorBoundary>
    </ZeroProvider>
  );
}
