import { useLocation } from "react-router-dom";
import { FiZap, FiCopy, FiEye, FiShield, FiLink, FiDroplet, FiMapPin, FiGrid, FiActivity, FiGithub, FiExternalLink } from "react-icons/fi";
import { useState, useEffect, useSyncExternalStore, type ReactNode } from "react";
import { getOrCreateSessionId } from "../../lib/session";
import { BottomSheet } from "./BottomSheet";
import { ImposterDemo } from "../../components/demos/ImposterDemo";
import { PasswordDemo } from "../../components/demos/PasswordDemo";
import { ChainDemo } from "../../components/demos/ChainDemo";
import { ShadeDemo } from "../../components/demos/ShadeDemo";
import { LocationDemo } from "../../components/demos/LocationDemo";
import { ShikakuDemo } from "../../components/demos/ShikakuDemo";
import { useConnectionDebug } from "../../lib/connection-debug";
import { getCustomStatus, subscribeCustomStatus } from "../../hooks/useAdminBroadcast";

const GITHUB_REPO = "https://github.com/oyuh/games";

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

function getGameType(pathname: string): "imposter" | "password" | "chain" | "shade" | "location" | "shikaku" | null {
  if (pathname.startsWith("/imposter/")) return "imposter";
  if (pathname.startsWith("/password/")) return "password";
  if (pathname.startsWith("/chain/")) return "chain";
  if (pathname.startsWith("/shade/")) return "shade";
  if (pathname.startsWith("/location/")) return "location";
  if (/^\/shikaku(\/|$)/.test(pathname)) return "shikaku";
  return null;
}

export function MobileInfoSheet({ onClose }: { onClose: () => void }) {
  const location = useLocation();
  const sessionId = getOrCreateSessionId();
  const [copied, setCopied] = useState(false);
  const page = getPageInfo(location.pathname);
  const gameType = getGameType(location.pathname);
  const [showDemo, setShowDemo] = useState(false);
  const [showSystemText, setShowSystemText] = useState(false);

  // System status
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

  const uptimeText = debug.apiUptimeMs != null
    ? formatUptime(debug.apiUptimeMs + tick * 30_000)
    : null;
  const buildTime = debug.apiBuildTimestamp ? relativeTime(debug.apiBuildTimestamp) : null;
  const commitShort = debug.apiCommitSha ? debug.apiCommitSha.slice(0, 7) : null;
  const latency = debug.apiLatencyMs;
  const overallLabel = isLoading ? "Checking…" : allHealthy ? "All Systems Operational" : "Issues Detected";

  const copySessionId = () => {
    void navigator.clipboard.writeText(sessionId).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  if (showDemo && gameType) {
    if (gameType === "imposter") return <ImposterDemo onClose={onClose} />;
    if (gameType === "password") return <PasswordDemo onClose={onClose} />;
    if (gameType === "chain") return <ChainDemo onClose={onClose} />;
    if (gameType === "shade") return <ShadeDemo onClose={onClose} />;
    if (gameType === "location") return <LocationDemo onClose={onClose} />;
    if (gameType === "shikaku") return <ShikakuDemo onClose={onClose} />;
  }

  return (
    <BottomSheet title="Info" onClose={onClose}>
      {/* Site description */}
      <p className="m-info-site-desc">
        A real-time multiplayer party game platform. No accounts — just create or join a game and play.
      </p>

      {/* Custom status banner */}
      {customStatus?.text && (
        <div className="m-info-custom-banner" style={{ borderColor: customStatus.color || "var(--primary)" }}>
          {customStatus.link ? (
            <a href={customStatus.link} target="_blank" rel="noopener noreferrer">{customStatus.text}</a>
          ) : customStatus.text}
        </div>
      )}

      {/* Current page context */}
      <div className="m-info-current-page">
        <div className="m-info-current-page-header">
          <span className="m-info-current-page-icon">{page.icon}</span>
          <h3>{page.title}</h3>
        </div>
        <p className="m-info-current-page-desc">{page.description}</p>
        {page.tips && page.tips.length > 0 && (
          <ul className="m-info-tips">
            {page.tips.map((tip, i) => (
              <li key={i} className="m-info-tip">
                <FiZap size={10} style={{ flexShrink: 0, opacity: 0.6 }} />
                {tip}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* How to Play button on game pages */}
      {gameType && (
        <button
          className="m-btn m-btn--primary"
          style={{ width: "100%", marginTop: 12, marginBottom: 4 }}
          onClick={() => setShowDemo(true)}
        >
          How to Play
        </button>
      )}

      <div className="m-info-divider" />

      {/* Game catalog */}
      <h4 className="m-info-section-title">Games</h4>
      <div className="m-info-game-list">
        {GAME_CATALOG.map((g) => (
          <div key={g.key} className="m-info-game-row">
            <div className="m-info-game-icon" style={{ background: `color-mix(in srgb, ${g.color} 15%, transparent)`, color: g.color }}>
              {g.icon}
            </div>
            <div className="m-info-game-body">
              <div className="m-info-game-name-row">
                <span className="m-info-game-name">{g.name}</span>
                <span className="m-info-game-players">{g.players}</span>
              </div>
              <span className="m-info-game-desc">{g.description}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="m-info-divider" />

      {/* System Status */}
      <div className="m-info-status-header">
        <h4 className="m-info-section-title" style={{ margin: 0 }}>
          <FiActivity size={12} />
          System Status
        </h4>
        <button className="m-info-status-badge" onClick={() => setShowSystemText(!showSystemText)}>
          <span className={`status-dot ${allHealthy ? "status-dot--ok" : isLoading ? "status-dot--loading" : "status-dot--err"}`} />
          {overallLabel}
        </button>
      </div>

      {showSystemText && (
        <div className="m-info-status-details">
          <div className="m-info-status-row">
            <span>API</span>
            <span className={apiOk ? "m-info-status--ok" : "m-info-status--err"}>
              {apiOk ? "Online" : isLoading ? "Checking…" : "Offline"}
            </span>
          </div>
          <div className="m-info-status-row">
            <span>Database</span>
            <span className={dbOk ? "m-info-status--ok" : "m-info-status--err"}>
              {dbOk ? "Connected" : isLoading ? "Checking…" : "Disconnected"}
            </span>
          </div>
          {latency != null && (
            <div className="m-info-status-row">
              <span>Latency</span>
              <span>{latency}ms</span>
            </div>
          )}
          {uptimeText && (
            <div className="m-info-status-row">
              <span>Uptime</span>
              <span>{uptimeText}</span>
            </div>
          )}
          {buildTime && (
            <div className="m-info-status-row">
              <span>Built</span>
              <span>{buildTime}</span>
            </div>
          )}
          {commitShort && (
            <div className="m-info-status-row">
              <span>Commit</span>
              <a href={`${GITHUB_REPO}/commit/${debug.apiCommitSha}`} target="_blank" rel="noopener noreferrer" className="m-info-commit-link">
                {commitShort}
              </a>
            </div>
          )}
        </div>
      )}

      {/* Session */}
      <div className="m-info-session">
        <span className="m-info-session-label">Session</span>
        <code className="m-info-session-id">{sessionId.slice(0, 12)}…</code>
        <button className="m-info-session-copy" onClick={copySessionId}>
          {copied ? "✓" : <FiCopy size={12} />}
        </button>
      </div>

      {/* Footer */}
      <div className="m-info-footer">
        <a href={GITHUB_REPO} target="_blank" rel="noopener noreferrer" className="m-info-footer-link">
          <FiGithub size={12} /> Source <FiExternalLink size={9} />
        </a>
        <span className="m-info-footer-sep">·</span>
        <span>
          Made with <span style={{ color: "#ef4444" }}>❤️</span>{" "}
          by <a href="https://lawsonhart.me" target="_blank" rel="noopener noreferrer" className="m-info-footer-author">Lawson</a>
        </span>
      </div>
    </BottomSheet>
  );
}

const GAME_CATALOG = [
  { key: "imposter", name: "Imposter", icon: <FiEye size={14} />, color: "#7eb8ff", players: "3–12", description: "Find the fake — everyone gives clues, then votes" },
  { key: "password", name: "Password", icon: <FiShield size={14} />, color: "#a78bfa", players: "4+", description: "Team word-guessing with one-word clues" },
  { key: "chain", name: "Chain Reaction", icon: <FiLink size={14} />, color: "#34d399", players: "2", description: "1v1 word chain duel — guess the hidden words" },
  { key: "shade", name: "Shade Signal", icon: <FiDroplet size={14} />, color: "#f472b6", players: "3–8", description: "Guess the secret color from text clues" },
  { key: "location", name: "Location Signal", icon: <FiMapPin size={14} />, color: "#f59e0b", players: "3–8", description: "Guess the secret map location from clues" },
  { key: "shikaku", name: "Shikaku", icon: <FiGrid size={14} />, color: "#06b6d4", players: "Solo", description: "Logic puzzle — divide the grid into rectangles" },
];

function getPageInfo(pathname: string): { title: string; icon: ReactNode; description: string; tips?: string[] } {
  if (pathname === "/") {
    return { title: "Home", icon: <FiZap size={16} />, description: "Create a new game or join an existing one with a code.", tips: ["Set your name before joining a game", "Use the join code to hop into a friend's lobby"] };
  }
  if (pathname.startsWith("/imposter/")) {
    return { title: "Imposter", icon: <FiEye size={16} />, description: "Social deduction — everyone gives one-word clues, then votes on who the imposter is.", tips: ["Give clues that prove you know the word", "Vote for who you think is faking it"] };
  }
  if (pathname.startsWith("/password/")) {
    return { title: "Password", icon: <FiShield size={16} />, description: "Team word-guessing. Give one-word clues — first team to target score wins!", tips: ["Clue givers: one word only", "Guessers: type your best guess"] };
  }
  if (pathname.startsWith("/chain/")) {
    return { title: "Chain Reaction", icon: <FiLink size={16} />, description: "1v1 word chain duel. Guess the hidden words between the hints!", tips: ["Tap a word to guess", "Wrong guesses reveal a letter", "Fewer hints = more points"] };
  }
  if (pathname.startsWith("/shade/")) {
    return { title: "Shade Signal", icon: <FiDroplet size={16} />, description: "The leader describes a secret color. Everyone else guesses which cell it is.", tips: ["Leaders: describe the color creatively", "Closer guesses = more points"] };
  }
  if (pathname.startsWith("/location/")) {
    return { title: "Location Signal", icon: <FiMapPin size={16} />, description: "The leader picks a map location and gives text clues. Guess as close as you can!", tips: ["Leaders: don't name the place directly", "5,000 pts for exact, drops with distance"] };
  }
  if (/^\/shikaku(\/|$)/.test(pathname)) {
    return { title: "Shikaku", icon: <FiGrid size={16} />, description: "Divide the grid into rectangles — each with one number equal to its area.", tips: ["Drag to draw rectangles", "Each must contain exactly one number"] };
  }
  return { title: "Page", icon: <FiZap size={16} />, description: "You're on an unknown page." };
}
