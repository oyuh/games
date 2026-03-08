import { Zero } from "@rocicorp/zero";
import { ZeroProvider } from "@rocicorp/zero/react";
import type { ConnectionState } from "@rocicorp/zero";
import { mutators, schema } from "@games/shared";
import { useEffect } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import {
  addConnectionDebugEvent,
  initConnectionDebug,
  setApiBuildInfo,
  setApiConnectionProbe,
  setDatabaseStatusProbe,
  setZeroConnectionState,
  startGlobalConnectionDebugCapture
} from "./lib/connection-debug";
import { getOrCreateSessionId, getStoredName } from "./lib/session";
import { HomePage } from "./pages/HomePage";
import { HomePageStylePreview } from "./pages/HomePageStylePreview";
import { ImposterPage } from "./pages/ImposterPage";
import { PasswordBeginPage } from "./pages/PasswordBeginPage";
import { PasswordGamePage } from "./pages/PasswordGamePage";
import { PasswordResultsPage } from "./pages/PasswordResultsPage";
import { ChainReactionPage } from "./pages/ChainReactionPage";
import { ShadeSignalPage } from "./pages/ShadeSignalPage";

const sessionId = getOrCreateSessionId();
const API_METADATA_POLL_MS = 30_000;

const zeroCacheURL = import.meta.env.VITE_ZERO_CACHE_URL ?? "http://localhost:4848";
const presenceURL = import.meta.env.VITE_PRESENCE_WS_URL ?? "ws://localhost:3001/presence";
const apiInfoURL = resolveApiBuildInfoURL(
  import.meta.env.VITE_PRESENCE_WS_URL ?? "ws://localhost:3001/presence"
);

/**
 * Module-level Zero singleton — created exactly once per page load.
 * Never recreating it prevents ZeroProvider from resetting the mutation
 * counter, which would cause "Expected: N, got 0" push-processor errors.
 */
const zero = new Zero({
  userID: sessionId,
  cacheURL: zeroCacheURL,
  schema,
  mutators,
});

function resolveApiBuildInfoURL(presenceURL: string) {
  try {
    const parsed = new URL(presenceURL);
    const protocol = parsed.protocol === "wss:" ? "https:" : "http:";
    return `${protocol}//${parsed.host}/debug/build-info`;
  } catch {
    return "http://localhost:3001/debug/build-info";
  }
}

function stringifyError(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

export function App() {
  const styleOnly = import.meta.env.VITE_STYLE_ONLY === "true";

  useEffect(() => {
    const storedName = getStoredName();
    void zero.mutate(mutators.sessions.upsert({ id: sessionId, name: storedName || null }));
  }, []);

  useEffect(() => {
    initConnectionDebug({
      sessionId,
      zeroCacheURL,
      presenceURL,
      apiInfoURL
    });

    addConnectionDebugEvent({
      level: "info",
      source: "app",
      message: `boot (${import.meta.env.PROD ? "prod" : "dev"})`
    });

    return startGlobalConnectionDebugCapture();
  }, []);

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

    const mapAndTrack = (state: ConnectionState) => {
      setZeroConnectionState(state);
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
  }, []);

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
        <BrowserRouter>
          <Routes>
            <Route element={<AppShell />}>
              <Route path="/" element={<HomePage sessionId={sessionId} />} />
              <Route path="/imposter/:id" element={<ImposterPage sessionId={sessionId} />} />
              <Route path="/password/:id/begin" element={<PasswordBeginPage sessionId={sessionId} />} />
              <Route path="/password/:id" element={<PasswordGamePage sessionId={sessionId} />} />
              <Route path="/password/:id/results" element={<PasswordResultsPage sessionId={sessionId} />} />
              <Route path="/chain/:id" element={<ChainReactionPage sessionId={sessionId} />} />
              <Route path="/shade/:id" element={<ShadeSignalPage sessionId={sessionId} />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </BrowserRouter>
    </ZeroProvider>
  );
}
