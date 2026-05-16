import { GAME_META, getGameSlugFromPath, type GameSlug } from "@games/shared";
import { FiX, FiZap, FiCopy, FiActivity, FiGithub, FiExternalLink } from "react-icons/fi";
import { useLocation } from "react-router-dom";
import { useState, useEffect, useSyncExternalStore, type ReactNode } from "react";
import { getOrCreateSessionId } from "../../lib/session";
import { useConnectionDebug } from "../../lib/connection-debug";
import { getCustomStatus, subscribeCustomStatus } from "../../hooks/useAdminBroadcast";
import { GameIcon } from "./GameIcon";

const GITHUB_REPO = "https://github.com/oyuh/games";

const siteInfo = {
  title: "Games",
  description: "A real-time multiplayer party game platform. Create or join lobbies, play with friends, and have fun - no accounts required.",
  version: "1.0",
  author: "Lawson",
};

interface PageInfo {
  title: string;
  description: string;
  icon: ReactNode;
  tips?: string[];
}

const pageTips: Record<GameSlug, string[]> = {
  home: [
    "Set your name before joining a game",
    "Use the join code to hop into a friend's lobby",
    "Configure game options before creating",
  ],
  imposter: [
    "Give a clue that proves you know the word without giving it away",
    "The imposter should try to blend in",
    "Review all clues carefully before voting",
  ],
  password: [
    "Clue givers: your clue must be exactly one word",
    "Guessers: type your best guess before time runs out",
    "Watch the scoreboard to track team progress",
  ],
  chain: [
    "Wrong guesses auto-reveal one letter as a hint",
    "Fewer hints used = more points per word",
    "Finish your chain first for a bonus point on the last word",
  ],
  shade: [
    "Leaders: describe the color without naming it directly",
    "Closer guesses earn more points",
    "Every player takes a turn as leader across rounds",
  ],
  location: [
    "Leaders: don't name the place directly",
    "You get clues to narrow it down",
    "Closer guesses score more points",
  ],
  shikaku: [
    "Drag to draw rectangles on the grid",
    "Each rectangle must contain exactly one number",
    "Complete all puzzles as fast as you can for a higher score",
  ],
  pips: [
    "Drag dominoes from the tray onto adjacent cells",
    "Click a domino or press R while holding it to rotate clockwise",
    "Ranked runs use Easy, Medium, and Hard splits; fastest total time ranks",
  ],
};

function getPageInfo(pathname: string): PageInfo {
  const slug = getGameSlugFromPath(pathname);

  if (slug === "home" && pathname !== "/") {
    return {
      title: "Page",
      icon: <GameIcon game="home" size={18} />,
      description: "You're on an unknown page.",
    };
  }

  const meta = GAME_META[slug];
  return {
    title: slug === "home" ? "Home" : meta.title,
    icon: <GameIcon game={slug} size={18} />,
    description: slug === "home"
      ? "Create a new game or join an existing one with a code. Set your display name so others can see you."
      : meta.description,
    tips: pageTips[slug],
  };
}

function useCustomStatus() {
  return useSyncExternalStore(subscribeCustomStatus, getCustomStatus);
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

export function InfoModal({ onClose }: { onClose: () => void }) {
  const location = useLocation();
  const page = getPageInfo(location.pathname);
  const sessionId = getOrCreateSessionId();
  const [copied, setCopied] = useState(false);
  const [showStatus, setShowStatus] = useState(false);

  const debug = useConnectionDebug();
  const customStatus = useCustomStatus();
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(timer);
  }, []);

  const dbState = debug.dbState;
  const apiOk = debug.apiMetaState === "ok";
  const dbOk = dbState === "ok";
  const allHealthy = apiOk && dbOk;
  const isLoading = dbState === "loading" || dbState === "idle";
  const uptimeText = debug.apiUptimeMs != null ? formatUptime(debug.apiUptimeMs + tick * 30_000) : null;
  const buildTime = debug.apiBuildTimestamp ? relativeTime(debug.apiBuildTimestamp) : null;
  const commitShort = debug.apiCommitSha ? debug.apiCommitSha.slice(0, 7) : null;
  const latency = debug.apiLatencyMs;

  const copySessionId = () => {
    void navigator.clipboard.writeText(sessionId).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <div
      className="modal-overlay"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}
      role="presentation"
    >
      <div className="modal-panel info-modal-panel">
        {/* Header */}
        <div className="modal-header">
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <GameIcon game="home" size={18} style={{ color: "var(--primary)" }} />
            <h2 className="modal-title">{siteInfo.title}</h2>
            <span className="info-version-badge">v{siteInfo.version}</span>
          </div>
          <button className="modal-close" onClick={onClose}>
            <FiX size={18} />
          </button>
        </div>

        <div className="modal-body info-modal-body">
          {/* Description */}
          <p className="info-site-desc">{siteInfo.description}</p>

          {/* Custom status banner */}
          {customStatus?.text && (
            <div className="info-custom-banner" style={{ borderColor: customStatus.color || "var(--primary)" }}>
              {customStatus.link ? (
                <a href={customStatus.link} target="_blank" rel="noopener noreferrer">{customStatus.text}</a>
              ) : customStatus.text}
            </div>
          )}

          {/* Current page context */}
          <div className="info-current-page">
            <div className="info-current-page-header">
              <span className="info-current-page-icon">{page.icon}</span>
              <h3>{page.title}</h3>
            </div>
            <p className="info-current-page-desc">{page.description}</p>
            {page.tips && page.tips.length > 0 && (
              <ul className="info-tips">
                {page.tips.map((tip, i) => (
                  <li key={`${page.title}-${tip}`} className="info-tip">
                    <FiZap size={11} className="info-tip-icon" />
                    {tip}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <hr className="info-divider" />

          {/* System Status */}
          <div className="info-block">
            <div className="info-status-header">
              <h3 className="info-section-title">
                <FiActivity size={14} />
                System Status
              </h3>
              <button className="info-status-badge" onClick={() => setShowStatus(!showStatus)}>
                <span className={`status-dot ${allHealthy ? "status-dot--ok" : isLoading ? "status-dot--loading" : "status-dot--err"}`} />
                {isLoading ? "Checking…" : allHealthy ? "All Systems OK" : "Issues Detected"}
              </button>
            </div>

            {showStatus && (
              <div className="info-status-details">
                <div className="info-status-row">
                  <span className="info-status-label">API</span>
                  <span className={`info-status-value ${apiOk ? "info-status-value--ok" : "info-status-value--err"}`}>
                    {apiOk ? "Online" : isLoading ? "Checking…" : "Offline"}
                  </span>
                </div>
                <div className="info-status-row">
                  <span className="info-status-label">Database</span>
                  <span className={`info-status-value ${dbOk ? "info-status-value--ok" : "info-status-value--err"}`}>
                    {dbOk ? "Connected" : isLoading ? "Checking…" : "Disconnected"}
                  </span>
                </div>
                {latency != null && (
                  <div className="info-status-row">
                    <span className="info-status-label">Latency</span>
                    <span className="info-status-value">{latency}ms</span>
                  </div>
                )}
                {uptimeText && (
                  <div className="info-status-row">
                    <span className="info-status-label">Uptime</span>
                    <span className="info-status-value">{uptimeText}</span>
                  </div>
                )}
                {buildTime && (
                  <div className="info-status-row">
                    <span className="info-status-label">Built</span>
                    <span className="info-status-value">{buildTime}</span>
                  </div>
                )}
                {commitShort && (
                  <div className="info-status-row">
                    <span className="info-status-label">Commit</span>
                    <a href={`${GITHUB_REPO}/commit/${debug.apiCommitSha}`} target="_blank" rel="noopener noreferrer" className="info-status-link">
                      {commitShort}
                    </a>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Session row */}
          <div className="info-session-row">
            <span className="info-session-label">Session</span>
            <code className="info-session-id">{sessionId}</code>
            <button className="info-session-copy" onClick={copySessionId} data-tooltip="Copy session ID">
              {copied ? "✓" : <FiCopy size={12} />}
            </button>
          </div>

          {/* Footer */}
          <div className="info-footer">
            <a href={GITHUB_REPO} target="_blank" rel="noopener noreferrer" className="info-footer-link">
              <FiGithub size={13} /> Source
              <FiExternalLink size={10} />
            </a>
            <span className="info-footer-sep">·</span>
            <span>
              Made with <span style={{ color: "#ef4444" }}>❤️</span> by{" "}
              <a href="https://lawsonhart.me" target="_blank" rel="noopener noreferrer" className="info-footer-author">Lawson</a>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
