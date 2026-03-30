import { useState, useEffect, FormEvent } from "react";
import { FiMapPin, FiSend } from "react-icons/fi";
import { DemoModal, DemoGlow, type DemoStep } from "./DemoModal";
import { BorringAvatar } from "../shared/BorringAvatar";
import { PasswordHeader } from "../password/PasswordHeader";
import { WorldMap, type MapMarker } from "../location/WorldMap";
import "../../styles/game-shared.css";
import "../../styles/location-signal.css";

/* ── Fake data ──────────────────────────────────────────── */

const P = {
  you: "demo-you",
  alice: "demo-alice",
  bob: "demo-bob",
  diana: "demo-diana",
};

const NAMES: Record<string, string> = {
  [P.you]: "You",
  [P.alice]: "Alice",
  [P.bob]: "Bob",
  [P.diana]: "Diana",
};

const PLAYERS = Object.entries(NAMES).map(([id, name]) => ({
  sessionId: id,
  name,
  connected: true,
  totalScore: 0,
}));

// Secret target: Rome, Italy (~41.9, 12.5)
const TARGET = { lat: 41.9, lng: 12.5 };

const CLUE_1 = "Ancient empire";
const CLUE_2 = "Colosseum";

// Round 1 guesses (after clue 1 — spread out)
const GUESS_ROUND1: MapMarker[] = [
  { lat: 37.9, lng: 23.7, color: "#7ecbff", label: "Alice", size: 2.5 },
  { lat: 48.8, lng: 2.3, color: "#7ecbff", label: "Bob", size: 2.5 },
  { lat: 40.4, lng: -3.7, color: "#06d6a0", label: "You", size: 2.5, ring: true },
];

// Round 2 guesses (after clue 2 — closer)
const GUESS_ROUND2: MapMarker[] = [
  { lat: 43.7, lng: 11.2, color: "#7ecbff", label: "Alice", size: 2.5 },
  { lat: 45.4, lng: 9.2, color: "#7ecbff", label: "Bob", size: 2.5 },
  { lat: 41.9, lng: 12.5, color: "#06d6a0", label: "You", size: 2.5, ring: true },
];

// Reveal markers: target + all final guesses
const REVEAL_MARKERS: MapMarker[] = [
  { lat: TARGET.lat, lng: TARGET.lng, color: "#ffd166", label: "Target", size: 4.5, pulse: true, ring: true },
  { lat: 43.7, lng: 11.2, color: "#7ecbff", label: "Alice (4264 pts)", size: 2.5 },
  { lat: 45.4, lng: 9.2, color: "#7ecbff", label: "Bob (3785 pts)", size: 2.5 },
  { lat: 41.9, lng: 12.5, color: "#06d6a0", label: "You (5000 pts!)", size: 2.5, ring: true },
];

/* ── Steps ──────────────────────────────────────────────── */

const steps: DemoStep[] = [
  {
    label: "Lobby",
    description: "Players join the game. The host starts when there are at least 2 players. Each player takes turns as the Leader.",
    hint: "Higher score is better! You earn up to 5,000 points per round based on how close your guess is.",
  },
  {
    label: "Pick Location (Leader)",
    description: "The Leader secretly picks a location on the world map (or searches for a place). Nobody else can see the target.",
    hint: "Pick somewhere interesting! You'll give two text clues to help others find it.",
  },
  {
    label: "Clue 1 & Guess 1",
    description: "The Leader gives a text clue. Guessers click on the map to place their guess pin. You can search for cities too!",
    hint: "Be creative with clues — don't name the place directly!",
  },
  {
    label: "Clue 2 & Guess 2",
    description: "A second, more specific clue is given. Guessers can update their guess to get closer to the target.",
    hint: "The second clue should help narrow it down without giving it away completely.",
  },
  {
    label: "Reveal & Scoring",
    description: "The target is revealed! Players earn points based on how close they are. Closer = more points!",
    hint: "5,000 pts for an exact match, ~3,500 at 500 km, ~1,800 at 1,500 km, scores drop to 0 beyond ~5,000 km.",
  },
];

/* ── Component ──────────────────────────────────────────── */

export function LocationDemo({ onClose, initialStep = 0 }: { onClose: () => void; initialStep?: number }) {
  const [step, setStep] = useState(initialStep);
  const [draftMarker, setDraftMarker] = useState<{ lat: number; lng: number } | null>(null);
  const [clue, setClue] = useState("");

  // Force WorldMap remount after modal animation settles so pigeon-maps
  // measures the container at its final size
  const [mapKey, setMapKey] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setMapKey(1), 150);
    return () => clearTimeout(t);
  }, []);

  const noop = (e?: FormEvent) => e?.preventDefault();

  /* ── Shared players bar ── */
  const renderPlayersBar = (opts?: { scores?: boolean }) => (
    <div className="game-section">
      <h3 className="game-section-label">
        Players <span className="game-section-count">{PLAYERS.length}</span>
      </h3>
      <div className="game-players-grid">
        {PLAYERS.map((p, playerIndex) => {
          const isMe = p.sessionId === P.you;
          return (
            <div key={p.sessionId} className={`game-player-chip${isMe ? " game-player-chip--me" : ""}`}>
              <div className="game-player-avatar">
                <BorringAvatar seed={p.sessionId} playerIndex={playerIndex} />
              </div>
              <span className="game-player-name">{p.name}</span>
              {opts?.scores && <span className="badge" style={{ fontSize: "0.55rem" }}>{p.totalScore}</span>}
              {isMe && <span className="game-player-you">you</span>}
            </div>
          );
        })}
      </div>
    </div>
  );

  const renderStep = () => {
    switch (step) {
      case 0: // Lobby
        return (
          <div className="game-page locsig-page" data-game-theme="location">
            <PasswordHeader title="Location Signal" code="DEMO" phase="lobby" />
            <DemoGlow label="Players waiting in lobby">
              {renderPlayersBar()}
            </DemoGlow>
            <DemoGlow label="Explore the map while waiting — click to preview locations" active>
              <div className="game-section">
                <div className="locsig-map-wrap">
                  <WorldMap
                    key={mapKey}
                    height={280}
                    defaultZoom={3}
                    defaultCenter={[30, 10]}
                    onClick={(coords) => setDraftMarker(coords)}
                    interactive
                    markers={draftMarker ? [{ lat: draftMarker.lat, lng: draftMarker.lng, color: "var(--primary)", label: "Preview", size: 2, ring: true }] : []}
                  />
                </div>
              </div>
            </DemoGlow>
          </div>
        );

      case 1: // Leader picks location
        return (
          <div className="game-page locsig-page" data-game-theme="location">
            <PasswordHeader title="Location Signal" code="DEMO" phase="picking" currentRound={1} />
            {renderPlayersBar({ scores: true })}
            <DemoGlow label="As the Leader, click the map to pick a secret location">
              <div className="game-section locsig-clue-section">
                <div className="locsig-clue-leader-info">
                  <h3>Pick your target location! 📍</h3>
                  <p>Click anywhere on the map to place your target. Nobody else can see it.</p>
                </div>
                <div className="locsig-map-wrap">
                  <WorldMap
                    height={260}
                    onClick={(coords) => setDraftMarker(coords)}
                    interactive
                    markers={draftMarker ? [{ lat: draftMarker.lat, lng: draftMarker.lng, color: "#ef476f", label: "Your pick", size: 3.5, pulse: true }] : []}
                  />
                </div>
                {draftMarker && (
                  <div className="game-actions">
                    <button className="btn btn-primary game-action-btn" onClick={noop}>
                      <FiMapPin size={14} /> Lock Target
                    </button>
                  </div>
                )}
              </div>
            </DemoGlow>
          </div>
        );

      case 2: // Clue 1 + Guess 1
        return (
          <div className="game-page locsig-page" data-game-theme="location">
            <PasswordHeader title="Location Signal" code="DEMO" phase="clue1" currentRound={1} />
            {renderPlayersBar({ scores: true })}

            <DemoGlow label="Leader gives a text clue about the location">
              <div className="game-section locsig-clue-section">
                <div className="locsig-clue-leader-info">
                  <h3>You are the Leader! 📍</h3>
                  <p>Give a text clue to hint at the location — don't name it directly!</p>
                </div>
                <div className="locsig-map-wrap">
                  <WorldMap height={200} interactive={false} markers={[{ lat: TARGET.lat, lng: TARGET.lng, color: "#ef476f", label: "Target", size: 3.5, pulse: true }]} />
                </div>
                <form className="locsig-clue-form" onSubmit={noop}>
                  <input className="input locsig-clue-input" value={clue} onChange={(e) => setClue(e.target.value)} placeholder="e.g. Ancient empire..." maxLength={80} />
                  <button className="btn btn-primary" type="submit" disabled={!clue.trim()}>
                    <FiSend size={14} /> Send
                  </button>
                </form>
              </div>
            </DemoGlow>

            <hr style={{ border: 0, borderTop: "1px dashed var(--border)", margin: "1rem 0" }} />

            <DemoGlow label="Guesser view — click the map to place your guess">
              <div className="game-section locsig-guess-section">
                <div className="locsig-clue-display-row">
                  <div className="locsig-clue-display">
                    <span className="locsig-clue-tag">Clue 1</span>
                    <span className="locsig-clue-word">{CLUE_1}</span>
                  </div>
                </div>
                <p className="locsig-guess-prompt">Click on the map to place your guess</p>
                <div className="locsig-map-wrap">
                  <WorldMap height={200} interactive={false} markers={GUESS_ROUND1} />
                </div>
              </div>
            </DemoGlow>
          </div>
        );

      case 3: // Clue 2 + Guess 2
        return (
          <div className="game-page locsig-page" data-game-theme="location">
            <PasswordHeader title="Location Signal" code="DEMO" phase="clue2" currentRound={1} />
            {renderPlayersBar({ scores: true })}
            <DemoGlow label="A second clue helps narrow it down — update your guess!">
              <div className="game-section locsig-guess-section">
                <div className="locsig-clue-display-row">
                  <div className="locsig-clue-display">
                    <span className="locsig-clue-tag">Clue 1</span>
                    <span className="locsig-clue-word">{CLUE_1}</span>
                  </div>
                  <div className="locsig-clue-display">
                    <span className="locsig-clue-tag">Clue 2</span>
                    <span className="locsig-clue-word">{CLUE_2}</span>
                  </div>
                </div>
                <div className="locsig-map-wrap">
                  <WorldMap height={220} interactive={false} markers={GUESS_ROUND2} />
                </div>
                <p className="locsig-guess-prompt">
                  Notice how guesses moved closer after the second clue!
                </p>
              </div>
            </DemoGlow>
          </div>
        );

      case 4: // Reveal
        return (
          <div className="game-page locsig-page" data-game-theme="location">
            <PasswordHeader title="Location Signal" code="DEMO" phase="reveal" currentRound={1} />
            {renderPlayersBar({ scores: true })}
            <DemoGlow label="Target revealed — points based on distance!">
              <div className="game-section locsig-reveal-section">
                <h3 className="game-section-label">🎯 Reveal!</h3>
                <div className="locsig-map-wrap">
                  <WorldMap height={240} interactive={false} markers={REVEAL_MARKERS} />
                </div>
                <div className="game-players-grid" style={{ marginTop: "0.75rem" }}>
                  {[
                    { name: "You", pts: 5000, label: "Exact! 🎯", id: P.you },
                    { name: "Alice", pts: 4264, label: "~200 km", id: P.alice },
                    { name: "Bob", pts: 3785, label: "~400 km", id: P.bob },
                  ].map((r, playerIndex) => (
                    <div key={r.name} className={`game-player-chip${r.name === "You" ? " game-player-chip--me" : ""}`}>
                      <div className="game-player-avatar">
                        <BorringAvatar seed={r.id} playerIndex={playerIndex} />
                      </div>
                      <span className="game-player-name">{r.name}</span>
                      <span className="badge" style={{ fontSize: "0.55rem" }}>{r.pts} pts</span>
                      <span style={{ fontSize: "0.65rem", color: "var(--secondary)" }}>{r.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </DemoGlow>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <DemoModal
      title="Location Signal"
      icon={<FiMapPin size={20} />}
      color="#f59e0b"
      steps={steps}
      currentStep={step}
      onStepChange={setStep}
      onClose={onClose}
    >
      {renderStep()}
    </DemoModal>
  );
}
