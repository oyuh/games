import { FormEvent, useEffect, useRef } from "react";
import { FiEye, FiEyeOff, FiSend, FiCheck } from "react-icons/fi";
import { DEFAULT_IMPOSTER_CLUE_VISIBILITY, imposterCategoryLabels } from "@games/shared";
import { getDisplayName } from "../../lib/session";

/** Redact a clue by showing one contiguous chunk of each word. */
function redactClue(text: string, visibility = DEFAULT_IMPOSTER_CLUE_VISIBILITY): string {
  const clampedVisibility = Number.isFinite(visibility)
    ? Math.min(1, Math.max(0, visibility))
    : DEFAULT_IMPOSTER_CLUE_VISIBILITY;

  if (clampedVisibility >= 1) return text;

  return text.split(" ").map((word) => {
    const len = word.length;
    if (clampedVisibility <= 0) return "_".repeat(len);
    if (len <= 2) return "_".repeat(len);
    const showCount = Math.max(1, Math.floor(len * clampedVisibility));
    // Start the revealed chunk at a deterministic offset (~20% in)
    const start = Math.min(Math.floor(len * 0.2), len - showCount);
    return word.split("").map((ch, i) =>
      i >= start && i < start + showCount ? ch : "_"
    ).join("");
  }).join(" ");
}

export function ImposterClueSection({
  role,
  secretWord,
  category,
  clue,
  clueCount,
  playerCount,
  submitted,
  clues,
  sessionId,
  sessionById,
  clueVisibility,
  onClueChange,
  onSubmit
}: {
  role: "imposter" | "player" | undefined;
  secretWord: string | null;
  category: string | null;
  clue: string;
  clueCount: number;
  playerCount: number;
  submitted: boolean;
  clues: Array<{ sessionId: string; text: string }>;
  sessionId: string;
  sessionById: Record<string, string>;
  clueVisibility?: number;
  onClueChange: (value: string) => void;
  onSubmit: (event: FormEvent) => void;
}) {
  const isImposter = role === "imposter";
  const othersClues = clues.filter((c) => c.sessionId !== sessionId);
  const clueInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (submitted) return;
    const input = clueInputRef.current;
    if (!input) return;
    const timer = window.setTimeout(() => {
      input.focus();
      input.select();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [role, submitted]);

  return (
    <div className="game-section">
      {category && (
        <p style={{ fontSize: "0.78rem", color: "var(--secondary)", textAlign: "center", marginBottom: "0.5rem" }}>
          Category: <strong style={{ color: "var(--foreground)" }}>{imposterCategoryLabels[category] ?? category}</strong>
        </p>
      )}
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

      {isImposter && clueVisibility !== 0 && othersClues.length > 0 && (
        <div style={{ marginBottom: "0.75rem" }}>
          <h4 className="game-section-label" style={{ fontSize: "0.8rem", opacity: 0.7 }}>Hints from other clues</h4>
          <div className="game-clue-recap">
            {othersClues.map((c) => {
              const name = sessionById[c.sessionId] ?? getDisplayName(null, c.sessionId);
              return (
                <div key={c.sessionId} className="game-clue-item">
                  <span className="game-clue-name">{name}</span>
                  <span className="game-clue-text" style={{ fontFamily: "monospace", letterSpacing: "0.04em" }}>
                    {redactClue(c.text, clueVisibility)}
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
            ref={clueInputRef}
            className="input flex-1"
            onFocus={(e) => e.currentTarget.select()}
            value={clue}
            onChange={(e) => onClueChange(e.target.value)}
            placeholder={isImposter ? "Give a vague clue…" : "Give a clue about the word…"}
            maxLength={80}
          />
          <button
            type="submit"
            className="btn btn-primary"
            disabled={!clue.trim()}
            onMouseDown={(event) => event.preventDefault()}
          >
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
