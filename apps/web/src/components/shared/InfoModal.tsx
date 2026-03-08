import { FiX, FiZap, FiGlobe, FiMap, FiEye, FiShield, FiAward, FiLink, FiCopy, FiDroplet } from "react-icons/fi";
import { useLocation } from "react-router-dom";
import { useState, type ReactNode } from "react";
import { getOrCreateSessionId } from "../../lib/session";

const siteInfo = {
  title: "Games",
  description: "A real-time multiplayer party game platform. Create or join lobbies, play with friends, and have fun.",
  version: "1.0",
  author: "Lawson",
};

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
      icon: <FiGlobe size={20} />,
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
      icon: <FiEye size={20} />,
      description: "A social deduction game. Each round, players see a secret word — except the imposter. Everyone gives one-word clues, then votes on who the imposter is.",
      tips: [
        "Lobby — Wait for players, then the host starts the game",
        "Playing — Give a clue that proves you know the word without giving it away",
        "Voting — Review clues and vote for who you think is the imposter",
        "Results — See who was right and start the next round",
      ],
    };
  }

  if (pathname.startsWith("/password/") && pathname.endsWith("/results")) {
    return {
      title: "Password — Results",
      icon: <FiAward size={20} />,
      description: "The game is over. See the final scores and round history. The host can start a new game.",
    };
  }

  if (pathname.startsWith("/password/") && pathname.endsWith("/begin")) {
    return {
      title: "Password — Lobby",
      icon: <FiShield size={20} />,
      description: "Team-based word guessing. Players join teams, then the host starts. Each round, one player gives a one-word clue and their teammate guesses.",
      tips: [
        "Join a team before the game starts",
        "Need at least 2 teams with players",
        "The host controls when the game begins",
      ],
    };
  }

  if (pathname.startsWith("/password/")) {
    return {
      title: "Password — In Game",
      icon: <FiShield size={20} />,
      description: "Take turns giving one-word clues. The clue giver picks a word and gives a single-word hint. The guesser tries to figure it out. First team to the target score wins!",
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
      icon: <FiLink size={20} />,
      description: "A 1v1 word chain duel. Each player gets a chain of connected words — the first and last are revealed as hints. Guess the hidden words in between!",
      tips: [
        "Tap a hidden word to type your guess",
        "Wrong guesses auto-reveal one letter as a hint",
        "Use the hint button to reveal a letter manually (costs points)",
        "Give up on tough words for 0 points to keep moving",
        "Fewer hints used = more points per word (3 → 2 → 1)",
        "Finish your chain first for a bonus point on the last word",
      ],
    };
  }

  if (pathname.startsWith("/shade/")) {
    return {
      title: "Shade Signal",
      icon: <FiDroplet size={20} />,
      description: "A color-guessing party game. Each round, one player is the Leader who sees a secret color on the grid. They give text clues and everyone else tries to guess which cell it is.",
      tips: [
        "Lobby — Wait for players, then the host starts the game",
        "Clue 1 — The leader writes a clue describing the target color",
        "Guess 1 — Everyone else picks a cell on the grid based on the clue",
        "Clue 2 — The leader gives a second, more specific clue",
        "Guess 2 — Guessers refine their pick with the new info",
        "Reveal — See the target and how close everyone was",
        "Scoring: exact = 5 pts, 1 away = 3, 2 away = 2, 3 away = 1",
        "Every player takes a turn as leader across rounds",
      ],
    };
  }

  return {
    title: "Page",
    icon: <FiMap size={20} />,
    description: "You're on an unknown page.",
  };
}

export function InfoModal({ onClose }: { onClose: () => void }) {
  const location = useLocation();
  const page = getPageInfo(location.pathname);
  const sessionId = getOrCreateSessionId();
  const [copied, setCopied] = useState(false);

  const copySessionId = () => {
    void navigator.clipboard.writeText(sessionId).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-panel modal-panel--wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">Info</h2>
          <button className="modal-close" onClick={onClose}>
            <FiX size={18} />
          </button>
        </div>

        <div className="modal-body">
          {/* Session ID header */}
          <div className="info-session-row">
            <span className="info-session-label">Session</span>
            <code className="info-session-id">{sessionId}</code>
            <button className="info-session-copy" onClick={copySessionId} data-tooltip="Copy session ID">
              {copied ? "✓" : <FiCopy size={12} />}
            </button>
          </div>

          <hr className="info-divider" />

          {/* Hero */}
          <div className="info-hero">
            <div className="info-hero-icon">
              <FiZap size={20} />
            </div>
            <div className="info-hero-text">
              <span className="info-hero-title">{siteInfo.title}</span>
              <span className="info-hero-sub">v{siteInfo.version} · by {siteInfo.author}</span>
            </div>
          </div>

          <div className="info-block">
            <p className="info-text">{siteInfo.description}</p>
          </div>

          <hr className="info-divider" />

          {/* Current page info */}
          <div className="info-block">
            <h3 className="info-heading">
              <span className="info-heading-icon">{page.icon}</span>
              {page.title}
            </h3>
            <p className="info-text">{page.description}</p>
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
        </div>
      </div>
    </div>
  );
}
