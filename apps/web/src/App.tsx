import { ZeroProvider } from "@rocicorp/zero/react";
import type { ConnectionState, Zero } from "@rocicorp/zero";
import { mutators, schema } from "@games/shared";
import { useCallback, useEffect, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import {
  addConnectionDebugEvent,
  initConnectionDebug,
  setApiBuildInfo,
  setApiConnectionProbe,
  setZeroConnectionState,
  startGlobalConnectionDebugCapture
} from "./lib/connection-debug";
import { getOrCreateSessionId } from "./lib/session";
import { HomePage } from "./pages/HomePage";
import { HomePageStylePreview } from "./pages/HomePageStylePreview";
import { ImposterPage } from "./pages/ImposterPage";
import { PasswordBeginPage } from "./pages/PasswordBeginPage";
import { PasswordGamePage } from "./pages/PasswordGamePage";
import { PasswordResultsPage } from "./pages/PasswordResultsPage";

const sessionId = getOrCreateSessionId();
const API_METADATA_POLL_MS = 30_000;

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
  const zeroCacheURL = import.meta.env.VITE_ZERO_CACHE_URL ?? "http://localhost:4848";
  const presenceURL = import.meta.env.VITE_PRESENCE_WS_URL ?? "ws://localhost:3001/presence";
  const apiInfoURL = resolveApiBuildInfoURL(presenceURL);
  const [zeroInstance, setZeroInstance] = useState<Zero | null>(null);

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
  }, [apiInfoURL, presenceURL, zeroCacheURL]);

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
    if (!zeroInstance) {
      return;
    }

    const mapAndTrack = (state: ConnectionState) => {
      setZeroConnectionState(state);
    };

    mapAndTrack(zeroInstance.connection.state.current);

    const unsubscribeConnection = zeroInstance.connection.state.subscribe(mapAndTrack);
    const unsubscribeOnline = zeroInstance.onOnline((online) => {
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
  }, [zeroInstance]);

  const initZero = useCallback((zero: Zero) => {
    setZeroInstance(zero);
    addConnectionDebugEvent({
      level: "info",
      source: "zero",
      message: "Zero client initialized"
    });
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
    <ZeroProvider
        init={initZero}
        userID={sessionId}
        cacheURL={zeroCacheURL}
        schema={schema}
        mutators={mutators}
      >
        <BrowserRouter>
          <Routes>
            <Route element={<AppShell />}>
              <Route path="/" element={<HomePage sessionId={sessionId} />} />
              <Route path="/imposter/:id" element={<ImposterPage sessionId={sessionId} />} />
              <Route path="/password/:id/begin" element={<PasswordBeginPage sessionId={sessionId} />} />
              <Route path="/password/:id" element={<PasswordGamePage sessionId={sessionId} />} />
              <Route path="/password/:id/results" element={<PasswordResultsPage sessionId={sessionId} />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </BrowserRouter>
    </ZeroProvider>
  );
}
