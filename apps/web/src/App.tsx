import { Zero } from "@rocicorp/zero";
import { ZeroProvider } from "@rocicorp/zero/react";
import type { ConnectionState } from "@rocicorp/zero";
import { mutators, schema } from "@games/shared";
import { Component, useEffect, useRef, useState } from "react";
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
import { showToast } from "./lib/toast";
import { markSyncConnecting, markSyncConnected, useSyncCountdown } from "./lib/sync-wake";
import { useAdminBroadcast } from "./hooks/useAdminBroadcast";
import { useButtonSounds } from "./hooks/useButtonSounds";
import { HomePage } from "./pages/HomePage";
import { HomePageStylePreview } from "./pages/HomePageStylePreview";
import { ImposterPage } from "./pages/ImposterPage";
import { PasswordBeginPage } from "./pages/PasswordBeginPage";
import { PasswordGamePage } from "./pages/PasswordGamePage";
import { PasswordResultsPage } from "./pages/PasswordResultsPage";
import { ChainReactionPage } from "./pages/ChainReactionPage";
import { ShadeSignalPage } from "./pages/ShadeSignalPage";
import { LocationSignalPage } from "./pages/LocationSignalPage";
import { ShikakuPage } from "./pages/ShikakuPage";

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

/** Routes that don't use the Zero sync server (solo/offline games). */
const SYNC_FREE_ROUTES = ["/shikaku"];

/**
 * Route-aware wake-toast: shows a persistent toast with countdown
 * immediately when connecting on a sync-dependent route.
 * Stays visible until connected, then briefly shows a success message.
 */
function SyncWakeToast() {
  const location = useLocation();
  const debug = useConnectionDebug();
  const zeroState = debug.zeroState;
  const needsSync = !SYNC_FREE_ROUTES.some((prefix) => location.pathname.startsWith(prefix));
  const countdown = useSyncCountdown();
  const [showSuccess, setShowSuccess] = useState(false);
  const wasConnectingRef = useRef(false);

  useEffect(() => {
    if (zeroState === "connecting" && needsSync) {
      markSyncConnecting();
      wasConnectingRef.current = true;
    } else if (zeroState === "connected") {
      if (wasConnectingRef.current && needsSync) {
        markSyncConnected();
        setShowSuccess(true);
        const timer = setTimeout(() => setShowSuccess(false), 2500);
        return () => clearTimeout(timer);
      }
      markSyncConnected();
    } else {
      markSyncConnected();
    }
  }, [zeroState, needsSync]);

  const isWaking = zeroState === "connecting" && needsSync;

  if (!isWaking && !showSuccess) return null;

  return (
    <div className="sync-wake-toast-container">
      {showSuccess ? (
        <div className="sync-wake-toast sync-wake-toast--success">
          <span className="sync-wake-icon">⚡</span>
          <span className="sync-wake-msg">Sync server is up — let's go!</span>
        </div>
      ) : (
        <div className="sync-wake-toast sync-wake-toast--info">
          <span className="sync-wake-spinner" />
          <span className="sync-wake-msg">
            Sync server is waking up
            {countdown != null && <span className="sync-wake-countdown"> ~{countdown}s</span>}
          </span>
        </div>
      )}
    </div>
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
    // page reloads — the server may return varying sessions due to relaxed
    // fingerprinting, which causes an infinite reload loop.
    if (import.meta.env.DEV) {
      return;
    }

    let cancelled = false;

    const verifyIdentity = async () => {
      const synced = await syncSessionIdentity(apiBaseURL, { allowCreate: true, reason: "app-verify" });
      if (!cancelled && (synced.sessionId !== initialSessionId || synced.zeroSessionProof !== initialSessionProof)) {
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
              <Route path="*" element={<HomePageStylePreview />} />
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
              <Route path="/" element={<HomePage sessionId={initialSessionId} />} />
              <Route path="/imposter/:id" element={<ImposterPage sessionId={initialSessionId} />} />
              <Route path="/password/:id/begin" element={<PasswordBeginPage sessionId={initialSessionId} />} />
              <Route path="/password/:id" element={<PasswordGamePage sessionId={initialSessionId} />} />
              <Route path="/password/:id/results" element={<PasswordResultsPage sessionId={initialSessionId} />} />
              <Route path="/chain/:id" element={<ChainReactionPage sessionId={initialSessionId} />} />
              <Route path="/shade/:id" element={<ShadeSignalPage sessionId={initialSessionId} />} />
              <Route path="/location/:id" element={<LocationSignalPage sessionId={initialSessionId} />} />
              <Route path="/shikaku" element={<ShikakuPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </ErrorBoundary>
    </ZeroProvider>
  );
}
