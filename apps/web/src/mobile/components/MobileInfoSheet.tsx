import { useLocation } from "react-router-dom";
import { FiZap, FiCopy } from "react-icons/fi";
import { useState, useEffect, useSyncExternalStore } from "react";
import { getOrCreateSessionId } from "../../lib/session";
import { BottomSheet } from "./BottomSheet";
import { ImposterDemo } from "../../components/demos/ImposterDemo";
import { PasswordDemo } from "../../components/demos/PasswordDemo";
import { ChainDemo } from "../../components/demos/ChainDemo";
import { ShadeDemo } from "../../components/demos/ShadeDemo";
import { LocationDemo } from "../../components/demos/LocationDemo";
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

function getGameType(pathname: string): "imposter" | "password" | "chain" | "shade" | "location" | null {
  if (pathname.startsWith("/imposter/")) return "imposter";
  if (pathname.startsWith("/password/")) return "password";
  if (pathname.startsWith("/chain/")) return "chain";
  if (pathname.startsWith("/shade/")) return "shade";
  if (pathname.startsWith("/location/")) return "location";
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
  }

  return (
    <BottomSheet title="Info" onClose={onClose}>
      {/* Session */}
      <div className="m-info-session">
        <span className="m-info-session-label">Session</span>
        <code className="m-info-session-id">{sessionId.slice(0, 12)}…</code>
        <button className="m-info-session-copy" onClick={copySessionId}>
          {copied ? "✓" : <FiCopy size={12} />}
        </button>
      </div>

      <div className="m-info-divider" />

      {/* Page info */}
      <h3 className="m-info-heading">{page.title}</h3>
      <p className="m-info-text">{page.description}</p>

      {page.tips && page.tips.length > 0 && (
        <ul className="m-info-tips">
          {page.tips.map((tip, i) => (
            <li key={i} className="m-info-tip">
              <FiZap size={11} style={{ flexShrink: 0, opacity: 0.6 }} />
              {tip}
            </li>
          ))}
        </ul>
      )}

      {/* How to Play button on game pages */}
      {gameType && (
        <button
          className="m-btn m-btn--primary"
          style={{ width: "100%", marginTop: 12, marginBottom: 12 }}
          onClick={() => setShowDemo(true)}
        >
          How to Play
        </button>
      )}

      <div className="m-info-divider" />

      {/* System Status Section */}
      <div style={{ marginTop: 8 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <h3 className="m-info-heading" style={{ margin: 0 }}>System Status</h3>
          <button
            onClick={() => setShowSystemText(!showSystemText)}
            style={{ display: "flex", alignItems: "center", gap: 6, background: "var(--card)", border: "1px solid var(--border)", padding: "0.25rem 0.5rem", borderRadius: "999px", fontSize: "0.7rem", fontWeight: 600, color: "var(--foreground)" }}
          >
            <span className={`status-dot ${allHealthy ? "status-dot--ok" : isLoading ? "status-dot--loading" : "status-dot--err"}`} />
            {overallLabel}
          </button>
        </div>

        {customStatus?.text && (
          <div style={{ background: "var(--card)", padding: "0.5rem", borderRadius: "12px", border: "1px solid var(--border)", marginBottom: "0.75rem", fontSize: "0.8rem", color: customStatus.color || "var(--primary)",textAlign: "center" }}>
            {customStatus.link ? (
              <a href={customStatus.link} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "underline", color: "inherit" }}>{customStatus.text}</a>
            ) : customStatus.text}
          </div>
        )}

        {showSystemText && (
          <div style={{ padding: "0.75rem", background: "var(--card)", borderRadius: "12px", border: "1px solid var(--border)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.5rem", fontSize: "0.75rem" }}>
              <span style={{ color: "var(--secondary)" }}>API</span>
              <span style={{ fontWeight: 600, color: apiOk ? "var(--primary)" : "var(--destructive)" }}>{apiOk ? "Online" : isLoading ? "Checking…" : "Offline"}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.75rem", fontSize: "0.75rem" }}>
              <span style={{ color: "var(--secondary)" }}>Database</span>
              <span style={{ fontWeight: 600, color: dbOk ? "var(--primary)" : "var(--destructive)" }}>{dbOk ? "Connected" : isLoading ? "Checking…" : "Disconnected"}</span>
            </div>

            <div style={{ paddingTop: "0.5rem", borderTop: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: "0.35rem" }}>
              {latency != null && (
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.7rem" }}>
                  <span style={{ color: "var(--secondary)" }}>Latency</span>
                  <span>{latency}ms</span>
                </div>
              )}
              {uptimeText && (
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.7rem" }}>
                  <span style={{ color: "var(--secondary)" }}>Uptime</span>
                  <span>{uptimeText}</span>
                </div>
              )}
              {buildTime && (
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.7rem" }}>
                  <span style={{ color: "var(--secondary)" }}>Built</span>
                  <span>{buildTime}</span>
                </div>
              )}
              {commitShort && (
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.7rem" }}>
                  <span style={{ color: "var(--secondary)" }}>Commit</span>
                  <a href={`${GITHUB_REPO}/commit/${debug.apiCommitSha}`} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "underline", fontFamily: "monospace", color: "inherit" }}>
                    {commitShort}
                  </a>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Made by text */}
      <div style={{ marginTop: "1.5rem", marginBottom: "0.5rem", textAlign: "center", fontSize: "0.75rem", color: "var(--secondary)" }}>
        Made with <span style={{ color: "#ef4444" }}>❤️</span> by{" "}
        <a href="https://lawsonhart.me" target="_blank" rel="noopener noreferrer" style={{ textDecoration: "underline", color: "inherit", fontWeight: 600 }}>
          Lawson
        </a>
      </div>
    </BottomSheet>
  );
}

function getPageInfo(pathname: string): { title: string; description: string; tips?: string[] } {
  if (pathname === "/") {
    return {
      title: "Home",
      description: "Create a new game or join an existing one with a code.",
      tips: ["Set your name before joining a game", "Use the join code to hop into a friend's lobby"],
    };
  }
  if (pathname.startsWith("/imposter/")) {
    return {
      title: "Imposter",
      description: "A social deduction game. Everyone gives one-word clues, then votes on who the imposter is.",
      tips: ["Give clues that prove you know the word", "Vote for who you think is faking it"],
    };
  }
  if (pathname.startsWith("/password/") && pathname.endsWith("/results")) {
    return { title: "Password — Results", description: "See the final scores and round history." };
  }
  if (pathname.startsWith("/password/") && pathname.endsWith("/begin")) {
    return {
      title: "Password — Lobby",
      description: "Join a team, then the host starts the game.",
      tips: ["Join a team before the game starts", "Need at least 2 teams with players"],
    };
  }
  if (pathname.startsWith("/password/")) {
    return {
      title: "Password — In Game",
      description: "Give one-word clues. Guess the secret word. First team to target score wins!",
      tips: ["Clue givers: one word only", "Guessers: type your best guess"],
    };
  }
  if (pathname.startsWith("/chain/")) {
    return {
      title: "Chain Reaction",
      description: "A 1v1 word chain duel. Guess the hidden words between the hints!",
      tips: ["Tap a word to guess", "Wrong guesses reveal a letter as a hint", "Fewer hints = more points"],
    };
  }
  if (pathname.startsWith("/shade/")) {
    return {
      title: "Shade Signal",
      description: "One leader describes a target color. Everyone else guesses which cell it is.",
      tips: ["Leaders: describe the color without naming it", "Guessers: closer guesses = more points"],
    };
  }
  if (pathname.startsWith("/location/")) {
    return {
      title: "Location Signal",
      description: "One leader picks a location on the map and gives clues. Everyone else guesses where it is.",
      tips: ["Leaders: give clues to narrow it down", "Guessers: closer guesses = more points"],
    };
  }
  return { title: "Page", description: "You're on an unknown page." };
}
