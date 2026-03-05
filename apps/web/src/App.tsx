import { ZeroProvider } from "@rocicorp/zero/react";
import type { ConnectionState, Zero } from "@rocicorp/zero";
import { mutators, schema } from "@games/shared";
import { ThemeModeScript } from "flowbite-react";
import { useCallback, useEffect, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import {
  addConnectionDebugEvent,
  initConnectionDebug,
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

export function App() {
  const styleOnly = import.meta.env.VITE_STYLE_ONLY === "true";
  const zeroCacheURL = import.meta.env.VITE_ZERO_CACHE_URL ?? "http://localhost:4848";
  const presenceURL = import.meta.env.VITE_PRESENCE_WS_URL ?? "ws://localhost:3001/presence";
  const [zeroInstance, setZeroInstance] = useState<Zero | null>(null);

  useEffect(() => {
    initConnectionDebug({
      sessionId,
      zeroCacheURL,
      presenceURL
    });

    addConnectionDebugEvent({
      level: "info",
      source: "app",
      message: `boot (${import.meta.env.PROD ? "prod" : "dev"})`
    });

    return startGlobalConnectionDebugCapture();
  }, [presenceURL, zeroCacheURL]);

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
      <>
        <ThemeModeScript />
        <BrowserRouter>
          <Routes>
            <Route element={<AppShell />}>
              <Route path="*" element={<HomePageStylePreview />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </>
    );
  }

  return (
    <>
      <ThemeModeScript />
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
    </>
  );
}
