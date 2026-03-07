import { useEffect, useState } from "react";
import { useConnectionDebug } from "../lib/connection-debug";

const GITHUB_REPO = "https://github.com/oyuh/games";

export function Footer() {
  const debug = useConnectionDebug();
  const [expanded, setExpanded] = useState(false);
  const [tick, setTick] = useState(0);

  // Tick every 30s to keep uptime fresh
  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(timer);
  }, []);

  const isHealthy = debug.apiMetaState === "ok";
  const isLoading = debug.apiMetaState === "loading" || debug.apiMetaState === "idle";

  const uptimeText = debug.apiUptimeMs != null
    ? formatUptime(debug.apiUptimeMs + tick * 30_000)
    : null;

  const commitShort = debug.apiCommitSha ? debug.apiCommitSha.slice(0, 7) : null;
  const commitMsg = debug.apiCommitMessage || null;
  const latency = debug.apiLatencyMs != null ? `${debug.apiLatencyMs}ms` : null;

  const statusLabel = isLoading
    ? "Connecting…"
    : isHealthy
      ? "Operational"
      : "Unreachable";

  return (
    <footer className="app-footer">
      <div className="footer-row footer-row--main">
        <span className="footer-credit">
          Made with <span className="footer-heart">❤️</span> by{" "}
          <a href="https://lawsonhart.me" target="_blank" rel="noopener noreferrer" className="footer-link">
            Lawson
          </a>
        </span>
        <div className="footer-status-wrap">
          <button
            className="footer-status-pill"
            onClick={() => setExpanded((v) => !v)}
            title="Toggle API status"
          >
            <span className={`status-dot ${isHealthy ? "status-dot--ok" : isLoading ? "status-dot--loading" : "status-dot--err"}`} />
            <span className="footer-status-label">{statusLabel}</span>
          </button>

          {expanded && (
            <div className="footer-details">
          <div className="footer-detail-grid">
            <span className="footer-detail-key">status</span>
            <span className={`footer-detail-val ${isHealthy ? "footer-val--ok" : "footer-val--err"}`}>
              {statusLabel}
            </span>

            {uptimeText && (
              <>
                <span className="footer-detail-key">uptime</span>
                <span className="footer-detail-val">{uptimeText}</span>
              </>
            )}

            {latency && (
              <>
                <span className="footer-detail-key">latency</span>
                <span className="footer-detail-val">{latency}</span>
              </>
            )}

            {debug.apiPlatform && (
              <>
                <span className="footer-detail-key">platform</span>
                <span className="footer-detail-val">{debug.apiPlatform}</span>
              </>
            )}

            {commitShort && (
              <>
                <span className="footer-detail-key">commit</span>
                <a
                  className="footer-detail-val footer-val--mono footer-val--link"
                  href={`${GITHUB_REPO}/commit/${debug.apiCommitSha}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {commitShort}
                </a>
              </>
            )}

            {commitMsg && (
              <>
                <span className="footer-detail-key">message</span>
                <a
                  className="footer-detail-val footer-val--msg footer-val--link"
                  href={`${GITHUB_REPO}/commit/${debug.apiCommitSha}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {commitMsg}
                </a>
              </>
            )}

            {debug.apiCommitRef && (
              <>
                <span className="footer-detail-key">branch</span>
                <span className="footer-detail-val">{debug.apiCommitRef}</span>
              </>
            )}

            {debug.apiUpdatedAt && (
              <>
                <span className="footer-detail-key">deployed</span>
                <span className="footer-detail-val">{relativeTime(debug.apiUpdatedAt)}</span>
              </>
            )}
            </div>
          </div>
        )}
        </div>
      </div>
    </footer>
  );
}

function formatUptime(ms: number) {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainMinutes = minutes % 60;
  if (hours < 24) return `${hours}h ${remainMinutes}m`;
  const days = Math.floor(hours / 24);
  const remainHours = hours % 24;
  return `${days}d ${remainHours}h`;
}

function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
