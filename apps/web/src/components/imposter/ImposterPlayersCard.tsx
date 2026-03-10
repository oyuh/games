type Player = { sessionId: string; name: string | null; connected: boolean; role?: "imposter" | "player"; eliminated?: boolean };

export function ImposterPlayersCard({
  players,
  sessionId,
  sessionById,
  revealRoles,
  votedOutId
}: {
  players: Player[];
  sessionId: string;
  sessionById: Record<string, string>;
  revealRoles: boolean;
  votedOutId?: string | null;
}) {
  const activePlayers = players.filter((p) => !p.eliminated);
  return (
    <div className="game-section">
      <h3 className="game-section-label">
        Players <span className="game-section-count">{activePlayers.length}/{players.length}</span>
      </h3>
      <div className="game-players-grid">
        {players.map((player) => {
          const isMe = player.sessionId === sessionId;
          const name = sessionById[player.sessionId] ?? player.sessionId.slice(0, 6);
          const initial = (name[0] ?? "?").toUpperCase();
          const showRole = revealRoles || player.sessionId === votedOutId;
          const isImposter = showRole && player.role === "imposter";
          const isEliminated = Boolean(player.eliminated);

          return (
            <div
              key={player.sessionId}
              className={`game-player-chip${isMe ? " game-player-chip--me" : ""}${isImposter ? " game-player-chip--danger" : ""}${isEliminated ? " game-player-chip--eliminated" : ""}`}
              data-tooltip={`${name}${!player.connected ? " (disconnected)" : ""}${isEliminated ? " — Eliminated" : ""}${isImposter ? " — Imposter!" : showRole ? " — Innocent" : ""}`}
              data-tooltip-variant={isEliminated ? "warning" : isImposter ? "danger" : showRole ? "success" : "info"}
            >
              <div className={`game-player-avatar${isImposter ? " game-player-avatar--danger" : ""}${isEliminated ? " game-player-avatar--eliminated" : ""}`}>
                {isEliminated ? "☠" : initial}
              </div>
              <span className={`game-player-name${isEliminated ? " game-player-name--eliminated" : ""}`}>{name}</span>
              {isMe && !isEliminated && <span className="game-player-you">you</span>}
              {isEliminated && (
                <span className="badge badge-muted" style={{ fontSize: "0.58rem" }}>out</span>
              )}
              {!isEliminated && showRole && player.role && (
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
