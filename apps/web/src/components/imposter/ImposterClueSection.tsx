import { FormEvent } from "react";
import { FiEye, FiEyeOff, FiSend } from "react-icons/fi";

export function ImposterClueSection({
  role,
  secretWord,
  clue,
  clueCount,
  playerCount,
  onClueChange,
  onSubmit
}: {
  role: "imposter" | "player" | undefined;
  secretWord: string | null;
  clue: string;
  clueCount: number;
  playerCount: number;
  onClueChange: (value: string) => void;
  onSubmit: (event: FormEvent) => void;
}) {
  const isImposter = role === "imposter";

  return (
    <div className="game-section">
      <div className={`game-role-card${isImposter ? " game-role-card--danger" : ""}`}>
        <div className="game-role-icon">
          {isImposter ? <FiEyeOff size={24} /> : <FiEye size={24} />}
        </div>
        <div>
          <p className="game-role-title">
            {isImposter ? "You are the Imposter" : "You are a Player"}
          </p>
          {!isImposter && secretWord && (
            <p className="game-role-word">
              Secret word: <strong>{secretWord}</strong>
            </p>
          )}
          {isImposter && (
            <p className="game-role-hint">Blend in! Give a believable clue without knowing the word.</p>
          )}
        </div>
      </div>

      <form className="game-input-row" onSubmit={onSubmit}>
        <input
          className="input flex-1"
          value={clue}
          onChange={(e) => onClueChange(e.target.value)}
          placeholder={isImposter ? "Give a vague clue…" : "Give a clue about the word…"}
          maxLength={80}
        />
        <button type="submit" className="btn btn-primary" disabled={!clue.trim()}>
          <FiSend size={14} /> Send
        </button>
      </form>

      <p className="game-progress-text">
        Clues submitted: {clueCount} / {playerCount}
      </p>
    </div>
  );
}
