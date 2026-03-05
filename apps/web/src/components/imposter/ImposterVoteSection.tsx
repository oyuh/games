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
    <div className="panel space-y-3">
      <label htmlFor="vote" style={{ color: "var(--muted-foreground)", fontSize: "0.875rem", fontWeight: 600 }}>
        Vote for the imposter
      </label>
      <select
        id="vote"
        className="input"
        value={voteTarget}
        onChange={(event) => onVoteTargetChange(event.target.value)}
      >
        <option value="">Choose a player</option>
        {players.map((player) => (
          <option key={player.sessionId} value={player.sessionId}>
            {sessionById[player.sessionId] ?? player.sessionId.slice(0, 6)}
          </option>
        ))}
      </select>
      <button className="btn btn-primary" onClick={onSubmit}>
        Submit vote
      </button>
      <p style={{ fontSize: "0.75rem", color: "var(--secondary)" }}>Votes in: {voteCount}/{playerCount}</p>
    </div>
  );
}
