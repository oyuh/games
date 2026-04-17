import { useState, useEffect, FormEvent } from "react";
import { FiMapPin, FiSend, FiTarget, FiAward } from "react-icons/fi";
import { DemoModal, DemoGlow, type DemoStep } from "./DemoModal";
import { BorringAvatar } from "../shared/BorringAvatar";
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

// Secret target: Rome, Italy (~41.9, 12.5)
const TARGET = { lat: 41.9, lng: 12.5 };

const CLUE_1 = "Ancient empire";
const CLUE_2 = "Colosseum city";

// Round 1 guesses (after clue 1 — spread out)
const GUESS_ROUND1: MapMarker[] = [
  { lat: 37.9, lng: 23.7, color: "#7ecbff", label: "Alice (Athens?)", size: 2.5 },
  { lat: 48.8, lng: 2.3, color: "#ef476f", label: "Bob (Paris?)", size: 2.5 },
  { lat: 40.4, lng: -3.7, color: "#06d6a0", label: "You (Madrid?)", size: 2.5, ring: true },
  { lat: 30.0, lng: 31.2, color: "#a78bfa", label: "Diana (Cairo?)", size: 2.5 },
];

// Leader view of Guess 1 — target + all guesses
const LEADER_GUESS1: MapMarker[] = [
  { lat: TARGET.lat, lng: TARGET.lng, color: "#ffd166", label: "Your Target", size: 3.5, ring: true },
  ...GUESS_ROUND1,
];

// Round 2 guesses (after clue 2 — closer)
const GUESS_ROUND2: MapMarker[] = [
  { lat: 43.7, lng: 11.2, color: "#7ecbff", label: "Alice", size: 2.5 },
  { lat: 45.4, lng: 9.2, color: "#ef476f", label: "Bob", size: 2.5 },
  { lat: 41.9, lng: 12.5, color: "#06d6a0", label: "You", size: 2.5, ring: true },
  { lat: 40.8, lng: 14.3, color: "#a78bfa", label: "Diana", size: 2.5 },
];

// Reveal markers: target + all final guesses
const REVEAL_MARKERS: MapMarker[] = [
  { lat: TARGET.lat, lng: TARGET.lng, color: "#ffd166", label: "Target — Rome 🎯", size: 4.5, pulse: true, ring: true },
  { lat: 43.7, lng: 11.2, color: "#7ecbff", label: "Alice", size: 2.5 },
  { lat: 45.4, lng: 9.2, color: "#ef476f", label: "Bob", size: 2.5 },
  { lat: 41.9, lng: 12.5, color: "#06d6a0", label: "You", size: 2.5, ring: true },
  { lat: 40.8, lng: 14.3, color: "#a78bfa", label: "Diana", size: 2.5 },
];

const SCORING_TABLE = [
  { distance: "Exact (0 km)", pts: "5,000", emoji: "🎯" },
  { distance: "≤ 100 km", pts: "~4,500", emoji: "🔥" },
  { distance: "≤ 500 km", pts: "~3,500", emoji: "👍" },
  { distance: "≤ 1,500 km", pts: "~1,800", emoji: "🤏" },
  { distance: "≤ 3,000 km", pts: "~500", emoji: "😅" },
  { distance: "> 5,000 km", pts: "0", emoji: "💀" },
];

const REVEAL_SCORES = [
  { name: "You", pts: 5000, dist: "0 km — exact!", color: "#06d6a0", id: P.you },
  { name: "Alice", pts: 4264, dist: "~200 km", color: "#7ecbff", id: P.alice },
  { name: "Bob", pts: 3785, dist: "~400 km", color: "#ef476f", id: P.bob },
  { name: "Diana", pts: 2930, dist: "~750 km", color: "#a78bfa", id: P.diana },
];

/* ── Steps ──────────────────────────────────────────────── */

const steps: DemoStep[] = [
  {
    label: "Overview",
    description: "Location Signal is a map-based guessing game. One player picks a secret location, gives text clues, and everyone else guesses where it is on the world map.",
    hint: "Think GeoGuessr meets party game — the closer your guess, the more points you get!",
  },
  {
    label: "Leader Picks",
    description: "Each round, one player is the Leader. They click anywhere on the world map to secretly place a target pin. Nobody else can see it.",
    hint: "Pick somewhere fun! Mountains, cities, coastlines — anywhere on Earth works.",
  },
  {
    label: "Clues & Guesses",
    description: "The Leader types a text clue (up to 80 characters). Guessers see the clue and click the map to place their guess. Then a second clue is given and guessers can update their guess.",
    hint: "Clue rules: don't name the place directly! 'Mediterranean coast' is fine, 'Rome' is not.",
  },
  {
    label: "Leader's View",
    description: "As the Leader, you can see your target pin AND all the guesses in real-time. Use this to write a better second clue — if everyone guessed too far north, hint south!",
    hint: "The leader always sees their own target pin throughout the entire round.",
  },
  {
    label: "Reveal",
    description: "After the final guess, the target is revealed! The map zooms to show the target and all guesses. Points are awarded based on distance.",
    hint: "After every player has been Leader once, the game ends. Highest total score wins!",
  },
  {
    label: "Scoring",
    description: "Points are based on distance from the target. Closer = more points! The scoring curve rewards accuracy but still gives partial credit.",
    hint: "Lowest score wins in golf mode — but the default mode rewards highest score!",
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

  const renderStep = () => {
    switch (step) {
      /* ─── Overview ─── */
      case 0:
        return (
          <div className="locdemo-step">
            <div className="locdemo-overview-grid">
              <div className="locdemo-overview-card">
                <div className="locdemo-overview-icon" style={{ background: "rgba(245,158,11,0.15)", color: "#f59e0b" }}>
                  <FiMapPin size={22} />
                </div>
                <h4>Pick a Location</h4>
                <p>The Leader secretly places a pin anywhere on the world map</p>
              </div>
              <div className="locdemo-overview-card">
                <div className="locdemo-overview-icon" style={{ background: "rgba(6,214,160,0.15)", color: "#06d6a0" }}>
                  <FiSend size={22} />
                </div>
                <h4>Give Clues</h4>
                <p>Leader writes text clues — guessers place pins based on hints</p>
              </div>
              <div className="locdemo-overview-card">
                <div className="locdemo-overview-icon" style={{ background: "rgba(239,71,111,0.15)", color: "#ef476f" }}>
                  <FiTarget size={22} />
                </div>
                <h4>Guess & Score</h4>
                <p>Get as close as possible! Closer guesses earn more points</p>
              </div>
              <div className="locdemo-overview-card">
                <div className="locdemo-overview-icon" style={{ background: "rgba(167,139,250,0.15)", color: "#a78bfa" }}>
                  <FiAward size={22} />
                </div>
                <h4>Take Turns</h4>
                <p>Every player gets to be Leader — highest total score wins!</p>
              </div>
            </div>
            <div className="locdemo-map-preview">
              <WorldMap
                key={mapKey}
                height={220}
                defaultZoom={2}
                defaultCenter={[25, 10]}
                onClick={(coords) => setDraftMarker(coords)}
                interactive
                markers={draftMarker ? [{ lat: draftMarker.lat, lng: draftMarker.lng, color: "var(--primary)", label: "Try clicking!", size: 2, ring: true }] : []}
              />
              <p className="locdemo-map-caption">Try clicking the map — this is what the game looks like!</p>
            </div>
          </div>
        );

      /* ─── Leader Picks ─── */
      case 1:
        return (
          <div className="locdemo-step">
            <div className="locdemo-phase-banner locdemo-phase-banner--pick">
              <span className="locdemo-phase-emoji">📍</span>
              <div>
                <h4>Pick your target location!</h4>
                <p>Click anywhere on the map. Others can't see your pin.</p>
              </div>
            </div>
            <div className="locdemo-map-preview">
              <WorldMap
                height={260}
                onClick={(coords) => setDraftMarker(coords)}
                interactive
                markers={draftMarker
                  ? [{ lat: draftMarker.lat, lng: draftMarker.lng, color: "#ef476f", label: "Your pick", size: 3.5, pulse: true }]
                  : [{ lat: TARGET.lat, lng: TARGET.lng, color: "#ffd166", label: "e.g. Rome", size: 3, ring: true }]}
                defaultCenter={[38, 12]}
                defaultZoom={4}
              />
            </div>
            {draftMarker && (
              <div className="locdemo-action-row">
                <button className="btn btn-primary game-action-btn" onClick={noop}>
                  <FiMapPin size={14} /> Lock Target
                </button>
              </div>
            )}
            <div className="locdemo-callout locdemo-callout--info">
              <strong>Tip:</strong> Pick somewhere interesting — not too obscure, not too obvious. The fun is in the clues!
            </div>
          </div>
        );

      /* ─── Clues & Guesses ─── */
      case 2:
        return (
          <div className="locdemo-step">
            <div className="locdemo-split">
              {/* Clue 1 block */}
              <div className="locdemo-split-section">
                <div className="locdemo-phase-label">Round 1 — First Clue</div>
                <DemoGlow label="Leader types a clue">
                  <div className="locdemo-clue-card">
                    <form className="locsig-clue-form" onSubmit={noop}>
                      <input className="input locsig-clue-input" value={clue} onChange={(e) => setClue(e.target.value)} placeholder='e.g. "Ancient empire"' maxLength={80} />
                      <button className="btn btn-primary" type="button" disabled={!clue.trim()}>
                        <FiSend size={14} />
                      </button>
                    </form>
                  </div>
                </DemoGlow>
                <div className="locdemo-clue-reveal">
                  <div className="locsig-clue-display">
                    <span className="locsig-clue-tag">Clue 1</span>
                    <span className="locsig-clue-word">{CLUE_1}</span>
                  </div>
                </div>
                <div className="locdemo-map-preview">
                  <WorldMap height={180} interactive={false} markers={GUESS_ROUND1} defaultCenter={[40, 12]} defaultZoom={3} />
                  <p className="locdemo-map-caption">Guesses are spread out — clue is vague!</p>
                </div>
              </div>
              {/* Clue 2 block */}
              <div className="locdemo-split-section">
                <div className="locdemo-phase-label">Round 2 — Second Clue</div>
                <div className="locdemo-clue-reveal">
                  <div className="locsig-clue-display">
                    <span className="locsig-clue-tag">Clue 1</span>
                    <span className="locsig-clue-word">{CLUE_1}</span>
                  </div>
                  <div className="locsig-clue-display">
                    <span className="locsig-clue-tag">Clue 2</span>
                    <span className="locsig-clue-word">{CLUE_2}</span>
                  </div>
                </div>
                <div className="locdemo-map-preview">
                  <WorldMap height={180} interactive={false} markers={GUESS_ROUND2} defaultCenter={[42, 12]} defaultZoom={5} />
                  <p className="locdemo-map-caption">Guesses converge after the better clue!</p>
                </div>
              </div>
            </div>
          </div>
        );

      /* ─── Leader View ─── */
      case 3:
        return (
          <div className="locdemo-step">
            <div className="locdemo-phase-banner locdemo-phase-banner--leader">
              <span className="locdemo-phase-emoji">👀</span>
              <div>
                <h4>Leader's perspective</h4>
                <p>You see your target AND all guesses — use this to write better clues!</p>
              </div>
            </div>
            <div className="locdemo-map-preview">
              <WorldMap height={280} interactive={false} markers={LEADER_GUESS1} defaultCenter={[40, 12]} defaultZoom={3} />
              <p className="locdemo-map-caption">Leader sees everything — target (gold) + all player guesses</p>
            </div>
            <div className="locdemo-callout locdemo-callout--leader">
              <strong>Strategy:</strong> If guessers are all in Greece and your target is Rome, try a clue like <em>"Further west — think pasta!"</em>
            </div>
          </div>
        );

      /* ─── Reveal ─── */
      case 4:
        return (
          <div className="locdemo-step">
            <div className="locdemo-phase-banner locdemo-phase-banner--reveal">
              <span className="locdemo-phase-emoji">🎯</span>
              <div>
                <h4>Reveal!</h4>
                <p>The target is shown and the map zooms to fit all pins</p>
              </div>
            </div>
            <div className="locdemo-map-preview">
              <WorldMap height={260} interactive={false} markers={REVEAL_MARKERS} defaultCenter={[42, 12]} defaultZoom={5} />
            </div>
            <div className="locdemo-reveal-scores">
              {REVEAL_SCORES.map((r, i) => (
                <div key={r.id} className={`locdemo-reveal-row${r.id === P.you ? " locdemo-reveal-row--me" : ""}`}>
                  <span className="locdemo-reveal-rank">{i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i + 1}`}</span>
                  <div className="locdemo-reveal-avatar">
                    <BorringAvatar seed={r.id} playerIndex={i} />
                  </div>
                  <span className="locdemo-reveal-name">{r.name}</span>
                  <span className="locdemo-reveal-dist">{r.dist}</span>
                  <span className="locdemo-reveal-pts" style={{ color: r.color }}>{r.pts.toLocaleString()} pts</span>
                </div>
              ))}
            </div>
          </div>
        );

      /* ─── Scoring ─── */
      case 5:
        return (
          <div className="locdemo-step">
            <div className="locdemo-scoring-intro">
              <FiTarget size={28} style={{ color: "#f59e0b" }} />
              <div>
                <h4>How scoring works</h4>
                <p>Points decrease exponentially with distance — being close matters a lot!</p>
              </div>
            </div>
            <div className="locdemo-scoring-table">
              <div className="locdemo-scoring-header">
                <span>Distance</span>
                <span>Points</span>
              </div>
              {SCORING_TABLE.map((row) => (
                <div key={row.distance} className="locdemo-scoring-row">
                  <span className="locdemo-scoring-emoji">{row.emoji}</span>
                  <span className="locdemo-scoring-dist">{row.distance}</span>
                  <span className="locdemo-scoring-pts">{row.pts}</span>
                </div>
              ))}
            </div>
            <div className="locdemo-rules-grid">
              <div className="locdemo-rule">
                <strong>🚫 Clue Rules</strong>
                <p>Don't name the exact place. Don't use coordinates. Max 80 characters per clue.</p>
              </div>
              <div className="locdemo-rule">
                <strong>🔄 Rotation</strong>
                <p>Every player gets to be Leader once (by default). More rounds = more fun!</p>
              </div>
              <div className="locdemo-rule">
                <strong>⏱ Timer</strong>
                <p>Each phase has a time limit. If you don't guess in time, you get 0 points for that round.</p>
              </div>
              <div className="locdemo-rule">
                <strong>🏆 Winning</strong>
                <p>After all rounds, the player with the highest total score wins!</p>
              </div>
            </div>
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
