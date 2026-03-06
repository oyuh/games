type Player = { sessionId: string; name: string | null; connected: boolean; role?: "imposter" | "player" };

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
    <div className="game-section">
      <h3 className="game-section-label">
        Players <span className="game-section-count">{players.length}</span>
      </h3>
      <div className="game-players-grid">
        {players.map((player) => {
          const isMe = player.sessionId === sessionId;
          const name = sessionById[player.sessionId] ?? player.sessionId.slice(0, 6);
          const initial = (name[0] ?? "?").toUpperCase();
          const isImposter = revealRoles && player.role === "imposter";

          return (
            <div
              key={player.sessionId}
              className={`game-player-chip${isMe ? " game-player-chip--me" : ""}${isImposter ? " game-player-chip--danger" : ""}`}
            >
              <div className={`game-player-avatar${isImposter ? " game-player-avatar--danger" : ""}`}>
                {initial}
              </div>
              <span className="game-player-name">{name}</span>
              {isMe && <span className="game-player-you">you</span>}
              {revealRoles && player.role && (
                <span className={`badge ${isImposter ? "badge-danger" : "badge-success"}`} style={{ fontSize: "0.58rem" }}>
                  {player.role}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
