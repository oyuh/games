import { Zero } from "@rocicorp/zero";
import { ZeroProvider } from "@rocicorp/zero/react";
import type { ConnectionState } from "@rocicorp/zero";
import { mutators, schema } from "@games/shared";
import { Component, lazy, Suspense, useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { FiExternalLink, FiInfo, FiX } from "react-icons/fi";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { BootStatusPage } from "./components/BootStatusPage";
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
import { syncSessionIdentity, syncSessionIdentityForBoot } from "./lib/session";
import { markSyncConnecting, markSyncConnected, useSyncElapsedSeconds, useSyncTimedOut } from "./lib/sync-wake";
import { useSyncSessionActivityState, useSyncSessionActivityTracker } from "./lib/sync-session-activity";
import { showDedupedToast } from "./lib/toast";
import { useAdminBroadcast } from "./hooks/useAdminBroadcast";
import { useButtonSounds } from "./hooks/useButtonSounds";

const HomePage = lazy(() => import("./pages/HomePage").then(({ HomePage }) => ({ default: HomePage })));
const HomePageStylePreview = lazy(() =>
  import("./pages/HomePageStylePreview").then(({ HomePageStylePreview }) => ({ default: HomePageStylePreview }))
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
const PlayerCardsPage = lazy(() =>
  import("./pages/PlayerCardsPage").then(({ PlayerCardsPage }) => ({ default: PlayerCardsPage }))
);
const GameShellPage = lazy(() =>
  import("./pages/GameShellPage").then(({ GameShellPage }) => ({ default: GameShellPage }))
);
const ImposterKitPage = lazy(() =>
  import("./pages/ImposterKitPage").then(({ ImposterKitPage }) => ({ default: ImposterKitPage }))
);
const PasswordKitPage = lazy(() =>
  import("./pages/PasswordKitPage").then(({ PasswordKitPage }) => ({ default: PasswordKitPage }))
);
const ShadeKitPage = lazy(() =>
  import("./pages/ShadeKitPage").then(({ ShadeKitPage }) => ({ default: ShadeKitPage }))
);
const ChainKitPage = lazy(() =>
  import("./pages/ChainKitPage").then(({ ChainKitPage }) => ({ default: ChainKitPage }))
);
const LocationKitPage = lazy(() =>
  import("./pages/LocationKitPage").then(({ LocationKitPage }) => ({ default: LocationKitPage }))
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
const ZERO_CLIENT_RESET_COOLDOWN_MS = 5_000;
let lastSyncWakeNoticeShownAt = 0;

function createZero(sessionId: string, sessionProof: string | null, onClientStateNotFound: () => void) {
  return new Zero({
    auth: sessionProof ?? undefined,
    userID: sessionId,
    cacheURL: zeroCacheURL,
    schema,
    mutators,
    // Zero's default reaction to "zero-cache no longer knows this client" is
    // location.reload(). A sync server that restarted or woke from sleep hits
    // that path on the very next connect, so the page kept refreshing under
    // whoever was mid-game. ZeroProvider only swaps the client for you when it
    // owns it, and ours is passed in, so do the swap ourselves: same page,
    // fresh client, nothing lost but the sync socket.
    onClientStateNotFound,
    // Same deal for a client/server version mismatch. Only a real page load can
    // pick up new JS, so say so and let the player finish what they're doing.
    onUpdateNeeded: () => {
      showDedupedToast("A new version is out. Refresh when you get a chance.", "info");
    },
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

/** Routes that don't use the Zero sync server (solo/offline games + the status page). */
const SYNC_FREE_ROUTES = ["/shikaku", "/pips", "/admin", "/status"];

function isSyncFreePath(pathname: string) {
  return SYNC_FREE_ROUTES.some((prefix) => pathname.startsWith(prefix));
}

function formatElapsedTimer(elapsedSeconds: number | null) {
  const totalSeconds = Math.max(0, elapsedSeconds ?? 0);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function getSyncWakeProgress(elapsedSeconds: number | null) {
  const elapsed = Math.max(0, elapsedSeconds ?? 0);

  if (elapsed <= 20) {
    return Math.min(0.84, (elapsed / 20) * 0.84);
  }

  const slowedTail = 1 - Math.exp(-(elapsed - 20) / 55);
  return Math.min(0.985, 0.84 + slowedTail * 0.145);
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
            <a className="btn btn-muted" href="/status">
              Service status
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
  const elapsedSeconds = useSyncElapsedSeconds();
  const syncTimedOut = useSyncTimedOut();
  const syncActivity = useSyncSessionActivityState();
  const [showWakeNotice, setShowWakeNotice] = useState(false);
  const [showHostingInfo, setShowHostingInfo] = useState(false);
  const [dismissedWakeNoticeKey, setDismissedWakeNoticeKey] = useState<string | null>(null);
  const wakeNoticeTimerRef = useRef<number | null>(null);
  const syncIdle = needsSync && syncActivity.status === "idle";
  const showNeedsAuth = needsSync && zeroState === "needs-auth";
  const backendHealthy = debug.apiMetaState === "ok" && debug.dbState === "ok";
  const syncConnectionDelayed = needsSync && !showNeedsAuth && syncTimedOut;
  const showColdStartDelayed = syncConnectionDelayed && !backendHealthy;
  const showConnectionDelayed = syncConnectionDelayed && backendHealthy;
  const showUnavailable = showNeedsAuth || showColdStartDelayed || showConnectionDelayed;
  const wakeNoticeKey = `${location.pathname}:${zeroState}:${showUnavailable ? "delayed" : "connecting"}:${backendHealthy ? "backend-ok" : "backend-not-ok"}`;
  const wakeNoticeDismissed = dismissedWakeNoticeKey === wakeNoticeKey;
  const syncWakeVisible = syncIdle || ((showWakeNotice || showUnavailable) && !wakeNoticeDismissed);

  useSyncSessionActivityTracker({ needsSync });

  useEffect(() => {
    const clearWakeTimer = () => {
      if (wakeNoticeTimerRef.current !== null) {
        window.clearTimeout(wakeNoticeTimerRef.current);
        wakeNoticeTimerRef.current = null;
      }
    };

    if (syncIdle) {
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
      markSyncConnecting();
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
  }, [needsSync, showUnavailable, showWakeNotice, syncIdle, wakeNoticeDismissed, zeroState]);

  useEffect(() => {
    setShowHostingInfo(false);
    setDismissedWakeNoticeKey(null);
  }, [location.pathname]);

  useEffect(() => {
    document.body.classList.toggle("has-sync-wake-toast", syncWakeVisible);
    return () => {
      document.body.classList.remove("has-sync-wake-toast");
    };
  }, [syncWakeVisible]);

  if (!syncWakeVisible) return null;

  const toastTone = syncIdle ? "idle" : showColdStartDelayed ? "warn" : "info";
  const showSpinner = !syncIdle && (showNeedsAuth || showConnectionDelayed || !showUnavailable);
  const showElapsedTimer = !syncIdle;
  const elapsedLabel = formatElapsedTimer(elapsedSeconds);
  const progress = getSyncWakeProgress(elapsedSeconds);
  const progressStyle = { "--sync-wake-progress": progress } as CSSProperties;
  const message = syncIdle
    ? "Session set to idle"
    : showNeedsAuth
    ? backendHealthy
      ? "Multiplayer sync is connecting"
      : "Sync server is waking up"
    : showColdStartDelayed
    ? "Sync server is still waking up"
    : showConnectionDelayed
    ? "Multiplayer sync is still connecting"
    : backendHealthy
    ? "Multiplayer sync is connecting"
    : "Sync server is waking up";
  const handleDismiss = () => {
    if (wakeNoticeTimerRef.current !== null) {
      window.clearTimeout(wakeNoticeTimerRef.current);
      wakeNoticeTimerRef.current = null;
    }
    setShowWakeNotice(false);
    setShowHostingInfo(false);
    setDismissedWakeNoticeKey(wakeNoticeKey);
  };

  return (
    <>
      <div className="sync-wake-toast-container">
        <div className={`sync-wake-toast sync-wake-toast--${toastTone}`}>
          <button
            type="button"
            className="sync-wake-toast-hitarea"
            onClick={() => setShowHostingInfo(true)}
            aria-label="Open why the server sleeps info"
          />
          <div className="sync-wake-toast-content">
            <div className="sync-wake-toast-main">
              {showSpinner && <span className="sync-wake-spinner" />}
              <span className="sync-wake-msg">
                {message}
              </span>
              {showElapsedTimer && (
                <span className="sync-wake-timer" aria-label={`Sync wait time ${elapsedLabel}`}>
                  {elapsedLabel}
                </span>
              )}
            </div>
            {showElapsedTimer && (
              <span className="sync-wake-progress" style={progressStyle} aria-hidden="true">
                <span className="sync-wake-progress-bar" />
              </span>
            )}
            {syncIdle && <span className="sync-wake-detail">Move, click, or press a key to continue.</span>}
          </div>
          {!syncIdle && (
            <button type="button" className="toast-dismiss sync-wake-dismiss" onClick={handleDismiss} aria-label="Dismiss sync status">
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
  const [session, setSession] = useState(() => ({ id: initialSessionId, proof: initialSessionProof }));
  const [clientGeneration, setClientGeneration] = useState(0);
  const lastClientResetRef = useRef(0);
  const clientResetTimerRef = useRef<number | null>(null);

  // Zero hands this to us when the sync server drops our client state. Bumping
  // the generation swaps in a new client below instead of reloading the page.
  // Swaps are spaced out (never dropped) so a server that keeps rejecting us
  // can't make us churn through clients as fast as it can answer.
  // ponytail: fixed spacing, swap for real backoff if that ever shows up.
  const resetZeroClient = useCallback(() => {
    if (clientResetTimerRef.current !== null) {
      return;
    }
    const sinceLastReset = Date.now() - lastClientResetRef.current;
    clientResetTimerRef.current = window.setTimeout(() => {
      clientResetTimerRef.current = null;
      lastClientResetRef.current = Date.now();
      setClientGeneration((generation) => generation + 1);
    }, Math.max(0, ZERO_CLIENT_RESET_COOLDOWN_MS - sinceLastReset));
  }, []);

  const [zero, setZero] = useState(() => createZero(session.id, session.proof, resetZeroClient));
  const appliedZeroRef = useRef({ session, generation: clientGeneration });

  // Global admin broadcast listener (toasts, refresh, custom status, kick)
  useAdminBroadcast();

  // Global button hover/press sound effects
  useButtonSounds();

  // Recreate the Zero client in place when a background identity check yields a
  // new session or auth proof, or when the sync server told us our client state
  // is gone. Zero re-uses its IndexedDB store keyed by userID, so the swap is
  // seamless: a first-timer boots anonymous and silently upgrades to an
  // authenticated client the moment the backend hands out a proof, with no page
  // reload and no data flash.
  useEffect(() => {
    const applied = appliedZeroRef.current;
    if (
      applied.session.id === session.id &&
      applied.session.proof === session.proof &&
      applied.generation === clientGeneration
    ) {
      return;
    }
    appliedZeroRef.current = { session, generation: clientGeneration };
    const next = createZero(session.id, session.proof, resetZeroClient);
    setZero((previous) => {
      void previous.close();
      return next;
    });
  }, [clientGeneration, resetZeroClient, session]);

  useEffect(() => {
    if (styleOnly) {
      return;
    }

    let cancelled = false;

    const applyVerifiedIdentity = (synced: {
      sessionId: string;
      zeroSessionProof: string | null;
      source: string;
    }) => {
      // "fallback" means the server never answered, so keep our local identity.
      if (cancelled || synced.source === "fallback") {
        return;
      }
      setSession((prev) => {
        const nextProof = synced.zeroSessionProof ?? prev.proof;
        if (prev.id === synced.sessionId && prev.proof === nextProof) {
          return prev;
        }
        return { id: synced.sessionId, proof: nextProof };
      });
    };

    const verifyNow = async () => {
      if (isSyncFreePath(window.location.pathname)) {
        return;
      }
      applyVerifiedIdentity(await syncSessionIdentity(apiBaseURL, { allowCreate: true, reason: "app-verify" }));
    };

    // Background upgrade on mount: keep retrying a cold backend until we get a
    // verified session + proof, then swap Zero to authenticated in place.
    void (async () => {
      if (isSyncFreePath(window.location.pathname)) {
        return;
      }
      try {
        applyVerifiedIdentity(await syncSessionIdentityForBoot(apiBaseURL));
      } catch {
        // Backend still cold or unreachable; the interval below keeps trying.
      }
    })();

    // In dev the server hands out varying sessions, so only the one-shot mount
    // upgrade runs there. Prod keeps re-verifying periodically and on tab focus.
    if (import.meta.env.DEV) {
      return () => {
        cancelled = true;
      };
    }

    const timer = window.setInterval(() => {
      void verifyNow();
    }, 60_000);

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        void verifyNow();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [styleOnly]);

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

        if (cancelled) {
          return;
        }

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
      // Zero stops retrying for good once it has failed to connect for 60s
      // ("was disconnected"). Nothing ever brings it back, so the app sits on
      // "Sync server is waking up" until someone reloads. In dev that happens
      // every time the API restarts under a live client. Swap in a fresh client
      // instead; resetZeroClient is already throttled so a server that stays
      // down can't make us churn.
      if (next.name === "disconnected") {
        addConnectionDebugEvent({
          level: "warn",
          source: "zero",
          message: `Zero gave up (${next.reason}); swapping in a fresh client`
        });
        resetZeroClient();
      }
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
  }, [zero, resetZeroClient]);

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
            <Route
              path="/status"
              element={
                <BootStatusPage
                  apiBase={apiBaseURL}
                  zeroCacheURL={zeroCacheURL}
                  sessionId={session.id}
                  onRetry={() => window.location.reload()}
                />
              }
            />
            <Route element={<AppShell />}>
              <Route path="/" element={<LazyRoute><HomePage sessionId={session.id} /></LazyRoute>} />
              <Route path="/imposter" element={<Navigate to="/?game=imposter" replace />} />
              <Route path="/password" element={<Navigate to="/?game=password" replace />} />
              <Route path="/chain" element={<Navigate to="/?game=chain" replace />} />
              <Route path="/chain-reaction" element={<Navigate to="/?game=chain" replace />} />
              <Route path="/shade" element={<Navigate to="/?game=shade" replace />} />
              <Route path="/shade-signal" element={<Navigate to="/?game=shade" replace />} />
              <Route path="/location" element={<Navigate to="/?game=location" replace />} />
              <Route path="/location-signal" element={<Navigate to="/?game=location" replace />} />
              <Route path="/imposter/:id" element={<LazyRoute><ImposterPage sessionId={session.id} /></LazyRoute>} />
              <Route path="/password/:id/begin" element={<LazyRoute><PasswordBeginPage sessionId={session.id} /></LazyRoute>} />
              <Route path="/password/:id" element={<LazyRoute><PasswordGamePage sessionId={session.id} /></LazyRoute>} />
              <Route path="/password/:id/results" element={<LazyRoute><PasswordResultsPage sessionId={session.id} /></LazyRoute>} />
              <Route path="/chain/:id" element={<LazyRoute><ChainReactionPage sessionId={session.id} /></LazyRoute>} />
              <Route path="/shade/:id" element={<LazyRoute><ShadeSignalPage sessionId={session.id} /></LazyRoute>} />
              <Route path="/location/:id" element={<LazyRoute><LocationSignalPage sessionId={session.id} /></LazyRoute>} />
              <Route path="/shikaku" element={<LazyRoute><ShikakuPage /></LazyRoute>} />
              <Route path="/pips" element={<LazyRoute><PipsPage /></LazyRoute>} />
              {/* Gallery for the shared PlayerCard. Not linked from anywhere on purpose. */}
              <Route path="/dev/player-cards" element={<LazyRoute><PlayerCardsPage /></LazyRoute>} />
              <Route path="/dev/game-shell" element={<LazyRoute><GameShellPage /></LazyRoute>} />
              <Route path="/dev/imposter" element={<LazyRoute><ImposterKitPage /></LazyRoute>} />
              <Route path="/dev/password" element={<LazyRoute><PasswordKitPage /></LazyRoute>} />
              <Route path="/dev/chain" element={<LazyRoute><ChainKitPage /></LazyRoute>} />
              <Route path="/dev/shade" element={<LazyRoute><ShadeKitPage /></LazyRoute>} />
              <Route path="/dev/location" element={<LazyRoute><LocationKitPage /></LazyRoute>} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </ErrorBoundary>
    </ZeroProvider>
  );
}
