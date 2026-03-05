import { FormEvent } from "react";

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
  return (
    <div className="panel space-y-3">
      <p style={{ fontSize: "0.875rem", color: "var(--muted-foreground)" }}>
        Clue giver: {names[activeRound.clueGiverId] ?? activeRound.clueGiverId.slice(0, 6)}
        {" • "}
        Guesser: {names[activeRound.guesserId] ?? activeRound.guesserId.slice(0, 6)}
      </p>

      {isClueGiver && !activeRound.clue ? (
        <form className="space-y-2" onSubmit={onSubmitClue}>
          <label htmlFor="word" style={{ color: "var(--muted-foreground)", fontSize: "0.875rem", fontWeight: 600 }}>Secret word</label>
          <input id="word" className="input" value={word} onChange={(event) => onWordChange(event.target.value)} maxLength={40} />
          <label htmlFor="clue" style={{ color: "var(--muted-foreground)", fontSize: "0.875rem", fontWeight: 600 }}>One-word clue</label>
          <input id="clue" className="input" value={clue} onChange={(event) => onClueChange(event.target.value)} maxLength={80} />
          <button type="submit" className="btn btn-primary">Submit clue</button>
        </form>
      ) : null}

      {activeRound.clue ? (
        <p style={{ fontSize: "0.875rem", color: "var(--foreground)" }}>
          Clue: <strong style={{ color: "var(--primary)" }}>{activeRound.clue}</strong>
        </p>
      ) : (
        <p style={{ fontSize: "0.875rem", color: "var(--secondary)" }}>Waiting for clue giver.</p>
      )}

      {isGuesser && activeRound.clue ? (
        <form className="space-y-2" onSubmit={onSubmitGuess}>
          <label htmlFor="guess" style={{ color: "var(--muted-foreground)", fontSize: "0.875rem", fontWeight: 600 }}>Your guess</label>
          <input id="guess" className="input" value={guess} onChange={(event) => onGuessChange(event.target.value)} maxLength={40} />
          <button type="submit" className="btn btn-primary">Submit guess</button>
        </form>
      ) : null}
    </div>
  );
}
