import { FormEvent } from "react";

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
  return (
    <div className="panel space-y-3">
      <p style={{ fontSize: "0.875rem", color: "var(--muted-foreground)" }}>
        Your role: <strong style={{ color: "var(--primary)" }}>{role ?? "unknown"}</strong>
        {role === "player" && secretWord ? ` — secret word: ${secretWord}` : ""}
      </p>
      <form className="space-y-2" onSubmit={onSubmit}>
        <label htmlFor="clue" style={{ color: "var(--muted-foreground)", fontSize: "0.875rem", fontWeight: 600 }}>
          Submit your clue
        </label>
        <input
          id="clue"
          className="input"
          value={clue}
          onChange={(event) => onClueChange(event.target.value)}
          maxLength={80}
        />
        <button type="submit" className="btn btn-primary">
          Send clue
        </button>
      </form>
      <p style={{ fontSize: "0.75rem", color: "var(--secondary)" }}>Clues submitted: {clueCount}/{playerCount}</p>
    </div>
  );
}
