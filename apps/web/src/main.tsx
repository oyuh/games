import "./styles/base.css";
import "./styles/components.css";
import "./styles/cursor.css";
import "./styles/themes.css";
import "./styles/responsive.css";
import "./mobile/mobile.css";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { BootStatusPage } from "./components/BootStatusPage";
import { getOrCreateSessionId, getStoredSessionProof, syncSessionIdentityForBoot } from "./lib/session";

const SYNC_FREE_BOOT_ROUTES = ["/shikaku", "/pips", "/admin"];
const API_REACHABILITY_TIMEOUT_MS = 4500;
const root = createRoot(document.getElementById("root")!);

function isSyncFreeBootRoute() {
  return SYNC_FREE_BOOT_ROUTES.some((prefix) => window.location.pathname.startsWith(prefix));
}

function renderBootStatus({
  apiBase,
  zeroCacheURL,
  sessionId,
  message
}: {
  apiBase: string;
  zeroCacheURL: string;
  sessionId: string;
  message?: string;
}) {
  root.render(
    <StrictMode>
      <BootStatusPage
        apiBase={apiBase}
        zeroCacheURL={zeroCacheURL}
        sessionId={sessionId}
        message={message}
        onRetry={() => window.location.reload()}
      />
    </StrictMode>
  );
}

function renderSessionFailure(message: string) {
  document.documentElement.setAttribute("data-custom-cursor", "off");

  root.render(
    <StrictMode>
      <div
        style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          padding: 24,
          background: "var(--bg)",
          color: "var(--foreground)",
          fontFamily: "Axiforma, system-ui, sans-serif",
        }}
      >
        <div style={{ maxWidth: 520, textAlign: "center" }}>
          <h1 style={{ fontSize: "1.6rem", marginBottom: 12 }}>Session verification failed</h1>
          <p style={{ lineHeight: 1.5, color: "var(--muted-foreground)", marginBottom: 20 }}>
            {message}
          </p>
          <button className="btn btn-primary" type="button" onClick={() => window.location.reload()}>
            Retry
          </button>
        </div>
      </div>
    </StrictMode>
  );
}

async function isApiReachable(apiBase: string) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), API_REACHABILITY_TIMEOUT_MS);

  try {
    const response = await fetch(`${apiBase}/debug/build-info`, {
      cache: "no-store",
      signal: controller.signal,
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    window.clearTimeout(timeout);
  }
}

async function bootstrap() {
  const styleOnly = import.meta.env.VITE_STYLE_ONLY === "true";
  const apiBase = import.meta.env.VITE_API_URL ?? "http://localhost:3001";
  const zeroCacheURL = import.meta.env.VITE_ZERO_CACHE_URL ?? "http://localhost:4848";
  let initialSessionId = getOrCreateSessionId();
  let initialSessionProof = getStoredSessionProof();

  if (!styleOnly && !isSyncFreeBootRoute()) {
    const apiReachable = await isApiReachable(apiBase);

    if (!apiReachable) {
      renderBootStatus({
        apiBase,
        zeroCacheURL,
        sessionId: initialSessionId,
        message: "The API is unreachable right now."
      });
      return;
    }

    try {
      const synced = await syncSessionIdentityForBoot(apiBase);
      initialSessionId = synced.sessionId;
      initialSessionProof = synced.zeroSessionProof;
    } catch (error) {
      const apiStillReachable = await isApiReachable(apiBase);
      if (apiStillReachable) {
        renderSessionFailure(error instanceof Error ? error.message : String(error));
        return;
      }

      renderBootStatus({
        apiBase,
        zeroCacheURL,
        sessionId: initialSessionId,
        message: error instanceof Error ? error.message : String(error)
      });
      return;
    }
  }

  root.render(
    <StrictMode>
      <App initialSessionId={initialSessionId} initialSessionProof={initialSessionProof} />
    </StrictMode>
  );
}

void bootstrap();
