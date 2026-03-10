import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useConnectionDebug } from "../lib/connection-debug";
import { getCustomStatus, subscribeCustomStatus } from "../hooks/useAdminBroadcast";

const GITHUB_REPO = "https://github.com/oyuh/games";

function useCustomStatus() {
  return useSyncExternalStore(subscribeCustomStatus, getCustomStatus);
}

export function Footer() {
  const debug = useConnectionDebug();
  const customStatus = useCustomStatus();
  const [expanded, setExpanded] = useState(false);
  const [tick, setTick] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Tick every 30s to keep uptime fresh
  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(timer);
  }, []);

  // Close on click outside
  useEffect(() => {
    if (!expanded) return;
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setExpanded(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [expanded]);

  const dbState = debug.dbState;
  const apiOk = debug.apiMetaState === "ok";
  const dbOk = dbState === "ok";
  const allHealthy = apiOk && dbOk;
  const isLoading = dbState === "loading" || dbState === "idle";

  const uptimeText = debug.apiUptimeMs != null
    ? formatUptime(debug.apiUptimeMs + tick * 30_000)
    : null;

  const buildTime = debug.apiBuildTimestamp
    ? relativeTime(debug.apiBuildTimestamp)
    : null;

  const commitShort = debug.apiCommitSha ? debug.apiCommitSha.slice(0, 7) : null;
  const commitMsg = debug.apiCommitMessage || null;
  const latency = debug.apiLatencyMs;

  const overallLabel = isLoading
    ? "Checking…"
    : allHealthy
      ? "All Systems Operational"
      : "Issues Detected";

  // Render custom status with link, color, flash
  function renderCustomStatus() {
    if (!customStatus || !customStatus.text) return null;
    const style: React.CSSProperties = {};
    if (customStatus.color) style.color = customStatus.color;
    let className = "footer-custom-status";
    if (customStatus.flash) className += " footer-custom-status--flash";
    const content = customStatus.link ? (
      <a href={customStatus.link} target="_blank" rel="noopener noreferrer" style={{ color: style.color || undefined, textDecoration: "underline" }}>
        {customStatus.text}
      </a>
    ) : (
      customStatus.text
    );
    return (
      <div className="footer-row footer-row--status">
        <span className={className} style={style}>{content}</span>
      </div>
    );
  }
  return (
    <footer className="app-footer">
      {renderCustomStatus()}
      <div className="footer-row footer-row--main">
        <span className="footer-credit">
          Made with <span className="footer-heart">❤️</span> by{" "}
          <a href="https://lawsonhart.me" target="_blank" rel="noopener noreferrer" className="footer-link">
            Lawson
          </a>
        </span>
        <div className="footer-status-wrap" ref={wrapRef}>
          <button
            className="footer-status-pill"
            onClick={() => setExpanded((v) => !v)}
            data-tooltip="Toggle service status"
          >
            <span className={`status-dot ${allHealthy ? "status-dot--ok" : isLoading ? "status-dot--loading" : "status-dot--err"}`} />
            <span className="footer-status-label">{isLoading ? "Checking…" : allHealthy ? "Operational" : "Issues"}</span>
            {latency != null && <span className="footer-latency">{latency}ms</span>}
          </button>

          {expanded && (
            <div className="footer-popover">
              {/* Overall status bar */}
              <div className={`fp-status-bar ${allHealthy ? "fp-status-bar--ok" : isLoading ? "fp-status-bar--loading" : "fp-status-bar--err"}`}>
                <span className={`status-dot ${allHealthy ? "status-dot--ok" : isLoading ? "status-dot--loading" : "status-dot--err"}`} />
                <span>{overallLabel}</span>
              </div>

              {/* Service rows */}
              <div className="fp-services">
                <div className="fp-service">
                  <span className="fp-service-name">API</span>
                  <span className={`fp-service-badge ${apiOk ? "fp-badge--ok" : isLoading ? "fp-badge--loading" : "fp-badge--err"}`}>
                    {apiOk ? "Online" : isLoading ? "Checking" : "Offline"}
                  </span>
                </div>
                <div className="fp-service">
                  <span className="fp-service-name">Database</span>
                  <span className={`fp-service-badge ${dbOk ? "fp-badge--ok" : isLoading ? "fp-badge--loading" : "fp-badge--err"}`}>
                    {dbOk ? "Connected" : isLoading ? "Checking" : "Disconnected"}
                  </span>
                </div>
              </div>

              {/* Info section */}
              <div className="fp-info">
                {latency != null && (
                  <div className="fp-info-row">
                    <span className="fp-info-label">Latency</span>
                    <span className="fp-info-value">{latency}ms</span>
                  </div>
                )}
                {uptimeText && (
                  <div className="fp-info-row">
                    <span className="fp-info-label">Uptime</span>
                    <span className="fp-info-value">{uptimeText}</span>
                  </div>
                )}
                {buildTime && (
                  <div className="fp-info-row">
                    <span className="fp-info-label">Built</span>
                    <span className="fp-info-value">{buildTime}</span>
                  </div>
                )}
                {commitShort && (
                  <div className="fp-info-row">
                    <span className="fp-info-label">Commit</span>
                    <a
                      className="fp-info-value fp-commit-link"
                      href={`${GITHUB_REPO}/commit/${debug.apiCommitSha}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <code className="fp-commit-hash">{commitShort}</code>
                      {commitMsg && <span className="fp-commit-msg">{commitMsg}</span>}
                    </a>
                  </div>
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
