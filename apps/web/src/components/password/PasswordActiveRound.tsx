import { Button, Label, TextInput } from "flowbite-react";
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
    <div className="space-y-3 rounded border p-3">
      <p className="text-sm text-gray-600">
        Clue giver: {names[activeRound.clueGiverId] ?? activeRound.clueGiverId.slice(0, 6)}
        {" • "}
        Guesser: {names[activeRound.guesserId] ?? activeRound.guesserId.slice(0, 6)}
      </p>

      {isClueGiver && !activeRound.clue ? (
        <form className="space-y-2" onSubmit={onSubmitClue}>
          <Label htmlFor="word" value="Secret word" />
          <TextInput id="word" value={word} onChange={(event) => onWordChange(event.target.value)} maxLength={40} />
          <Label htmlFor="clue" value="One-word clue" />
          <TextInput id="clue" value={clue} onChange={(event) => onClueChange(event.target.value)} maxLength={80} />
          <Button type="submit" className="bg-[var(--color-primary-500)] hover:bg-[var(--color-primary-600)]">Submit clue</Button>
        </form>
      ) : null}

      {activeRound.clue ? (
        <p className="text-sm">
          Clue: <strong>{activeRound.clue}</strong>
        </p>
      ) : (
        <p className="text-sm text-gray-500">Waiting for clue giver.</p>
      )}

      {isGuesser && activeRound.clue ? (
        <form className="space-y-2" onSubmit={onSubmitGuess}>
          <Label htmlFor="guess" value="Your guess" />
          <TextInput id="guess" value={guess} onChange={(event) => onGuessChange(event.target.value)} maxLength={40} />
          <Button type="submit" className="bg-[var(--color-primary-500)] hover:bg-[var(--color-primary-600)]">Submit guess</Button>
        </form>
      ) : null}
    </div>
  );
}
