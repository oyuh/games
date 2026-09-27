import { useEffect, useState, type ReactNode } from "react";
import { FiDatabase, FiExternalLink, FiHome, FiRadio, FiRefreshCw, FiServer, FiShield, FiWifi, FiZap } from "react-icons/fi";
import { Link } from "react-router-dom";
import {
  formatUptime,
  overallTone,
  probeApiMetadata,
  relativeTime,
  useConnectionDebug,
  type ConnectionDebugState,
  type ServiceTone
} from "../lib/connection-debug";
import { getStoredSessionProof } from "../lib/session";
import { useSyncElapsedSeconds } from "../lib/sync-wake";
import { showToast } from "../lib/toast";
import "../styles/game-shared.css";
import "../styles/status.css";

const GITHUB_REPO = "https://github.com/oyuh/games";

type RowTone = ServiceTone | "idle";

type ServiceRow = {
  name: string;
  icon: ReactNode;
  tone: RowTone;
  label: string;
  detail: string;
};

function headline(debug: ConnectionDebugState, tone: ServiceTone) {
  if (!debug.isOnline) return "You're offline. Solo games still work, everything else waits for a connection.";
  if (tone === "loading") return "Checking in with the servers.";
  if (tone === "ok") return "Everything's up and talking to each other.";
  if (tone === "partial") {
    return "The games work, sync is still waking up. Your moves save here and send once it's awake.";
  }
  if (debug.apiMetaState !== "ok") return "The server isn't answering. Solo games still work while it comes back.";
  return "The server is up but can't reach its database, so multiplayer is stuck for now.";
}

function syncRow(debug: ConnectionDebugState, wakeSeconds: number | null): Omit<ServiceRow, "name" | "icon"> {
  const reason = debug.zeroReason;
  switch (debug.zeroState) {
    case "connected":
      return { tone: "ok", label: "Connected", detail: "Game state syncs live between players." };
    case "connecting":
      return {
        tone: "partial",
        label: "Waking up",
        detail: wakeSeconds
          ? `Trying for ${wakeSeconds}s. It sleeps when it's quiet, so the first connect can take a minute.`
          : "It sleeps when it's quiet, so the first connect can take a minute."
      };
    case "needs-auth":
      return { tone: "err", label: "Needs auth", detail: reason || "The sync server didn't accept this session." };
    case "disconnected":
      return { tone: "err", label: "Offline", detail: reason || "Gave up connecting. A fresh client is on its way." };
    case "error":
      return { tone: "err", label: "Error", detail: reason || "The sync client hit an error." };
    case "closed":
      return { tone: "idle", label: "Closed", detail: "The sync client was shut down." };
    default:
      return { tone: "loading", label: "Checking", detail: "Waiting on the sync client." };
  }
}

function buildRows(debug: ConnectionDebugState, wakeSeconds: number | null, hasProof: boolean): ServiceRow[] {
  const apiDown = debug.apiMetaState === "error";

  return [
    {
      name: "Your connection",
      icon: <FiWifi />,
      ...(debug.isOnline
        ? { tone: "ok", label: "Online", detail: "Your browser has a network connection." }
        : { tone: "err", label: "Offline", detail: "Your browser says there's no network." })
    },
    {
      name: "API",
      icon: <FiServer />,
      ...(debug.apiMetaState === "ok"
        ? {
            tone: "ok",
            label: "Online",
            detail: debug.apiPlatform && debug.apiPlatform !== "unknown"
              ? `Answering from ${debug.apiPlatform}.`
              : "Answering requests."
          }
        : apiDown
          ? { tone: "err", label: "Offline", detail: debug.apiMetaReason || "Didn't answer." }
          : { tone: "loading", label: "Checking", detail: "Asking for build info." })
    },
    {
      name: "Database",
      icon: <FiDatabase />,
      ...(apiDown
        ? { tone: "idle", label: "Unknown", detail: "The API checks it, so this waits on the API." }
        : debug.dbState === "ok"
          ? { tone: "ok", label: "Connected", detail: "The API can read from it." }
          : debug.dbState === "offline"
            ? { tone: "err", label: "Offline", detail: debug.dbReason || "The API can't reach it." }
            : debug.dbState === "unknown"
              ? { tone: "partial", label: "Degraded", detail: debug.dbReason || "Reachable, but the health row looks off." }
              : { tone: "loading", label: "Checking", detail: "Waiting on the API." })
    },
    { name: "Multiplayer sync", icon: <FiZap />, ...syncRow(debug, wakeSeconds) },
    {
      name: "Live events",
      icon: <FiRadio />,
      ...(debug.presenceState === "connected"
        ? { tone: "ok", label: "Connected", detail: "Chat and live game events are flowing." }
        : debug.presenceState === "error"
          ? { tone: "err", label: "Reconnecting", detail: debug.presenceReason || "The socket dropped." }
          : { tone: "loading", label: "Connecting", detail: "Opening the realtime socket." })
    },
    {
      name: "Session",
      icon: <FiShield />,
      ...(hasProof
        ? { tone: "ok", label: "Verified", detail: "The server signed this session, so your games follow you." }
        : {
            tone: "partial",
            label: "Guest",
            detail: "Not signed by the server yet. That happens on its own once the API answers."
          })
    }
  ];
}

export function StatusPage() {
  const debug = useConnectionDebug();
  const wakeSeconds = useSyncElapsedSeconds();
  const [checking, setChecking] = useState(false);
  // Re-render once a second so "checked 4s ago" and uptime keep moving.
  const [, setNow] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  const tone = overallTone(debug);
  const rows = buildRows(debug, wakeSeconds, Boolean(getStoredSessionProof()));
  const checkedAgo = debug.apiMetaCheckedAt
    ? Math.max(0, Math.round((Date.now() - new Date(debug.apiMetaCheckedAt).getTime()) / 1000))
    : null;
  const uptimeMs = debug.apiUptimeMs != null && debug.apiMetaCheckedAt
    ? debug.apiUptimeMs + (Date.now() - new Date(debug.apiMetaCheckedAt).getTime())
    : null;
  const commitShort = debug.apiCommitSha.slice(0, 7);
  const events = debug.events.slice(0, 10);

  const checkNow = async () => {
    setChecking(true);
    await probeApiMetadata();
    setChecking(false);
  };

  const copySessionId = () => {
    void navigator.clipboard.writeText(debug.sessionId)
      .then(() => showToast("Session id copied", "info"))
      .catch(() => showToast("Couldn't copy it", "error"));
  };

  return (
    <main className="solo-menu status-page">
      <header className="solo-menu-hero">
        <h1 className="solo-menu-title">Status</h1>
        <p className={`status-verdict status-tone--${tone}`} role="status" aria-live="polite">
          {headline(debug, tone)}
        </p>
      </header>

      <section className="status-block" aria-label="Services">
        <ul className="status-list">
          {rows.map((row) => (
            <li className={`status-row status-tone--${row.tone}`} key={row.name}>
              <span className="status-row-head">
                <span className="status-row-icon" aria-hidden="true">{row.icon}</span>
                <span className="status-row-name">{row.name}</span>
                <span className="status-row-state">
                  <span className="status-dot" aria-hidden="true" />
                  {row.label}
                </span>
              </span>
              <span className="status-row-detail">{row.detail}</span>
            </li>
          ))}
        </ul>
        <div className="solo-drawer status-drawer">
          <span className="status-drawer-facts">
            <span>{checkedAgo == null ? "Not checked yet" : `Checked ${checkedAgo}s ago`}</span>
            {debug.apiLatencyMs != null && debug.apiMetaState === "ok" && <span>{debug.apiLatencyMs}ms round trip</span>}
            {uptimeMs != null && debug.apiMetaState === "ok" && <span>Up {formatUptime(uptimeMs)}</span>}
          </span>
          <button className="status-check" type="button" onClick={() => void checkNow()} disabled={checking}>
            <FiRefreshCw className={checking ? "status-spin" : undefined} size={15} aria-hidden="true" />
            {checking ? "Checking" : "Check again"}
          </button>
        </div>
      </section>

      <div className="status-lower">
        <section className="status-section" aria-labelledby="status-details-title">
          <h2 className="status-section-title" id="status-details-title">Details</h2>
          <dl className="status-facts">
            <div>
              <dt>API</dt>
              <dd><code>{debug.apiBaseURL}</code></dd>
            </div>
            <div>
              <dt>Sync server</dt>
              <dd><code>{debug.zeroCacheURL}</code></dd>
            </div>
            <div>
              <dt>Session</dt>
              <dd>
                <button className="status-copy" type="button" onClick={copySessionId} title="Copy session id">
                  <code>{debug.sessionId}</code>
                </button>
              </dd>
            </div>
            {commitShort && (
              <div>
                <dt>Deploy</dt>
                <dd>
                  <a className="status-link" href={`${GITHUB_REPO}/commit/${debug.apiCommitSha}`} target="_blank" rel="noreferrer">
                    <code>{commitShort}</code>
                    {debug.apiCommitMessage && <span className="status-commit-msg">{debug.apiCommitMessage}</span>}
                  </a>
                </dd>
              </div>
            )}
            {(debug.apiBuildTimestamp || debug.apiCommitRef) && (
              <div>
                <dt>Built</dt>
                <dd>
                  {[debug.apiBuildTimestamp && relativeTime(debug.apiBuildTimestamp), debug.apiCommitRef]
                    .filter(Boolean)
                    .join(" from ")}
                </dd>
              </div>
            )}
          </dl>
        </section>

        <section className="status-section" aria-labelledby="status-events-title">
          <h2 className="status-section-title" id="status-events-title">Recent events</h2>
          {events.length === 0 ? (
            <p className="status-empty">Nothing yet.</p>
          ) : (
            <ol className="status-events">
              {events.map((event) => (
                <li className={`status-event status-event--${event.level}`} key={event.id}>
                  <time dateTime={event.at}>
                    {new Date(event.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" })}
                  </time>
                  <span className="status-event-source">{event.source}</span>
                  <span className="status-event-msg" title={event.details}>
                    {event.message}
                    {event.details && <span className="status-event-details"> {event.details}</span>}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>

      <nav className="solo-menu-links" aria-label="Elsewhere">
        <Link className="solo-menu-link" to="/"><FiHome size={14} aria-hidden="true" /> Home</Link>
        <Link className="solo-menu-link" to="/pips">Pips</Link>
        <Link className="solo-menu-link" to="/shikaku">Shikaku</Link>
        {debug.apiInfoURL && (
          <a className="solo-menu-link" href={debug.apiInfoURL} target="_blank" rel="noreferrer">
            Raw API response <FiExternalLink size={13} aria-hidden="true" />
          </a>
        )}
      </nav>
    </main>
  );
}
