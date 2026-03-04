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
    <div className="rounded border p-3">
      <h2 className="mb-2 font-semibold">Players</h2>
      <ul className="space-y-1 text-sm">
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
