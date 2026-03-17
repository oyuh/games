import { FiSkipForward } from "react-icons/fi";
import { RoundCountdown } from "../shared/RoundCountdown";

type Player = { sessionId: string; role?: "imposter" | "player"; eliminated?: boolean };

export function ImposterResultsSection({
  tally,
  votes,
  players,
  sessionById,
  secretWord,
  phaseEndsAt,
  skipVotes,
  activePlayerCount,
  hasVotedSkip,
  onSkip
}: {
  tally: Record<string, number>;
  votes: Array<{ voterId: string; targetId: string }>;
  players: Player[];
  sessionById: Record<string, string>;
  secretWord: string | null;
  phaseEndsAt: number | null | undefined;
  skipVotes: number;
  activePlayerCount: number;
  hasVotedSkip: boolean;
  onSkip: () => void;
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
  const voteLines = votes.map((vote) => {
    const voter = sessionById[vote.voterId] ?? vote.voterId.slice(0, 6);
    const target = sessionById[vote.targetId] ?? vote.targetId.slice(0, 6);
    return `${voter} → ${target}`;
  });

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
        <div className="panel" style={{ marginTop: "0.5rem", textAlign: "center" }}>
          <p className="game-reveal-word" style={{ margin: 0 }}>
            Secret Word: <strong>{secretWord}</strong>
          </p>
        </div>
      )}

      <div className="panel" style={{ marginTop: "0.75rem" }}>
        <h3 className="game-section-label" style={{ marginTop: 0 }}>Vote Breakdown</h3>
        {voteLines.length > 0 ? (
          <div style={{ display: "grid", gap: "0.35rem", marginBottom: "0.6rem" }}>
            {voteLines.map((line, index) => (
              <p key={`${line}-${index}`} style={{ margin: 0, fontSize: "0.92rem", opacity: 0.9 }}>{line}</p>
            ))}
          </div>
        ) : (
          <p style={{ margin: "0 0 0.6rem", opacity: 0.75 }}>No votes recorded.</p>
        )}
      </div>

      <h3 className="game-section-label" style={{ marginTop: "0.9rem" }}>Vote Totals</h3>
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
                <span className={`game-result-name${isVotedOut ? " game-result-name--danger" : ""}`} style={{ fontSize: "1rem" }}>
                  {name}
                </span>
                <span className="game-result-votes" style={{ fontSize: "0.9rem" }}>
                  {voteCount} vote{voteCount !== 1 ? "s" : ""}{isVotedOut ? " • Voted Out" : ""}
                </span>
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
        <button
          className={`btn ${hasVotedSkip ? "btn-muted" : "btn-primary"} game-action-btn`}
          onClick={onSkip}
          disabled={hasVotedSkip}
          style={{ marginTop: "0.5rem" }}
        >
          <FiSkipForward size={14} />
          {hasVotedSkip ? `Voted to Skip (${skipVotes}/${activePlayerCount})` : `Skip (${skipVotes}/${activePlayerCount})`}
        </button>
      </div>
    </div>
  );
}
