import { FiArrowRight, FiHome } from "react-icons/fi";

type Player = { sessionId: string; role?: "imposter" | "player" };

export function ImposterResultsSection({
  tally,
  players,
  sessionById,
  secretWord,
  canAdvance,
  isLastRound,
  onNextRound
}: {
  tally: Record<string, number>;
  players: Player[];
  sessionById: Record<string, string>;
  secretWord: string | null;
  canAdvance: boolean;
  isLastRound: boolean;
  onNextRound: () => void;
}) {
  const maxVotes = Math.max(...Object.values(tally), 1);
  const imposters = players.filter((p) => p.role === "imposter");
  const imposterNames = imposters.map((p) => sessionById[p.sessionId] ?? p.sessionId.slice(0, 6));

  // Check if any imposter was caught (at least one among the top voted)
  const topVoteCount = Math.max(...Object.values(tally), 0);
  const topVoted = new Set(
    Object.entries(tally)
      .filter(([, count]) => count === topVoteCount && topVoteCount > 0)
      .map(([id]) => id)
  );
  const caught = imposters.length > 0 && imposters.some((p) => topVoted.has(p.sessionId));

  return (
    <div className="game-section">
      <div className={`game-reveal-card ${caught ? "game-reveal-card--success" : "game-reveal-card--fail"}`}>
        <p className="game-reveal-title">
          {caught
            ? imposters.length > 1 ? "Imposters Caught!" : "Imposter Caught!"
            : imposters.length > 1 ? "Imposters Got Away!" : "Imposter Got Away!"}
        </p>
        {imposterNames.length > 0 && (
          <p className="game-reveal-sub">
            {imposters.length > 1 ? "The imposters were " : "The imposter was "}
            <strong>{imposterNames.join(", ")}</strong>
          </p>
        )}
        {secretWord && (
          <p className="game-reveal-word">
            The word was: <strong>{secretWord}</strong>
          </p>
        )}
      </div>

      <h3 className="game-section-label">Vote Results</h3>
      <div className="game-results-list">
        {players.map((player) => {
          const name = sessionById[player.sessionId] ?? player.sessionId.slice(0, 6);
          const votes = tally[player.sessionId] ?? 0;
          const pct = maxVotes > 0 ? (votes / maxVotes) * 100 : 0;
          const isImposter = player.role === "imposter";

          return (
            <div key={player.sessionId} className="game-result-row">
              <div className="game-result-info">
                <span className={`game-result-name${isImposter ? " game-result-name--danger" : ""}`}>
                  {name} {isImposter ? "(imposter)" : ""}
                </span>
                <span className="game-result-votes">{votes} vote{votes !== 1 ? "s" : ""}</span>
              </div>
              <div className="game-result-bar-track">
                <div
                  className={`game-result-bar${isImposter ? " game-result-bar--danger" : ""}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      <div className="game-actions">
        {canAdvance && (
          <button className="btn btn-primary game-action-btn" onClick={onNextRound}>
            <FiArrowRight size={16} /> {isLastRound ? "View Summary" : "Next Round"}
          </button>
        )}
        {!canAdvance && (
          <p className="game-waiting-text">Waiting for host to continue…</p>
        )}
      </div>
    </div>
  );
}
