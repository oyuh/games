type Player = { sessionId: string; role?: "imposter" | "player" };

export function ImposterPlayersCard({
  players,
  sessionId,
  sessionById,
  revealRoles
}: {
  players: Player[];
  sessionId: string;
  sessionById: Record<string, string>;
  revealRoles: boolean;
}) {
  return (
    <div className="panel">
      <h2 style={{ marginBottom: "0.5rem", fontWeight: 600, color: "var(--primary)" }}>Players</h2>
      <ul className="space-y-1" style={{ fontSize: "0.875rem", color: "var(--muted-foreground)" }}>
        {players.map((player) => (
          <li key={player.sessionId}>
            {sessionById[player.sessionId] ?? player.sessionId.slice(0, 6)}
            {player.sessionId === sessionId ? " (you)" : ""}
            {revealRoles && player.role ? ` — ${player.role}` : ""}
          </li>
        ))}
      </ul>
    </div>
  );
}
