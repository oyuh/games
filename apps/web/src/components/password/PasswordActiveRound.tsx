import { FormEvent } from "react";
import { FiSend } from "react-icons/fi";

type ActiveRound = {
  teamIndex: number;
  wordPickerId: string;
  guesserId: string;
  word: string | null;
  clues: Array<{ sessionId: string; text: string }>;
  guess: string | null;
};

export function PasswordActiveRound({
  activeRound,
  names,
  sessionId,
  teamMembers,
  word,
  clue,
  guess,
  onWordChange,
  onClueChange,
  onGuessChange,
  onSetWord,
  onSubmitClue,
  onSubmitGuess
}: {
  activeRound: ActiveRound;
  names: Record<string, string>;
  sessionId: string;
  teamMembers: string[];
  word: string;
  clue: string;
  guess: string;
  onWordChange: (value: string) => void;
  onClueChange: (value: string) => void;
  onGuessChange: (value: string) => void;
  onSetWord: (event: FormEvent) => void;
  onSubmitClue: (event: FormEvent) => void;
  onSubmitGuess: (event: FormEvent) => void;
}) {
  const pickerName = names[activeRound.wordPickerId] ?? activeRound.wordPickerId.slice(0, 6);
  const guesserName = names[activeRound.guesserId] ?? activeRound.guesserId.slice(0, 6);
  const isWordPicker = activeRound.wordPickerId === sessionId;
  const isGuesser = activeRound.guesserId === sessionId;
  const isOnTeam = teamMembers.includes(sessionId);
  const isClueGiver = isOnTeam && !isGuesser;
  const alreadyClued = activeRound.clues.some((c) => c.sessionId === sessionId);
  const clueGiverCount = teamMembers.filter((m) => m !== activeRound.guesserId).length;
  const allCluesIn = activeRound.clues.length >= clueGiverCount;
  const hasWrongGuess = activeRound.guess !== null && activeRound.clues.length === 0;

  return (
    <div className="game-section">
      <div className="game-round-roles">
        <div className="game-round-role">
          <span className="game-round-role-label">Word Picker</span>
          <span className={`game-round-role-name${isWordPicker ? " game-round-role-name--me" : ""}`}>
            {pickerName}{isWordPicker ? " (you)" : ""}
          </span>
        </div>
        <div className="game-round-role">
          <span className="game-round-role-label">Guesser</span>
          <span className={`game-round-role-name${isGuesser ? " game-round-role-name--me" : ""}`}>
            {guesserName}{isGuesser ? " (you)" : ""}
          </span>
        </div>
      </div>

      {/* Phase 1: Word picker sets the word */}
      {!activeRound.word && isWordPicker && (
        <form className="game-clue-form" onSubmit={onSetWord}>
          <div className="game-input-group">
            <label className="game-input-label">Choose a Secret Word</label>
            <input
              className="input"
              value={word}
              onChange={(e) => onWordChange(e.target.value)}
              placeholder="Type the secret word…"
              maxLength={40}
            />
          </div>
          <button type="submit" className="btn btn-primary game-action-btn" disabled={!word.trim()}>
            <FiSend size={14} /> Set Word
          </button>
        </form>
      )}

      {!activeRound.word && !isWordPicker && (
        <div className="game-waiting">
          <div className="game-waiting-pulse" />
          <p>Waiting for {pickerName} to pick a word…</p>
        </div>
      )}

      {/* Wrong guess — retry notice */}
      {hasWrongGuess && (
        <div className="game-reveal-card game-reveal-card--fail" style={{ marginBottom: "1rem" }}>
          <p className="game-reveal-title">Incorrect!</p>
          <p className="game-reveal-sub">
            "{activeRound.guess}" was wrong — submit new clues!
          </p>
        </div>
      )}

      {/* Phase 2: Clue givers submit one-word clues (word is set, not all clues in) */}
      {activeRound.word && !allCluesIn && isClueGiver && !alreadyClued && (
        <>
          {!isGuesser && (
            <div className="game-clue-reveal" style={{ marginBottom: "0.75rem" }}>
              <span className="game-clue-reveal-label">Secret Word</span>
              <span className="game-clue-reveal-word">{activeRound.word}</span>
            </div>
          )}
          <form className="game-input-row" onSubmit={onSubmitClue}>
            <input
              className="input flex-1"
              value={clue}
              onChange={(e) => onClueChange(e.target.value)}
              placeholder="One-word clue…"
              maxLength={80}
            />
            <button type="submit" className="btn btn-primary game-action-btn" disabled={!clue.trim()}>
              <FiSend size={14} /> Send Clue
            </button>
          </form>
          <p className="game-progress-text">
            Clues: {activeRound.clues.length} / {clueGiverCount}
          </p>
        </>
      )}

      {activeRound.word && !allCluesIn && isClueGiver && alreadyClued && (
        <div className="game-waiting">
          <div className="game-waiting-pulse" />
          <p>Waiting for other teammates to submit clues… ({activeRound.clues.length}/{clueGiverCount})</p>
        </div>
      )}

      {activeRound.word && !allCluesIn && isGuesser && (
        <div className="game-waiting">
          <div className="game-waiting-pulse" />
          <p>Your teammates are writing clues… ({activeRound.clues.length}/{clueGiverCount})</p>
        </div>
      )}

      {activeRound.word && !allCluesIn && !isOnTeam && (
        <div className="game-waiting">
          <div className="game-waiting-pulse" />
          <p>Clue givers are submitting… ({activeRound.clues.length}/{clueGiverCount})</p>
        </div>
      )}

      {/* Phase 3: All clues in — guesser guesses */}
      {activeRound.word && allCluesIn && (
        <>
          <div className="game-section" style={{ padding: 0 }}>
            <h3 className="game-section-label">Clues</h3>
            <div className="game-clue-list" style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
              {activeRound.clues.map((c) => (
                <span key={c.sessionId} className="badge badge-primary" style={{ fontSize: "1rem", padding: "0.4rem 0.75rem" }}>
                  {c.text}
                </span>
              ))}
            </div>
          </div>

          {isGuesser && (
            <form className="game-input-row" onSubmit={onSubmitGuess}>
              <input
                className="input flex-1"
                value={guess}
                onChange={(e) => onGuessChange(e.target.value)}
                placeholder="Your guess…"
                maxLength={40}
              />
              <button type="submit" className="btn btn-primary game-action-btn" disabled={!guess.trim()}>
                <FiSend size={14} /> Guess
              </button>
            </form>
          )}

          {!isGuesser && (
            <div className="game-waiting">
              <div className="game-waiting-pulse" />
              <p>Waiting for {guesserName} to guess…</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
