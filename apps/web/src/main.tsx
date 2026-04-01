import "./styles/base.css";
import "./styles/components.css";
import "./styles/themes.css";
import "./styles/responsive.css";
import "./mobile/mobile.css";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { getOrCreateSessionId, getStoredSessionProof, syncSessionIdentity } from "./lib/session";

async function bootstrap() {
  const styleOnly = import.meta.env.VITE_STYLE_ONLY === "true";
  const apiBase = import.meta.env.VITE_API_URL ?? "http://localhost:3001";
  let initialSessionId = getOrCreateSessionId();
  let initialSessionProof = getStoredSessionProof();

  if (!styleOnly) {
    const synced = await syncSessionIdentity(apiBase, { allowCreate: true, reason: "app-boot" });
    initialSessionId = synced.sessionId;
    initialSessionProof = synced.zeroSessionProof;
  }

  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App initialSessionId={initialSessionId} initialSessionProof={initialSessionProof} />
    </StrictMode>
  );
}

void bootstrap();
