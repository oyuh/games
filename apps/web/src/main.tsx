import "./styles/base.css";
import "./styles/components.css";
import "./styles/themes.css";
import "./styles/responsive.css";
import "./mobile/mobile.css";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { getOrCreateSessionId, getStoredSessionProof, syncSessionIdentityForBoot } from "./lib/session";

function renderBootstrapFailure(message: string) {
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <div
        style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          padding: 24,
          background: "#0d1117",
          color: "#f0f6fc",
          fontFamily: "monospace",
        }}
      >
        <div style={{ maxWidth: 520, textAlign: "center" }}>
          <h1 style={{ fontSize: "1.35rem", marginBottom: 12 }}>Session verification failed</h1>
          <p style={{ lineHeight: 1.5, opacity: 0.85, marginBottom: 20 }}>
            {message} The API may still be starting up. Retry once it is reachable.
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: "10px 18px",
              borderRadius: 999,
              border: "1px solid rgba(240, 246, 252, 0.2)",
              background: "#238636",
              color: "#f0f6fc",
              cursor: "pointer",
            }}
          >
            Retry
          </button>
        </div>
      </div>
    </StrictMode>
  );
}

async function bootstrap() {
  const styleOnly = import.meta.env.VITE_STYLE_ONLY === "true";
  const apiBase = import.meta.env.VITE_API_URL ?? "http://localhost:3001";
  let initialSessionId = getOrCreateSessionId();
  let initialSessionProof = getStoredSessionProof();

  if (!styleOnly) {
    try {
      const synced = await syncSessionIdentityForBoot(apiBase);
      initialSessionId = synced.sessionId;
      initialSessionProof = synced.zeroSessionProof;
    } catch (error) {
      renderBootstrapFailure(error instanceof Error ? error.message : String(error));
      return;
    }
  }

  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App initialSessionId={initialSessionId} initialSessionProof={initialSessionProof} />
    </StrictMode>
  );
}

void bootstrap();
