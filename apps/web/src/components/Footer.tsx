import { useEffect, useState } from "react";
import { useConnectionDebug } from "../lib/connection-debug";

export function Footer() {
  const debug = useConnectionDebug();
  const [showUptime, setShowUptime] = useState(false);

  // Alternate between uptime and "updated" every 5s
  useEffect(() => {
    const timer = setInterval(() => setShowUptime((v) => !v), 5000);
    return () => clearInterval(timer);
  }, []);

  const isHealthy = debug.apiMetaState === "ok";

  const uptimeText = debug.apiUptimeMs != null
    ? formatUptime(debug.apiUptimeMs)
    : null;

  const updatedText = debug.apiCommitTimestamp
    ? `Updated ${relativeTime(debug.apiCommitTimestamp)}`
    : debug.apiBuildTimestamp
      ? `Built ${relativeTime(debug.apiBuildTimestamp)}`
      : null;

  const statusText = showUptime && uptimeText
    ? `Up ${uptimeText}`
    : updatedText ?? (isHealthy ? "Operational" : "Unreachable");

  return (
    <footer className="app-footer">
      <span className="app-footer-credit">
        Made with ❤️ by <a href="https://lawsonhart.me" target="_blank" rel="noopener noreferrer" className="app-footer-link">Lawson</a>
      </span>
      <span className="app-footer-dot">·</span>
      <span className="app-footer-status">
        <span
          className={`status-dot ${isHealthy ? "status-dot--ok" : "status-dot--err"}`}
        />
        <span className="app-footer-status-text">{statusText}</span>
      </span>
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
