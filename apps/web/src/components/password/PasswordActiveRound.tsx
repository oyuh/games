import { FormEvent } from "react";
import { FiSend } from "react-icons/fi";

type ActiveRound = {
  teamIndex: number;
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
  clue,
  guess,
  onClueChange,
  onGuessChange,
  onSubmitClue,
  onSubmitGuess
}: {
  activeRound: ActiveRound;
  names: Record<string, string>;
  sessionId: string;
  teamMembers: string[];
  clue: string;
  guess: string;
  onClueChange: (value: string) => void;
  onGuessChange: (value: string) => void;
  onSubmitClue: (event: FormEvent) => void;
  onSubmitGuess: (event: FormEvent) => void;
}) {
  const guesserName = names[activeRound.guesserId] ?? activeRound.guesserId.slice(0, 6);
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
          <span className="game-round-role-label">Guesser</span>
          <span className={`game-round-role-name${isGuesser ? " game-round-role-name--me" : ""}`}>
            {guesserName}{isGuesser ? " (you)" : ""}
          </span>
        </div>
      </div>

      {/* Wrong guess — retry notice */}
      {hasWrongGuess && (
        <div className="game-reveal-card game-reveal-card--fail" style={{ marginBottom: "1rem" }}>
          <p className="game-reveal-title">Incorrect!</p>
          <p className="game-reveal-sub">
            "{activeRound.guess}" was wrong — submit new clues!
          </p>
        </div>
      )}

      {/* Clue givers submit one-word clues (not all clues in yet) */}
      {activeRound.word && !allCluesIn && isClueGiver && !alreadyClued && (
        <>
          <div className="game-clue-reveal" style={{ marginBottom: "0.75rem" }}>
            <span className="game-clue-reveal-label">Secret Word</span>
            <span className="game-clue-reveal-word">{activeRound.word}</span>
          </div>
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
