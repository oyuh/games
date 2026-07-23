import "./styles/base.css";
import "./styles/components.css";
import "./styles/cursor.css";
import "./styles/themes.css";
import "./styles/responsive.css";
import "./mobile/mobile.css";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { getOrCreateSessionId, getStoredSessionProof } from "./lib/session";

const root = createRoot(document.getElementById("root")!);

// Mount immediately with whatever identity is already in localStorage (or a
// fresh one for first-timers). Session verification and the Zero auth upgrade
// happen in the background inside <App>, so the site is usable the instant the
// JS loads instead of waiting on the API or sync server to wake up. When the
// backend comes online, <App> swaps Zero to an authenticated client in place
// with no page reload. The service-status screen is still reachable at /status.
root.render(
  <StrictMode>
    <App initialSessionId={getOrCreateSessionId()} initialSessionProof={getStoredSessionProof()} />
  </StrictMode>
);
