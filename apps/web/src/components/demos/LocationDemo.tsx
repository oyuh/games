import { useEffect, useRef, useState, FormEvent } from "react";
import { FiClock, FiMapPin, FiRefreshCw, FiSend, FiSlash, FiTarget, FiAward } from "react-icons/fi";
import { DemoModal, DemoPoint, DemoScoring, type DemoStep } from "./DemoModal";
import { PlayerAvatar } from "../shared/PlayerAvatar";
import { scoreForDistance } from "@games/shared";
import { LocationGuess, LocationPickClue } from "../location/LocationRound";
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

/* The pins wear faces in the game, so they wear them here. A how-to that draws
   its own version of the thing is a second thing to keep in step. */
const GUESS_ROUND1: MapMarker[] = [
  { lat: 37.9, lng: 23.7, color: "#7ecbff", avatar: P.alice, label: "Alice - Athens?", size: 2.5, ring: true },
  { lat: 48.8, lng: 2.3, color: "#ef476f", avatar: P.bob, label: "Bob - Paris?", size: 2.5, ring: true },
  { lat: 40.4, lng: -3.7, color: "#06d6a0", avatar: P.you, label: "You - Madrid?", size: 2.5, ring: true },
  { lat: 30.0, lng: 31.2, color: "#a78bfa", avatar: P.diana, label: "Diana - Cairo?", size: 2.5, ring: true },
];

// Leader view of guess 1: the place, and everyone circling it
const LEADER_GUESS1: MapMarker[] = [
  { lat: TARGET.lat, lng: TARGET.lng, color: "#ffd166", label: "Your place", size: 3.4, ring: true, alwaysLabel: true },
  ...GUESS_ROUND1,
];

// Reveal: the place, and where everybody finished
const REVEAL_MARKERS: MapMarker[] = [
  { lat: TARGET.lat, lng: TARGET.lng, color: "#ffd166", label: "It was here - Rome", size: 4, pulse: true, ring: true, alwaysLabel: true },
  { lat: 43.7, lng: 11.2, color: "#06d6a0", avatar: P.alice, label: "Alice", size: 2.4, ring: true },
  { lat: 45.4, lng: 9.2, color: "#06d6a0", avatar: P.bob, label: "Bob", size: 2.4, ring: true },
  { lat: 41.9, lng: 12.5, color: "#06d6a0", avatar: P.you, label: "You", size: 2.4, ring: true },
  { lat: 40.8, lng: 14.3, color: "#06d6a0", avatar: P.diana, label: "Diana", size: 2.4, ring: true },
];

/* Run through the mutator's own scoreForDistance, so the how-to cannot teach a
   scoring curve the game does not use. The old table here was hand written and
   read far too harsh: it claimed nothing past 5,000 km when you still bank a
   thousand. */
const SCORING_TABLE = [120.7, 500, 1500, 3000, 5000, 10000].map((km) => ({
  label: km === 120.7 ? "Within 120 km" : `~${km.toLocaleString()} km`,
  value: scoreForDistance(km).toLocaleString(),
}));

const REVEAL_SCORES = [
  { name: "You", km: 0, color: "#06d6a0", id: P.you },
  { name: "Alice", km: 200, color: "#7ecbff", id: P.alice },
  { name: "Bob", km: 400, color: "#ef476f", id: P.bob },
  { name: "Diana", km: 750, color: "#a78bfa", id: P.diana },
].map((row) => ({
  ...row,
  pts: scoreForDistance(row.km),
  dist: row.km === 0 ? "0 km - exact!" : `~${row.km} km`,
}));

/* The how-to is a modal on a scrolling body, so the map is sized off the
   viewport rather than a number that was picked for a laptop. 220px of world
   map is a letterbox you cannot recognise a country in, which rather defeats
   the point of a page teaching you to recognise countries. */
const DEMO_MAP_H = "clamp(240px, 42vh, 460px)";

/** Whoever is leading in the worked example. */
const DEMO_LEADER = { sessionId: P.alice, name: "Alice" };

/* ── Steps ──────────────────────────────────────────────── */

const steps: DemoStep[] = [
  {
    label: "The Basics",
    description: "Location Signal is a map-based guessing game. One player picks a secret location, gives text clues, and everyone else guesses where it is on the world map.",
    hint: "Think GeoGuessr meets party game - the closer your guess, the more points you get!",
  },
  {
    label: "The place, and the first clue",
    description: "Each round one player leads. They click anywhere on the world map to drop a secret pin, and the box under the map wakes up so they can describe it. Both go in on one press.",
    hint: "Don't name the place. 'Mediterranean coast' is fine, 'Rome' is not.",
  },
  {
    label: "Guessing",
    description: "Everyone else reads the clue and drops their own pin. Lock it in before the clock runs out. After that the leader writes another clue, and you can move your pin or stay where you were.",
    hint: "Only where you finish counts, so a bad first guess costs you nothing.",
  },
  {
    label: "Leader's View",
    description: "As the Leader, you can see your target pin AND all the guesses in real-time. Use this to write a better second clue - if everyone guessed too far north, hint south!",
    hint: "Everyone guessing too far east? Aim the next clue west.",
  },
  {
    label: "Reveal",
    description: "After the final guess, the target is revealed! The map zooms to show the target and all guesses. Points are awarded based on distance.",
    hint: "After every player has been Leader once, the game ends. Highest total score wins!",
  },
  {
    label: "Overview",
    description: "Points fall off with distance from the target. Anything inside 120 km counts as a bullseye, and the curve is generous enough that a wrong continent still scores something.",
    hint: "The decay is exponential, so the first few hundred kilometres cost you almost nothing.",
  },
];

/* ── Component ──────────────────────────────────────────── */

export function LocationDemo({ onClose, initialStep = 0 }: { onClose: () => void; initialStep?: number }) {
  const initialStepRef = useRef(initialStep);
  const [step, setStep] = useState(initialStepRef.current);
  const [draftMarker, setDraftMarker] = useState<{ lat: number; lng: number } | null>(null);
  const [guessPin, setGuessPin] = useState<{ lat: number; lng: number } | null>(null);
  const [clue, setClue] = useState("");

  // Force WorldMap remount after modal animation settles so the map
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
                <p>Leader writes text clues - guessers place pins based on hints</p>
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
                <p>Every player gets to be Leader - highest total score wins!</p>
              </div>
            </div>
            <div className="locdemo-map-preview">
              <WorldMap
                key={mapKey}
                height={DEMO_MAP_H}
                defaultZoom={2}
                defaultCenter={[25, 10]}
                onClick={(coords) => setDraftMarker(coords)}
                interactive
                markers={draftMarker ? [{ lat: draftMarker.lat, lng: draftMarker.lng, color: "var(--primary)", label: "Try clicking!", size: 2, ring: true }] : []}
              />
              <p className="locdemo-map-caption">Try clicking the map - this is what the game looks like!</p>
            </div>
          </div>
        );

      /* ─── The place and the first clue ─── */
      case 1:
        return (
          <div className="locdemo-step">
            {/* The real screen, not a drawing of it. It is all props and
                callbacks, so the how-to can run the actual thing and never
                drift from what the game does. */}
            <LocationPickClue
              isLeader
              leader={DEMO_LEADER}
              target={draftMarker}
              value={clue}
              height={DEMO_MAP_H}
              onPick={setDraftMarker}
              onChange={setClue}
              onSubmit={noop}
            />
          </div>
        );

      /* ─── Guessing ─── */
      case 2:
        return (
          <div className="locdemo-step">
            <LocationGuess
              round={2}
              isGuessing
              leader={DEMO_LEADER}
              clues={[{ round: 1, text: CLUE_1 }, { round: 2, text: CLUE_2 }]}
              selected={guessPin}
              previous={{ lat: 41.4, lng: 2.2 }}
              onKeep={() => setGuessPin({ lat: 41.4, lng: 2.2 })}
              lockedCount={2}
              guesserCount={4}
              height={DEMO_MAP_H}
              onSelect={setGuessPin}
              onLock={() => {}}
            />
            <p className="locdemo-map-caption">
              The grey pin is where you went last time. Stay there, or click anywhere to move.
            </p>
          </div>
        );

      /* ─── Leader View ─── */
      case 3:
        return (
          <div className="locdemo-step">
            <DemoPoint label="Your target in gold, every guess around it">
              <div className="locdemo-map-preview">
                <WorldMap height={DEMO_MAP_H} interactive={false} markers={LEADER_GUESS1} defaultCenter={[40, 12]} defaultZoom={3} />
                <p className="locdemo-map-caption">Leader sees everything - target (gold) + all player guesses</p>
              </div>
            </DemoPoint>
          </div>
        );

      /* ─── Reveal ─── */
      case 4:
        return (
          <div className="locdemo-step">
            <div className="locdemo-map-preview">
              <WorldMap height={DEMO_MAP_H} interactive={false} markers={REVEAL_MARKERS} defaultCenter={[42, 12]} defaultZoom={5} />
            </div>
            <DemoPoint label="Closer pins score more">
              <div className="locdemo-reveal-scores">
                {REVEAL_SCORES.map((r, i) => (
                  <div key={r.id} className={`locdemo-reveal-row${r.id === P.you ? " locdemo-reveal-row--me" : ""}`}>
                    <span className="locdemo-reveal-rank">#{i + 1}</span>
                    <div className="locdemo-reveal-avatar">
                      <PlayerAvatar seed={r.id} />
                    </div>
                    <span className="locdemo-reveal-name">{r.name}</span>
                    <span className="locdemo-reveal-dist">{r.dist}</span>
                    <span className="locdemo-reveal-pts" style={{ color: r.color }}>{r.pts.toLocaleString()} pts</span>
                  </div>
                ))}
              </div>
            </DemoPoint>
          </div>
        );

      /* ─── Scoring ─── */
      case 5:
        return (
          <div className="locdemo-step">
            <DemoScoring
              columns={["Distance from target", "Points"]}
              rows={SCORING_TABLE}
              rules={[
                { icon: <FiSlash size={13} />, title: "Clue rules", text: "Don't name the exact place. Don't use coordinates. Max 80 characters per clue." },
                { icon: <FiRefreshCw size={13} />, title: "Rotation", text: "Every player gets to be Leader once by default. More rounds, more fun." },
                { icon: <FiClock size={13} />, title: "Timer", text: "Each phase has a time limit. Miss it and you score nothing that round." },
                { icon: <FiAward size={13} />, title: "Winning", text: "After all rounds, the player with the highest total score wins." },
              ]}
            />
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
      <div className="game-page" data-game-theme="location">
        {renderStep()}
      </div>
    </DemoModal>
  );
}
