import { RoundCountdown } from "../shared/RoundCountdown";

type Player = { sessionId: string; role?: "imposter" | "player"; eliminated?: boolean };

export function ImposterResultsSection({
  tally,
  votes,
  players,
  sessionById,
  secretWord,
  phaseEndsAt
}: {
  tally: Record<string, number>;
  votes: Array<{ voterId: string; targetId: string }>;
  players: Player[];
  sessionById: Record<string, string>;
  secretWord: string | null;
  phaseEndsAt: number | null | undefined;
}) {
  const activePlayers = players.filter((p) => !p.eliminated);
  const maxVotes = Math.max(...Object.values(tally), 1);

  // Determine who got the most votes
  const topVoteCount = Math.max(...Object.values(tally), 0);
  const topVoted = Object.entries(tally)
    .filter(([, count]) => count === topVoteCount && topVoteCount > 0)
    .map(([id]) => id);
  const votedOutId = topVoted.length > 0 ? topVoted[0] : null;
  const votedOutPlayer = votedOutId ? activePlayers.find((p) => p.sessionId === votedOutId) : null;
  const votedOutName = votedOutPlayer ? (sessionById[votedOutPlayer.sessionId] ?? votedOutPlayer.sessionId.slice(0, 6)) : null;
  const wasImposter = votedOutPlayer?.role === "imposter";

  return (
    <div className="game-section">
      <div className={`game-reveal-card ${wasImposter ? "game-reveal-card--success" : "game-reveal-card--fail"}`}>
        {votedOutName ? (
          <>
            <p className="game-reveal-title">
              {votedOutName} was voted out!
            </p>
            <p className="game-reveal-sub">
              They were {wasImposter
                ? <strong style={{ color: "#f87171" }}>the Imposter!</strong>
                : <strong style={{ color: "#4ade80" }}>innocent.</strong>}
            </p>
          </>
        ) : (
          <>
            <p className="game-reveal-title">No one was voted out!</p>
            <p className="game-reveal-sub">Not enough votes were cast.</p>
          </>
        )}
      </div>

      {secretWord && (
        <p className="game-reveal-word" style={{ textAlign: "center", marginTop: "0.5rem" }}>
          The word was: <strong>{secretWord}</strong>
        </p>
      )}

      <h3 className="game-section-label">Vote Results</h3>
      <div className="game-results-list">
        {activePlayers.map((player) => {
          const name = sessionById[player.sessionId] ?? player.sessionId.slice(0, 6);
          const voteCount = tally[player.sessionId] ?? 0;
          const pct = maxVotes > 0 ? (voteCount / maxVotes) * 100 : 0;
          const isVotedOut = player.sessionId === votedOutId;
          const voterNames = votes
            .filter((v) => v.targetId === player.sessionId)
            .map((v) => sessionById[v.voterId] ?? v.voterId.slice(0, 6));

          return (
            <div key={player.sessionId} className="game-result-row">
              <div className="game-result-info">
                <span className={`game-result-name${isVotedOut ? " game-result-name--danger" : ""}`}>
                  {name} {isVotedOut ? "⬅ voted out" : ""}
                </span>
                <span className="game-result-votes">{voteCount} vote{voteCount !== 1 ? "s" : ""}</span>
              </div>
              <div className="game-result-bar-track">
                <div
                  className={`game-result-bar${isVotedOut ? " game-result-bar--danger" : ""}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              {voterNames.length > 0 && (
                <p className="game-result-voters">
                  Voted by: {voterNames.join(", ")}
                </p>
              )}
            </div>
          );
        })}
      </div>

      <div className="game-actions">
        <RoundCountdown endsAt={phaseEndsAt} label="Next round" />
      </div>
    </div>
  );
}
