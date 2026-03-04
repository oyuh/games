import { Button, Label, TextInput } from "flowbite-react";
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
    <div className="space-y-3 rounded border p-3">
      <p className="text-sm text-gray-600">
        Your role: <strong>{role ?? "unknown"}</strong>
        {role === "player" && secretWord ? ` — secret word: ${secretWord}` : ""}
      </p>
      <form className="space-y-2" onSubmit={onSubmit}>
        <Label htmlFor="clue" value="Submit your clue" />
        <TextInput id="clue" value={clue} onChange={(event) => onClueChange(event.target.value)} maxLength={80} />
        <Button type="submit" className="bg-[var(--color-primary-500)] hover:bg-[var(--color-primary-600)]">
          Send clue
        </Button>
      </form>
      <p className="text-xs text-gray-500">Clues submitted: {clueCount}/{playerCount}</p>
    </div>
  );
}
