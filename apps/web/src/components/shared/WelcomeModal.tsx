import { FormEvent, useState } from "react";
import { FiArrowRight, FiZap } from "react-icons/fi";

/* ── Word bank for random names ──────────────────────────── */
const adjectives = [
  "Swift", "Sneaky", "Cosmic", "Lucky", "Dizzy", "Frosty", "Bold", "Chill",
  "Witty", "Fierce", "Jolly", "Mystic", "Nifty", "Pixel", "Rapid", "Silent",
  "Turbo", "Vivid", "Wacky", "Zesty", "Brave", "Clever", "Funky", "Groovy",
  "Hyper", "Keen", "Lively", "Plucky", "Radiant", "Spunky", "Sleepy", "Stormy",
  "Sunny", "Fuzzy", "Crispy", "Bouncy", "Shifty", "Sparky", "Tricky", "Zippy",
];
const nouns = [
  "Panda", "Fox", "Falcon", "Otter", "Wolf", "Shark", "Raven", "Lynx",
  "Cobra", "Badger", "Hawk", "Tiger", "Bear", "Moose", "Owl", "Penguin",
  "Dragon", "Phoenix", "Pirate", "Knight", "Ninja", "Wizard", "Ghost", "Robot",
  "Yeti", "Gremlin", "Goblin", "Squid", "Toucan", "Ferret", "Walrus", "Jackal",
  "Beetle", "Puffin", "Coyote", "Mole", "Parrot", "Wasp", "Mantis", "Orca",
];

function randomName(): string {
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)]!;
  const noun = nouns[Math.floor(Math.random() * nouns.length)]!;
  return `${adj}${noun}`;
}

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
    <div className="modal-overlay">
      <div className="modal-panel welcome-panel" onClick={(e) => e.stopPropagation()}>
        <div className="welcome-hero">
          <div className="welcome-icon">
            <FiZap size={28} />
          </div>
          <h1 className="welcome-title">Welcome to Games</h1>
          <p className="welcome-subtitle">
            Real-time party games you can play with friends. Create a lobby, share the code, and jump in.
          </p>
        </div>

        <div className="welcome-games">
          <div className="welcome-game">
            <span className="welcome-game-emoji">🕵️</span>
            <div>
              <strong>Imposter</strong>
              <span className="welcome-game-desc">Find the liar through one-word clues</span>
            </div>
          </div>
          <div className="welcome-game">
            <span className="welcome-game-emoji">🔑</span>
            <div>
              <strong>Password</strong>
              <span className="welcome-game-desc">Team word-guessing race to the top</span>
            </div>
          </div>
          <div className="welcome-game">
            <span className="welcome-game-emoji">⛓️</span>
            <div>
              <strong>Chain Reaction</strong>
              <span className="welcome-game-desc">1v1 word chain duel — guess or give up</span>
            </div>
          </div>
        </div>

        <form className="welcome-form" onSubmit={handleSubmit}>
          <label className="welcome-label">Pick a display name</label>
          <div className="welcome-input-row">
            <input
              className="input welcome-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter a name…"
              maxLength={32}
              autoFocus
            />
            <button type="submit" className="btn btn-primary welcome-go">
              <FiArrowRight size={16} />
            </button>
          </div>
          <button type="button" className="welcome-skip" onClick={handleSkip}>
            Skip — give me a random name
          </button>
        </form>
      </div>
    </div>
  );
}
