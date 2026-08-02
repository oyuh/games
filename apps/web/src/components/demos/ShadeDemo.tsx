import { useRef, useState, FormEvent } from "react";
import { FiEdit3, FiGrid, FiRefreshCw, FiSend, FiUser } from "react-icons/fi";
import { DemoModal, DemoPoint, DemoScoring, type DemoStep } from "./DemoModal";
import { ColorGrid, generateGridColor } from "../shade/ColorGrid";
import { GameIcon } from "../shared/GameIcon";
import "../../styles/game-shared.css";
import "../../styles/shade-signal.css";

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

const GRID = { rows: 10, cols: 10, seed: 42 };
const TARGET = { row: 3, col: 5 };

const GUESS_MARKERS_ROUND1 = [
  { sessionId: P.bob, name: "Bob", row: 4, col: 6, isOwn: false, tooltip: "Bob\nGuess: Clue 1\nDistance: 1 away" },
  { sessionId: P.diana, name: "Diana", row: 2, col: 4, isOwn: false, tooltip: "Diana\nGuess: Clue 1\nDistance: 1 away" },
];

const REVEAL_MARKERS = [
  { sessionId: P.bob, name: "Bob", row: 3, col: 5, isOwn: false, tooltip: "Bob\nGuess: Clue 2\nDistance: Exact!\nPoints: +5" },
  { sessionId: P.diana, name: "Diana", row: 3, col: 6, isOwn: false, tooltip: "Diana\nGuess: Clue 2\nDistance: 1 away\nPoints: +3" },
  { sessionId: P.you, name: "You", row: 4, col: 4, isOwn: true, tooltip: "You (you)\nGuess: Clue 2\nDistance: 1 away\nPoints: +3" },
];

const ZONE_LEGEND = [
  { pts: 5, label: "Exact", cls: "shade-scoring-swatch--5" },
  { pts: 3, label: "1 away", cls: "shade-scoring-swatch--4" },
  { pts: 2, label: "2 away", cls: "shade-scoring-swatch--3" },
  { pts: 1, label: "3 away", cls: "shade-scoring-swatch--2" },
];

/* ── Steps ──────────────────────────────────────────────── */

const steps: DemoStep[] = [
  {
    label: "Lobby",
    description: "Players join and explore the color grid. Each game has a unique procedurally-generated grid!",
    hint: "Try clicking cells to preview scoring zones before the game starts.",
  },
  {
    label: "Pick Color (Leader)",
    description: "The Leader picks a target color from the grid. Nobody else can see which cell they chose.",
    hint: "Think about what words could describe this color - you'll give 2 clues total!",
  },
  {
    label: "Clue 1 & Guess 1",
    description: "The Leader gives a one-word clue. Guessers must click the cell they think matches and lock in their guess.",
    hint: "In Hard Mode, you can't use color names like 'red' or 'blue'!",
  },
  {
    label: "Clue 2 & Guess 2",
    description: "The Leader sees where guessers picked and gives a second, more specific clue. Guessers can change their pick.",
    hint: "The Leader can see round-1 markers to tailor their second clue!",
  },
  {
    label: "Reveal",
    description: "The target is revealed with scoring zones. Players score based on distance (Chebyshev). Leader gets bonus points too!",
    hint: "Every player takes a turn as Leader before the game ends.",
  },
  {
    label: "Scoring",
    description: "Guessers score on how many grid steps their pick sits from the target. Diagonals count as one step, so the scoring zones come out as squares around the target.",
    hint: "The Leader scores the average of their guessers, so a clue everyone reads well pays you too.",
  },
];

/* ── Component ──────────────────────────────────────────── */

export function ShadeDemo({ onClose, initialStep = 0 }: { onClose: () => void; initialStep?: number }) {
  const initialStepRef = useRef(initialStep);
  const [step, setStep] = useState(initialStepRef.current);
  const [clue, setClue] = useState("");
  const [selectedCell, setSelectedCell] = useState<{ row: number; col: number } | null>(null);
  const [lobbyPreview, setLobbyPreview] = useState<{ row: number; col: number } | null>(null);

  const targetColor = generateGridColor(TARGET.row, TARGET.col, GRID.rows, GRID.cols, GRID.seed);
  const noop = (e?: FormEvent) => e?.preventDefault();

  const renderStep = () => {
    switch (step) {
      case 0: // Lobby
        return (
          <div className="game-page shade-page" data-game-theme="shade">
            <DemoPoint label="Explore the grid - click cells to preview scoring zones">
              <ColorGrid
                rows={GRID.rows}
                cols={GRID.cols}
                seed={GRID.seed}
                target={lobbyPreview}
                onSelect={(r, c) => setLobbyPreview({ row: r, col: c })}
                interactive
                showTarget={!!lobbyPreview}
                showZones={!!lobbyPreview}
                showScoreTooltips={!!lobbyPreview}
              />
            </DemoPoint>
            {lobbyPreview && <ScoringLegend />}
          </div>
        );

      case 1: // Leader picks
        return (
          <div className="game-page shade-page" data-game-theme="shade">
            <DemoPoint label="As the Leader, pick your target color">
              <div className="game-section shade-clue-section">
                <div className="shade-clue-leader-info">
                  <h3>Pick your target color!</h3>
                  <p>Tap the color you want to give clues about.</p>
                </div>
                <ColorGrid
                  rows={GRID.rows}
                  cols={GRID.cols}
                  seed={GRID.seed}
                  selected={selectedCell}
                  onSelect={(r, c) => setSelectedCell({ row: r, col: c })}
                  interactive
                />
                {selectedCell && (
                  <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", justifyContent: "center", marginTop: "0.5rem" }}>
                    <div style={{
                      width: "32px", height: "32px", borderRadius: "6px",
                      background: generateGridColor(selectedCell.row, selectedCell.col, GRID.rows, GRID.cols, GRID.seed),
                      border: "2px solid rgba(255,255,255,0.3)"
                    }} />
                    <span style={{ fontSize: "0.8rem", color: "var(--secondary)" }}>Selected</span>
                  </div>
                )}
              </div>
            </DemoPoint>
          </div>
        );

      case 2: // Clue 1 + Guess 1
        return (
          <div className="game-page shade-page" data-game-theme="shade">
            <DemoPoint label="Leader view - give a one-word clue about your target">
              <div className="game-section shade-clue-section">
                <div className="shade-clue-leader-info">
                  <h3>You are the Leader!</h3>
                  <p>Give a <strong>one-word</strong> clue to help guessers find your target color.</p>
                </div>
                <div className="shade-target-preview">
                  <div className="shade-target-swatch" style={{ background: targetColor }} />
                  <span className="shade-target-label">Your target ↑</span>
                </div>
                <ColorGrid rows={GRID.rows} cols={GRID.cols} seed={GRID.seed} target={TARGET} showTarget />
                <form className="shade-clue-form" onSubmit={noop}>
                  <input
                    className="input shade-clue-input"
                    value={clue}
                    onChange={(e) => setClue(e.target.value)}
                    placeholder="One word clue…"
                    maxLength={60}
                  />
                  <button className="btn btn-primary" type="submit" disabled={!clue.trim()}>
                    <FiSend size={14} /> Send
                  </button>
                </form>
              </div>
            </DemoPoint>

            <hr style={{ border: 0, borderTop: "1px dashed var(--border)", margin: "1rem 0" }} />

            <DemoPoint label="Guesser view - click a cell based on the clue">
              <div className="game-section shade-guess-section">
                <div className="shade-clue-display-row">
                  <div className="shade-clue-display">
                    <span className="shade-clue-tag">Clue 1</span>
                    <span className="shade-clue-word">Teal</span>
                  </div>
                </div>
                <p className="shade-guess-prompt">Tap the color you think the leader means!</p>
                <ColorGrid
                  rows={GRID.rows}
                  cols={GRID.cols}
                  seed={GRID.seed}
                  selected={selectedCell}
                  onSelect={(r, c) => setSelectedCell({ row: r, col: c })}
                  interactive
                />
              </div>
            </DemoPoint>
          </div>
        );

      case 3: // Clue 2 + Guess 2 (Leader sees guess1 markers)
        return (
          <div className="game-page shade-page" data-game-theme="shade">
            <DemoPoint label="Leader sees where guessers picked and gives a better clue">
              <div className="game-section shade-clue-section">
                <div className="shade-clue-leader-info">
                  <h3>Give a second clue!</h3>
                  <p>Give a <strong>second clue</strong> (up to 2 words) to help guessers refine their guess.</p>
                </div>
                <ColorGrid
                  rows={GRID.rows}
                  cols={GRID.cols}
                  seed={GRID.seed}
                  target={TARGET}
                  showTarget
                  markers={GUESS_MARKERS_ROUND1}
                />
                <p style={{ fontSize: "0.75rem", color: "var(--secondary)", textAlign: "center", marginTop: "0.25rem" }}>
                  Showing where guessers picked after your first clue
                </p>
              </div>
            </DemoPoint>
          </div>
        );

      case 4: // Reveal
        return (
          <div className="game-page shade-page" data-game-theme="shade">
            <DemoPoint label="Target revealed with scoring zones and guess markers">
              <div className="game-section shade-reveal-section">
                <h3 className="shade-reveal-title">Reveal!</h3>
                <div className="shade-reveal-target">
                  <div className="shade-reveal-swatch" style={{ background: targetColor }} />
                  <div className="shade-reveal-info">
                    <span>Target Color</span>
                    <span className="shade-reveal-clues">
                      <em>"Teal"</em> → <em>"Deep ocean"</em>
                    </span>
                  </div>
                </div>
                <ColorGrid
                  rows={GRID.rows}
                  cols={GRID.cols}
                  seed={GRID.seed}
                  target={TARGET}
                  showTarget
                  showZones
                  markers={REVEAL_MARKERS}
                />
                <ScoringLegend />
              </div>
            </DemoPoint>
          </div>
        );

      case 5: // Scoring
        return (
          <DemoScoring
            columns={["Steps from the target", "Points"]}
            rows={[
              { label: "Exact cell", value: "5" },
              { label: "1 away", value: "3" },
              { label: "2 away", value: "2" },
              { label: "3 away", value: "1" },
              { label: "4 or more away", value: "0" },
            ]}
            rules={[
              { icon: <FiUser size={13} />, title: "Leader's score", text: "The Leader banks the average of every guesser's score for the round, rounded." },
              { icon: <FiEdit3 size={13} />, title: "Clue rules", text: "Clue 1 is one word, clue 2 can be two. Hard mode blocks plain colour names." },
              { icon: <FiGrid size={13} />, title: "The grid", text: "Every game generates its own colour grid from a seed, so no two boards match." },
              { icon: <FiRefreshCw size={13} />, title: "Rotation", text: "Everyone takes a turn leading, then the highest total score wins." },
            ]}
          />
        );

      default:
        return null;
    }
  };

  return (
    <DemoModal
      title="Shade Signal"
      icon={<GameIcon game="shade" size={20} />}
      color="#f472b6"
      steps={steps}
      currentStep={step}
      onStepChange={setStep}
      onClose={onClose}
    >
      {renderStep()}
    </DemoModal>
  );
}

function ScoringLegend() {
  return (
    <div className="shade-scoring-legend">
      {ZONE_LEGEND.map((z) => (
        <span key={z.pts} className="shade-scoring-legend-item">
          <span className={`shade-scoring-swatch ${z.cls}`} />
          {z.label} = {z.pts}pt{z.pts > 1 ? "s" : ""}
        </span>
      ))}
    </div>
  );
}
