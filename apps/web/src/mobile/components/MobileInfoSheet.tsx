import { useLocation } from "react-router-dom";
import { GAME_META, getGameSlugFromPath, type GameSlug } from "@games/shared";
import { useState, useSyncExternalStore } from "react";
import { getOrCreateSessionId } from "../../lib/session";
import { BottomSheet } from "./BottomSheet";
import { GameIcon } from "../../components/shared/GameIcon";
import { ImposterDemo } from "../../components/demos/ImposterDemo";
import { PasswordDemo } from "../../components/demos/PasswordDemo";
import { ChainDemo } from "../../components/demos/ChainDemo";
import { ShadeDemo } from "../../components/demos/ShadeDemo";
import { LocationDemo } from "../../components/demos/LocationDemo";
import { ShikakuDemo } from "../../components/demos/ShikakuDemo";
import { PipsDemo } from "../../components/demos/PipsDemo";
import { getCustomStatus, subscribeCustomStatus } from "../../hooks/useAdminBroadcast";

const GITHUB_REPO = "https://github.com/oyuh/games";
const BUG_REPORT_URL = `${GITHUB_REPO}/issues/new?title=%5BBug%5D%20`;
const IDEA_REPORT_URL = `${GITHUB_REPO}/issues/new?title=%5BIdea%5D%20`;

const supportLinks = [
  { href: BUG_REPORT_URL, label: "Report a bug" },
  { href: IDEA_REPORT_URL, label: "Suggest an idea" },
];

function useCustomStatus() {
  return useSyncExternalStore(subscribeCustomStatus, getCustomStatus);
}

function getGameType(pathname: string): "imposter" | "password" | "chain" | "shade" | "location" | "shikaku" | "pips" | null {
  const slug = getGameSlugFromPath(pathname);
  return slug === "home" ? null : slug;
}

export function MobileInfoSheet({ onClose }: { onClose: () => void }) {
  const location = useLocation();
  const sessionId = getOrCreateSessionId();
  const [copied, setCopied] = useState(false);
  const page = getPageInfo(location.pathname);
  const gameType = getGameType(location.pathname);
  const [showDemo, setShowDemo] = useState(false);

  const customStatus = useCustomStatus();

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
    if (gameType === "pips") return <PipsDemo onClose={onClose} />;
  }

  return (
    <BottomSheet title="Info" onClose={onClose}>
      {/* Site description */}
      <p className="m-info-site-desc">
        Quick multiplayer puzzle and party games. Create a lobby, share the code, and play with friends - no accounts required.
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
          <span className="m-info-current-page-kicker">Current page</span>
          <h3>{page.title}</h3>
        </div>
        <p className="m-info-current-page-desc">{page.description}</p>
        {page.tips && page.tips.length > 0 && (
          <ul className="m-info-tips">
            {page.tips.map((tip) => (
              <li key={`${page.title}-${tip}`} className="m-info-tip">{tip}</li>
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

      {/* Game catalog */}
      <h4 className="m-info-section-title">Games</h4>
      <div className="m-info-game-list">
        {GAME_CATALOG.map((g) => (
          <div key={g.key} className="m-info-game-row">
            <div className="m-info-game-icon" style={{ background: `color-mix(in srgb, ${g.color} 15%, transparent)`, color: g.color }}>
              <GameIcon game={g.key} size={14} />
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

      {/* Feedback links */}
      <div className="m-info-feedback">
        <div className="m-info-feedback-copy">
          <span className="m-info-feedback-label">Feedback</span>
          <p>Found a bug or have an idea? Send it over on GitHub.</p>
        </div>
        <div className="m-info-feedback-links">
          {supportLinks.map((link) => (
            <a key={link.href} href={link.href} target="_blank" rel="noopener noreferrer" className="m-info-feedback-link">
              {link.label}
            </a>
          ))}
        </div>
      </div>

    <div className="m-info-divider" />

      {/* Session */}
      <div className="m-info-session-card">
        <div className="m-info-session-heading">
          <span className="m-info-session-label">Session</span>
          <button className="m-info-session-copy" onClick={copySessionId}>
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
        <code className="m-info-session-id">{sessionId}</code>
        <p className="m-info-session-helper">Include this when reporting lobby or sync issues.</p>
      </div>

      {/* Footer */}
      <div className="m-info-footer">
        <a href={GITHUB_REPO} target="_blank" rel="noopener noreferrer" className="m-info-footer-link">
          Source
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

const GAME_CATALOG_ORDER: GameSlug[] = ["imposter", "password", "chain", "shade", "location", "shikaku", "pips"];

const GAME_CATALOG = GAME_CATALOG_ORDER.map((key) => {
  const meta = GAME_META[key];
  return {
    key,
    name: meta.title,
    color: meta.accent,
    players: meta.players,
    description: meta.shortDescription,
  };
});

const pageTips: Record<GameSlug, string[]> = {
  home: ["Set your name before joining a game", "Use the join code to hop into a friend's lobby"],
  imposter: ["Give clues that prove you know the word", "Vote for who you think is faking it"],
  password: ["Clue givers: one word only", "Guessers: type your best guess"],
  chain: ["Tap a word to guess", "Wrong guesses reveal a letter", "Fewer hints = more points"],
  shade: ["Leaders: describe the color creatively", "Closer guesses = more points"],
  location: ["Leaders: don't name the place directly", "Closer guesses score more points"],
  shikaku: ["Drag to draw rectangles", "Each must contain exactly one number"],
  pips: ["Drag dominoes onto adjacent cells", "Click or press R to rotate", "Ranked runs use Easy, Medium, and Hard splits"],
};

function getPageInfo(pathname: string): { title: string; description: string; tips?: string[] } {
  const slug = getGameSlugFromPath(pathname);

  if (slug === "home" && pathname !== "/") {
    return { title: "Page", description: "You're on an unknown page." };
  }

  const meta = GAME_META[slug];
  return {
    title: slug === "home" ? "Home" : meta.title,
    description: slug === "home"
      ? "Create a new game or join an existing one with a code."
      : meta.description,
    tips: pageTips[slug],
  };
}
