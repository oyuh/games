import { FiArrowRight } from "react-icons/fi";

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
  const imposter = players.find((p) => p.role === "imposter");
  const imposterName = imposter ? (sessionById[imposter.sessionId] ?? imposter.sessionId.slice(0, 6)) : null;
  const topVoted = Object.entries(tally).sort((a, b) => b[1] - a[1])[0];
  const caught = topVoted && imposter && topVoted[0] === imposter.sessionId;

  return (
    <div className="game-section">
      <div className={`game-reveal-card ${caught ? "game-reveal-card--success" : "game-reveal-card--fail"}`}>
        <p className="game-reveal-title">
          {caught ? "Imposter Caught!" : "Imposter Got Away!"}
        </p>
        {imposterName && (
          <p className="game-reveal-sub">
            The imposter was <strong>{imposterName}</strong>
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

      {canAdvance && (
        <div className="game-actions">
          <button className="btn btn-primary game-action-btn" onClick={onNextRound}>
            <FiArrowRight size={16} /> {isLastRound ? "Back to Lobby" : "Next Round"}
          </button>
        </div>
      )}
    </div>
  );
}
