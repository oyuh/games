import { Button } from "flowbite-react";

type Player = { sessionId: string; role?: "imposter" | "player" };

export function ImposterResultsSection({
  tally,
  players,
  sessionById,
  canAdvance,
  onNextRound
}: {
  tally: Record<string, number>;
  players: Player[];
  sessionById: Record<string, string>;
  canAdvance: boolean;
  onNextRound: () => void;
}) {
  return (
    <div className="space-y-3 rounded border p-3">
      <h2 className="font-semibold">Round results</h2>
      <ul className="space-y-1 text-sm">
        {Object.entries(tally).map(([targetId, count]) => {
          const player = players.find((item) => item.sessionId === targetId);
          return (
            <li key={targetId}>
              {sessionById[targetId] ?? targetId.slice(0, 6)}: {count} vote(s)
              {player?.role === "imposter" ? " — imposter" : ""}
            </li>
          );
        })}
      </ul>
      {canAdvance ? (
        <Button className="bg-[var(--color-primary-500)] hover:bg-[var(--color-primary-600)]" onClick={onNextRound}>
          Next round
        </Button>
      ) : null}
    </div>
  );
}
