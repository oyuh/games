import { FormEvent } from "react";
import { FiEye, FiEyeOff, FiSend, FiCheck } from "react-icons/fi";

/** Redact roughly half the letters in a clue, keeping first and last visible. */
function redactClue(text: string): string {
  if (text.length <= 2) return text[0] + "_".repeat(text.length - 1);
  const chars = text.split("");
  // Always show first and last character of each word
  const result = chars.map((ch, i) => {
    if (ch === " ") return " ";
    // Find word boundaries
    const isFirst = i === 0 || chars[i - 1] === " ";
    const isLast = i === chars.length - 1 || chars[i + 1] === " ";
    if (isFirst || isLast) return ch;
    // Hide ~50% of middle characters using a simple deterministic pattern
    return i % 2 === 0 ? "_" : ch;
  });
  return result.join("");
}

export function ImposterClueSection({
  role,
  secretWord,
  clue,
  clueCount,
  playerCount,
  submitted,
  clues,
  sessionId,
  sessionById,
  onClueChange,
  onSubmit
}: {
  role: "imposter" | "player" | undefined;
  secretWord: string | null;
  clue: string;
  clueCount: number;
  playerCount: number;
  submitted: boolean;
  clues: Array<{ sessionId: string; text: string }>;
  sessionId: string;
  sessionById: Record<string, string>;
  onClueChange: (value: string) => void;
  onSubmit: (event: FormEvent) => void;
}) {
  const isImposter = role === "imposter";
  const othersClues = clues.filter((c) => c.sessionId !== sessionId);

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

      {isImposter && othersClues.length > 0 && (
        <div style={{ marginBottom: "0.75rem" }}>
          <h4 className="game-section-label" style={{ fontSize: "0.8rem", opacity: 0.7 }}>Hints from other clues</h4>
          <div className="game-clue-recap">
            {othersClues.map((c) => {
              const name = sessionById[c.sessionId] ?? c.sessionId.slice(0, 6);
              return (
                <div key={c.sessionId} className="game-clue-item">
                  <span className="game-clue-name">{name}</span>
                  <span className="game-clue-text" style={{ fontFamily: "monospace", letterSpacing: "0.1em" }}>
                    {redactClue(c.text)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {submitted ? (
        <div className="game-reveal-card game-reveal-card--success" style={{ marginTop: "0.75rem" }}>
          <p className="game-reveal-title" style={{ display: "flex", alignItems: "center", gap: "0.5rem", justifyContent: "center" }}>
            <FiCheck size={18} /> Clue Submitted!
          </p>
          <p className="game-reveal-sub">Waiting for other players…</p>
        </div>
      ) : (
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
      )}

      <p className="game-progress-text">
        Clues submitted: {clueCount} / {playerCount}
      </p>
    </div>
  );
}
