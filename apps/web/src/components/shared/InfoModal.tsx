import { FiX, FiZap, FiGlobe, FiMap, FiEye, FiShield, FiAward, FiLink, FiCopy, FiDroplet, FiMapPin, FiGrid, FiActivity, FiGithub, FiExternalLink } from "react-icons/fi";
import { useLocation } from "react-router-dom";
import { useState, useEffect, useSyncExternalStore, type ReactNode } from "react";
import { getOrCreateSessionId } from "../../lib/session";
import { useConnectionDebug } from "../../lib/connection-debug";
import { getCustomStatus, subscribeCustomStatus } from "../../hooks/useAdminBroadcast";

const GITHUB_REPO = "https://github.com/oyuh/games";

const siteInfo = {
  title: "Games",
  description: "A real-time multiplayer party game platform. Create or join lobbies, play with friends, and have fun — no accounts required.",
  version: "1.0",
  author: "Lawson",
};

const GAME_CATALOG = [
  {
    key: "imposter",
    name: "Imposter",
    icon: <FiEye size={16} />,
    color: "#7eb8ff",
    players: "3–12",
    tagline: "Social deduction — find the fake",
    description: "Everyone sees a secret word except the imposter. Give one-word clues, then vote.",
  },
  {
    key: "password",
    name: "Password",
    icon: <FiShield size={16} />,
    color: "#a78bfa",
    players: "4+",
    tagline: "Team word-guessing",
    description: "Teams take turns giving one-word clues. Guess the secret word before the other team!",
  },
  {
    key: "chain",
    name: "Chain Reaction",
    icon: <FiLink size={16} />,
    color: "#34d399",
    players: "2",
    tagline: "1v1 word chain duel",
    description: "Race to guess hidden words in a chain. Fewer hints = more points.",
  },
  {
    key: "shade",
    name: "Shade Signal",
    icon: <FiDroplet size={16} />,
    color: "#f472b6",
    players: "3–8",
    tagline: "Color-clue guessing",
    description: "The leader hints at a secret color on the grid. Guess the right cell!",
  },
  {
    key: "location",
    name: "Location Signal",
    icon: <FiMapPin size={16} />,
    color: "#f59e0b",
    players: "3–8",
    tagline: "Map-based guessing",
    description: "The leader picks a spot on the world map and gives text clues. Get as close as you can!",
  },
  {
    key: "shikaku",
    name: "Shikaku",
    icon: <FiGrid size={16} />,
    color: "#06b6d4",
    players: "Solo",
    tagline: "Logic puzzle",
    description: "Divide the grid into rectangles — each containing exactly one number equal to its area.",
  },
];

interface PageInfo {
  title: string;
  description: string;
  icon: ReactNode;
  tips?: string[];
}

function getPageInfo(pathname: string): PageInfo {
  if (pathname === "/") {
    return {
      title: "Home",
      icon: <FiGlobe size={18} />,
      description: "Create a new game or join an existing one with a code. Set your display name so others can see you.",
      tips: [
        "Set your name before joining a game",
        "Use the join code to hop into a friend's lobby",
        "Configure game options before creating",
      ],
    };
  }

  if (pathname.startsWith("/imposter/")) {
    return {
      title: "Imposter",
      icon: <FiEye size={18} />,
      description: "A social deduction game. Each round, players see a secret word — except the imposter. Everyone gives one-word clues, then votes on who the imposter is.",
      tips: [
        "Give a clue that proves you know the word without giving it away",
        "The imposter should try to blend in",
        "Review all clues carefully before voting",
      ],
    };
  }

  if (pathname.startsWith("/password/")) {
    return {
      title: "Password",
      icon: <FiShield size={18} />,
      description: "Team-based word guessing. Each round, one player gives a one-word clue and their teammate guesses. First team to the target score wins!",
      tips: [
        "Clue givers: your clue must be exactly one word",
        "Guessers: type your best guess before time runs out",
        "Watch the scoreboard to track team progress",
      ],
    };
  }

  if (pathname.startsWith("/chain/")) {
    return {
      title: "Chain Reaction",
      icon: <FiLink size={18} />,
      description: "A 1v1 word chain duel. Each player gets a chain of connected words — the first and last are revealed as hints. Guess the hidden words in between!",
      tips: [
        "Wrong guesses auto-reveal one letter as a hint",
        "Fewer hints used = more points per word (3 → 2 → 1)",
        "Finish your chain first for a bonus point on the last word",
      ],
    };
  }

  if (pathname.startsWith("/shade/")) {
    return {
      title: "Shade Signal",
      icon: <FiDroplet size={18} />,
      description: "A color-guessing party game. The Leader gives text clues about a secret color on the grid. Everyone else tries to guess which cell it is.",
      tips: [
        "Leaders: describe the color without naming it directly",
        "Scoring: exact = 5 pts, 1 away = 3, 2 away = 2, 3 away = 1",
        "Every player takes a turn as leader across rounds",
      ],
    };
  }

  if (pathname.startsWith("/location/")) {
    return {
      title: "Location Signal",
      icon: <FiMapPin size={18} />,
      description: "A map-based guessing game. The Leader secretly picks a spot on the world map and gives text clues. Everyone else guesses where it is — closer = more points!",
      tips: [
        "Leaders: don't name the place directly",
        "You get two clues to narrow it down",
        "5,000 pts for exact, scores drop with distance",
      ],
    };
  }

  if (/^\/shikaku(\/|$)/.test(pathname)) {
    return {
      title: "Shikaku",
      icon: <FiGrid size={18} />,
      description: "A logic puzzle. Divide the grid into rectangles, each containing exactly one number equal to its area. Race for the best time!",
      tips: [
        "Drag to draw rectangles on the grid",
        "Each rectangle must contain exactly one number",
        "Complete all puzzles as fast as you can for a higher score",
      ],
    };
  }

  return {
    title: "Page",
    icon: <FiMap size={18} />,
    description: "You're on an unknown page.",
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
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-panel info-modal-panel" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="modal-header">
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <FiZap size={18} style={{ color: "var(--primary)" }} />
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
                  <li key={i} className="info-tip">
                    <FiZap size={11} className="info-tip-icon" />
                    {tip}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <hr className="info-divider" />

          {/* Game catalog */}
          <div className="info-block">
            <h3 className="info-section-title">Games</h3>
            <div className="info-game-grid">
              {GAME_CATALOG.map((g) => (
                <div key={g.key} className="info-game-card">
                  <div className="info-game-card-icon" style={{ background: `color-mix(in srgb, ${g.color} 15%, transparent)`, color: g.color }}>
                    {g.icon}
                  </div>
                  <div className="info-game-card-body">
                    <div className="info-game-card-row">
                      <span className="info-game-card-name">{g.name}</span>
                      <span className="info-game-card-players">{g.players}</span>
                    </div>
                    <span className="info-game-card-desc">{g.description}</span>
                  </div>
                </div>
              ))}
            </div>
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
