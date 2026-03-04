import { Button, Label, Select } from "flowbite-react";

type Player = { sessionId: string };

export function ImposterVoteSection({
  players,
  sessionById,
  voteTarget,
  voteCount,
  playerCount,
  onVoteTargetChange,
  onSubmit
}: {
  players: Player[];
  sessionById: Record<string, string>;
  voteTarget: string;
  voteCount: number;
  playerCount: number;
  onVoteTargetChange: (value: string) => void;
  onSubmit: () => void;
}) {
  return (
    <div className="space-y-3 rounded border p-3">
      <Label htmlFor="vote" value="Vote for the imposter" />
      <Select id="vote" value={voteTarget} onChange={(event) => onVoteTargetChange(event.target.value)}>
        <option value="">Choose a player</option>
        {players.map((player) => (
          <option key={player.sessionId} value={player.sessionId}>
            {sessionById[player.sessionId] ?? player.sessionId.slice(0, 6)}
          </option>
        ))}
      </Select>
      <Button className="bg-[var(--color-primary-500)] hover:bg-[var(--color-primary-600)]" onClick={onSubmit}>
        Submit vote
      </Button>
      <p className="text-xs text-gray-500">Votes in: {voteCount}/{playerCount}</p>
    </div>
  );
}
