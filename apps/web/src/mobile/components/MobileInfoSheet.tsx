import { useLocation } from "react-router-dom";
import { FiZap, FiCopy } from "react-icons/fi";
import { useState } from "react";
import { getOrCreateSessionId } from "../../lib/session";
import { BottomSheet } from "./BottomSheet";
import { ImposterDemo } from "../../components/demos/ImposterDemo";
import { PasswordDemo } from "../../components/demos/PasswordDemo";
import { ChainDemo } from "../../components/demos/ChainDemo";
import { ShadeDemo } from "../../components/demos/ShadeDemo";
import { LocationDemo } from "../../components/demos/LocationDemo";

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
          style={{ width: "100%", marginTop: 12 }}
          onClick={() => setShowDemo(true)}
        >
          How to Play
        </button>
      )}
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
