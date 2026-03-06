import { FormEvent } from "react";
import { FiSend } from "react-icons/fi";

type ActiveRound = {
  clueGiverId: string;
  guesserId: string;
  clue: string | null;
};

export function PasswordActiveRound({
  activeRound,
  names,
  isClueGiver,
  isGuesser,
  word,
  clue,
  guess,
  onWordChange,
  onClueChange,
  onGuessChange,
  onSubmitClue,
  onSubmitGuess
}: {
  activeRound: ActiveRound;
  names: Record<string, string>;
  isClueGiver: boolean;
  isGuesser: boolean;
  word: string;
  clue: string;
  guess: string;
  onWordChange: (value: string) => void;
  onClueChange: (value: string) => void;
  onGuessChange: (value: string) => void;
  onSubmitClue: (event: FormEvent) => void;
  onSubmitGuess: (event: FormEvent) => void;
}) {
  const giverName = names[activeRound.clueGiverId] ?? activeRound.clueGiverId.slice(0, 6);
  const guesserName = names[activeRound.guesserId] ?? activeRound.guesserId.slice(0, 6);

  return (
    <div className="game-section">
      <div className="game-round-roles">
        <div className="game-round-role">
          <span className="game-round-role-label">Clue Giver</span>
          <span className={`game-round-role-name${isClueGiver ? " game-round-role-name--me" : ""}`}>
            {giverName}{isClueGiver ? " (you)" : ""}
          </span>
        </div>
        <div className="game-round-role">
          <span className="game-round-role-label">Guesser</span>
          <span className={`game-round-role-name${isGuesser ? " game-round-role-name--me" : ""}`}>
            {guesserName}{isGuesser ? " (you)" : ""}
          </span>
        </div>
      </div>

      {isClueGiver && !activeRound.clue && (
        <form className="game-clue-form" onSubmit={onSubmitClue}>
          <div className="game-input-group">
            <label className="game-input-label">Secret Word</label>
            <input
              className="input"
              value={word}
              onChange={(e) => onWordChange(e.target.value)}
              placeholder="Type the secret word…"
              maxLength={40}
            />
          </div>
          <div className="game-input-group">
            <label className="game-input-label">One-Word Clue</label>
            <input
              className="input"
              value={clue}
              onChange={(e) => onClueChange(e.target.value)}
              placeholder="One word only…"
              maxLength={80}
            />
          </div>
          <button type="submit" className="btn btn-primary game-action-btn" disabled={!word.trim() || !clue.trim()}>
            <FiSend size={14} /> Submit Clue
          </button>
        </form>
      )}

      {!isClueGiver && !activeRound.clue && (
        <div className="game-waiting">
          <div className="game-waiting-pulse" />
          <p>Waiting for {giverName} to give a clue…</p>
        </div>
      )}

      {activeRound.clue && (
        <div className="game-clue-reveal">
          <span className="game-clue-reveal-label">Clue</span>
          <span className="game-clue-reveal-word">{activeRound.clue}</span>
        </div>
      )}

      {isGuesser && activeRound.clue && (
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

      {!isGuesser && activeRound.clue && (
        <div className="game-waiting">
          <div className="game-waiting-pulse" />
          <p>Waiting for {guesserName} to guess…</p>
        </div>
      )}
    </div>
  );
}
