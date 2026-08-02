import { useRef, useState } from "react";
import { FiAward, FiLink, FiHelpCircle, FiXCircle, FiZap } from "react-icons/fi";
import { DemoModal, DemoPoint, DemoScoring, type DemoStep } from "./DemoModal";
import { PasswordHeader } from "../password/PasswordHeader";
import { ChainGuessField } from "../chain/ChainGuessField";
import "../../styles/game-shared.css";
import "../../styles/chain-reaction.css";

/* ── Fake data ──────────────────────────────────────────── */

const P = { you: "demo-you", alice: "demo-alice" };
const NAMES: Record<string, string> = { [P.you]: "You", [P.alice]: "Alice" };

type Slot = { word: string; revealed: boolean; lettersShown: number; solvedBy?: string | null };

const CHAIN_YOURS: Slot[] = [
  { word: "Cat", revealed: true, lettersShown: 3 },
  { word: "Whiskers", revealed: false, lettersShown: 0 },
  { word: "Broom", revealed: false, lettersShown: 2 },
  { word: "Witch", revealed: false, lettersShown: 0 },
  { word: "Spell", revealed: true, lettersShown: 5 },
];

const CHAIN_SOLVED: Slot[] = [
  { word: "Cat", revealed: true, lettersShown: 3 },
  { word: "Whiskers", revealed: true, lettersShown: 0, solvedBy: P.you },
  { word: "Broom", revealed: true, lettersShown: 2, solvedBy: P.you },
  { word: "Witch", revealed: true, lettersShown: 1, solvedBy: P.you },
  { word: "Spell", revealed: true, lettersShown: 5 },
];

const SUBMIT_WORDS = ["Moon", "Night", "Owl", "Wisdom", "Book"];

/* ── Steps ──────────────────────────────────────────────── */

const steps: DemoStep[] = [
  {
    label: "Lobby",
    description: "Two players face off in a 1v1 word chain duel! Join the open slot and wait for the host to start.",
    hint: "Supports premade chains (auto-generated) or custom chains (you write your own).",
  },
  {
    label: "Write Chain (Custom)",
    description: "In custom mode, each player writes a chain of connected words. The first and last words are given as hints for your opponent.",
    hint: "Make the middle words tricky - your opponent has to guess them!",
  },
  {
    label: "Solve the Chain",
    description: "Click any hidden word to type your guess. The first and last words are visible as hints. Wrong guesses auto-reveal one letter.",
    hint: "Think about how each word connects to its neighbors in the chain!",
  },
  {
    label: "Hints & Give Up",
    description: "Use the hint button (left) to reveal a letter (costs points). Use give-up (right) to skip a hard word for 0 points.",
    hint: "A wrong guess reveals a letter too, so guessing wildly costs the same as asking.",
  },
  {
    label: "Finished",
    description: "The player with the most points wins! See round-by-round breakdown of both chains.",
    hint: "Play again to swap chains - you'll solve what your opponent wrote!",
  },
  {
    label: "Scoring",
    description: "Each word you crack is worth points based on how much of it was showing when you got it. Letters get revealed by hints and by wrong guesses alike.",
    hint: "A clean word is worth three times a word you brute-forced open.",
  },
];

/* ── Component ──────────────────────────────────────────── */

export function ChainDemo({ onClose, initialStep = 0 }: { onClose: () => void; initialStep?: number }) {
  const initialStepRef = useRef(initialStep);
  const [step, setStep] = useState(initialStepRef.current);

  const renderChain = (chain: Slot[], interactive: boolean) => (
    <div className="cr-chain">
      {chain.map((slot, i) => {
        const isEdge = i === 0 || i === chain.length - 1;
        return (
          <div key={slot.word} className="cr-slot-outer">
            <div className="cr-slot-wrapper">
              {/* Hint button placeholder */}
              {interactive && !isEdge && !slot.revealed ? (
                <button className="cr-action-hint" disabled={slot.lettersShown >= slot.word.length - 1}>
                  <FiHelpCircle size={18} />
                </button>
              ) : (
                <div className="cr-action-spacer" />
              )}

              <div
                className={[
                  "cr-word-slot",
                  slot.revealed ? "cr-word-slot--revealed" : "cr-word-slot--hidden",
                  interactive && !slot.revealed ? "cr-word-slot--clickable" : "",
                  slot.solvedBy === P.you ? "cr-word-slot--mine" : "",
                  slot.revealed && !slot.solvedBy && !isEdge ? "cr-word-slot--givenup" : "",
                ].filter(Boolean).join(" ")}
              >
                <span className="cr-slot-idx">{i + 1}</span>
                <div className="cr-slot-body">
                  {slot.revealed ? (
                    <span className="cr-word-text">{slot.word}</span>
                  ) : (
                    <ChainGuessField word={slot.word} lettersShown={slot.lettersShown} value="" readOnly />
                  )}
                </div>
                {isEdge && slot.revealed && <span className="cr-slot-tag">hint</span>}
                {slot.solvedBy && !isEdge && (
                  <span className="cr-solver-tag cr-solver-tag--me">you</span>
                )}
              </div>

              {/* Give-up button placeholder */}
              {interactive && !isEdge && !slot.revealed ? (
                <button className="cr-action-giveup">
                  <FiXCircle size={18} />
                </button>
              ) : (
                <div className="cr-action-spacer" />
              )}
            </div>
            {i < chain.length - 1 && <div className="cr-chain-connector" />}
          </div>
        );
      })}
    </div>
  );

  const renderStep = () => {
    switch (step) {
      case 0: // Lobby
        return (
          <div className="game-page" data-game-theme="chain">
            <PasswordHeader title="Chain Reaction" code="DEMO" phase="lobby" isHost category="moviesAndShows" />
            <DemoPoint label="1v1 duel - two player slots">
              <div className="game-section">
                <div className="cr-lobby-duel">
                  <div className="cr-lobby-slot cr-lobby-slot--filled cr-lobby-slot--me">
                    <div className="cr-lobby-avatar">Y</div>
                    <span className="cr-lobby-name">You</span>
                    <span className="cr-lobby-you">you</span>
                    <span className="badge" style={{ fontSize: "0.75rem" }}>host</span>
                  </div>
                  <div className="cr-lobby-vs">VS</div>
                  <div className="cr-lobby-slot cr-lobby-slot--filled">
                    <div className="cr-lobby-avatar cr-lobby-avatar--opp">A</div>
                    <span className="cr-lobby-name">Alice</span>
                  </div>
                </div>
                <p className="cr-mode-info">Mode: <strong>Custom Chains</strong></p>
              </div>
            </DemoPoint>
          </div>
        );

      case 1: // Submit chain
        return (
          <div className="game-page" data-game-theme="chain">
            <PasswordHeader title="Chain Reaction" code="DEMO" phase="submitting" category="moviesAndShows" />
            <DemoPoint label="Write connected words - first & last are shown as hints">
              <div className="game-section">
                <div className="cr-chain">
                  {SUBMIT_WORDS.map((word, i) => {
                    const isEdge = i === 0 || i === SUBMIT_WORDS.length - 1;
                    return (
                      <div key={word} className="cr-submit-slot">
                        <span className="cr-slot-num">{i + 1}</span>
                        <input
                          className="cr-submit-input"
                          defaultValue={word}
                          placeholder={isEdge ? "Hint word (shown)" : "Hidden word"}
                          maxLength={30}
                          readOnly
                        />
                        {isEdge && <span className="cr-slot-tag">visible</span>}
                        {i < SUBMIT_WORDS.length - 1 && <div className="cr-chain-connector" />}
                      </div>
                    );
                  })}
                </div>
              </div>
            </DemoPoint>
          </div>
        );

      case 2: // Solve chain
        return (
          <div className="game-page" data-game-theme="chain">
            <PasswordHeader title="Chain Reaction" code="DEMO" phase="playing" currentRound={1} category="moviesAndShows" />
            <DemoPoint label="Click any hidden word to type your guess">
              <div className="game-section">
                <span className="cr-view-label">Solve the chain - tap a word to guess!</span>
                {renderChain(CHAIN_YOURS, true)}
                <p className="game-progress-text">0 / 3 words cracked</p>
              </div>
            </DemoPoint>
          </div>
        );

      case 3: // Hints & give up
        return (
          <div className="game-page" data-game-theme="chain">
            <PasswordHeader title="Chain Reaction" code="DEMO" phase="playing" currentRound={1} category="moviesAndShows" />
            <div className="game-section">
              <span className="cr-view-label">Use hints or give up on tough words</span>
              <DemoPoint label="Hint button reveals a letter, give-up skips the word">
                {renderChain(CHAIN_YOURS, true)}
              </DemoPoint>
            </div>
          </div>
        );

      case 4: // Finished
        return (
          <div className="game-page" data-game-theme="chain">
            <PasswordHeader title="Chain Reaction" code="DEMO" phase="finished" category="moviesAndShows" />
            <DemoPoint label="Winner is announced with final scores">
              <div className="game-section">
                <div className="cr-winner-card cr-winner-card--win">
                  <FiAward className="cr-winner-icon" size={30} />
                  <div>
                    <p className="cr-winner-title">You Win!</p>
                    <p className="cr-winner-sub">8 – 6</p>
                  </div>
                </div>
              </div>
            </DemoPoint>
            <DemoPoint label="See both chains fully revealed">
              <div className="game-section">
                <h3 className="game-section-label">Your Chain</h3>
                {renderChain(CHAIN_SOLVED, false)}
              </div>
            </DemoPoint>
          </div>
        );

      case 5: // Scoring
        return (
          <DemoScoring
            columns={["Letters showing when you solve it", "Points"]}
            rows={[
              { label: "2 or fewer", value: "3" },
              { label: "3 or 4", value: "2" },
              { label: "5 or more", value: "1" },
              { label: "You gave up on the word", value: "0" },
            ]}
            rules={[
              { icon: <FiHelpCircle size={13} />, title: "Hints", text: "The hint button reveals one more letter. It never reveals the whole word." },
              { icon: <FiXCircle size={13} />, title: "Wrong guesses", text: "A wrong guess reveals a letter as well, so it costs you exactly what a hint does." },
              { icon: <FiZap size={13} />, title: "Last word bonus", text: "Solving the final hidden word in your chain is worth one extra point." },
              { icon: <FiAward size={13} />, title: "Winning", text: "Highest total across the chain takes it. The first and last words are free hints." },
            ]}
          />
        );

      default:
        return null;
    }
  };

  return (
    <DemoModal
      title="Chain Reaction"
      icon={<FiLink size={20} />}
      color="#34d399"
      steps={steps}
      currentStep={step}
      onStepChange={setStep}
      onClose={onClose}
    >
      {renderStep()}
    </DemoModal>
  );
}
