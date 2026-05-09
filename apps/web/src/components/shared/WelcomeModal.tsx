import { FormEvent, useState } from "react";
import { FiArrowRight, FiZap, FiEye, FiShield, FiLink, FiX } from "react-icons/fi";
import { PiPaintBrushBold } from "react-icons/pi";
import { randomName } from "../../lib/session";

const games = [
  {
    name: "Imposter",
    desc: "Find the liar. Give clues. Vote them out.",
    icon: <FiEye size={16} />,
    color: "#7eb8ff",
    modifier: "imposter" as const,
  },
  {
    name: "Password",
    desc: "One-word clues. Team guessing. First to target wins.",
    icon: <FiShield size={16} />,
    color: "#a78bfa",
    modifier: "password" as const,
  },
  {
    name: "Chain Reaction",
    desc: "Race to solve a chain of linked words.",
    icon: <FiLink size={16} />,
    color: "#34d399",
    modifier: "chain" as const,
  },
  {
    name: "Shade Signal",
    desc: "Give clues and guess the target shade.",
    icon: <PiPaintBrushBold size={16} />,
    color: "#f472b6",
    modifier: "shade" as const,
    comingSoon: true,
  },
];

interface WelcomeModalProps {
  onDone: (chosenName: string) => void;
}

export function WelcomeModal({ onDone }: WelcomeModalProps) {
  const [name, setName] = useState("");

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    onDone(name.trim() || randomName());
  };

  const handleSkip = () => {
    onDone(randomName());
  };

  return (
    <div
      className="modal-overlay"
      onClick={(event) => { if (event.target === event.currentTarget) handleSkip(); }}
      onKeyDown={(event) => { if (event.key === "Escape") handleSkip(); }}
      role="presentation"
    >
      <div className="modal-panel welcome-panel">
        <button className="welcome-close" onClick={handleSkip} type="button" aria-label="Close">
          <FiX size={16} />
        </button>
        <div className="welcome-hero">
          <div className="welcome-icon">
            <FiZap size={26} />
          </div>
          <h1 className="welcome-title">Welcome to Games</h1>
          <p className="welcome-subtitle">
            Real-time party games you can play with friends.<br />
            Create a lobby, share the code, and jump in.
          </p>
        </div>

        <div className="welcome-games">
          {games.map((g) => (
            <div
              key={g.name}
              className={`welcome-game welcome-game--${g.modifier}`}
            >
              <span className="welcome-game-icon" style={{ color: g.color }}>
                {g.icon}
              </span>
              <div className="welcome-game-text">
                <span className="welcome-game-name">
                  {g.name}
                  {g.comingSoon && <span className="welcome-game-soon">Soon</span>}
                </span>
                <span className="welcome-game-desc">{g.desc}</span>
              </div>
            </div>
          ))}
        </div>

        <form className="welcome-form" onSubmit={handleSubmit}>
          <label htmlFor="welcome-display-name" className="welcome-label">Pick a display name</label>
          <div className="welcome-input-row">
            <input
              id="welcome-display-name"
              className="input welcome-input"
              value={name}
              onChange={(e) => setName(e.target.value.replace(/\s/g, ""))}
              placeholder="Enter a name…"
              maxLength={32}
            />
            <button type="submit" className="btn btn-primary welcome-go">
              <FiArrowRight size={16} />
            </button>
          </div>
          <button type="button" className="welcome-skip" onClick={handleSkip}>
            Skip - give me a random name
          </button>
        </form>

        <div className="welcome-footer">
          Made with <span className="welcome-heart">❤️</span> by Lawson
        </div>
      </div>
    </div>
  );
}
