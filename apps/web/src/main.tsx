import "./styles/base.css";
import "./styles/components.css";
import "./styles/cursor.css";
import "./styles/themes.css";
import "./styles/responsive.css";
import "./mobile/mobile.css";

import * as Sentry from "@sentry/react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { getOrCreateSessionId, getStoredSessionProof } from "./lib/session";

// No DSN locally, so dev errors stay out of the Sentry quota.
const sentryEnabled = !!import.meta.env.VITE_SENTRY_DSN;
if (sentryEnabled) {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    environment: import.meta.env.MODE
  });
}

// Replacing React's error hooks drops its default console logging, so log too.
const sentryReactHandler = Sentry.reactErrorHandler((error) => console.error(error));
const reportReactError = (error: unknown, info: { componentStack?: string | undefined }) =>
  sentryReactHandler(error, { componentStack: info.componentStack ?? null });

// A lazy chunk failed to load (flaky mobile network, a deploy swapped the
// hashed assets out from under an open tab, or Safari holding a bad cached
// copy that survives plain reloads). Refetch the page's assets past the HTTP
// cache, then reload once. The timestamp guard stops a reload loop if the
// chunk is truly gone; in that case the error falls through to the ErrorBoundary.
window.addEventListener("vite:preloadError", (event) => {
  const key = "chunk-reload-at";
  try {
    if (Date.now() - Number(sessionStorage.getItem(key) ?? 0) < 10_000) return;
    sessionStorage.setItem(key, String(Date.now()));
  } catch {
    return;
  }
  event.preventDefault();
  const assets = [...document.querySelectorAll<HTMLLinkElement>('link[href*="/assets/"]')].map((link) => link.href);
  void Promise.allSettled(assets.map((href) => fetch(href, { cache: "reload" }))).then(() => window.location.reload());
});

// React 19 hands errors to these hooks, including ones our ErrorBoundary
// catches, so crashes reach Sentry without touching the boundary.
const root = createRoot(
  document.getElementById("root")!,
  sentryEnabled
    ? { onUncaughtError: reportReactError, onCaughtError: reportReactError, onRecoverableError: reportReactError }
    : {}
);

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
