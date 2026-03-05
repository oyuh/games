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
    <div className="panel space-y-3">
      <h2 style={{ fontWeight: 600, color: "var(--primary)" }}>Round results</h2>
      <ul className="space-y-1" style={{ fontSize: "0.875rem", color: "var(--muted-foreground)" }}>
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
        <button className="btn btn-primary" onClick={onNextRound}>
          Next round
        </button>
      ) : null}
    </div>
  );
}
