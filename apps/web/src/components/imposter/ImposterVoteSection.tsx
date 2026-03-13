import { FiCheck } from "react-icons/fi";
import { BorringAvatar } from "../shared/BorringAvatar";

type Player = { sessionId: string };

export function ImposterVoteSection({
  players,
  sessionId,
  sessionById,
  voteTarget,
  voteCount,
  playerCount,
  clues,
  submitted,
  onVoteTargetChange,
  onSubmit
}: {
  players: Player[];
  sessionId: string;
  sessionById: Record<string, string>;
  voteTarget: string;
  voteCount: number;
  playerCount: number;
  clues: Array<{ sessionId: string; text: string }>;
  submitted: boolean;
  onVoteTargetChange: (value: string) => void;
  onSubmit: () => void;
}) {
  const clueByPlayer = new Map(clues.map((c) => [c.sessionId, c.text]));
  const votedName = voteTarget ? (sessionById[voteTarget] ?? voteTarget.slice(0, 6)) : null;

  return (
    <div className="game-section">
      <h3 className="game-section-label">Who is the imposter?</h3>

      <div className="game-clue-recap">
        {players.map((player) => {
          const name = sessionById[player.sessionId] ?? player.sessionId.slice(0, 6);
          const clueText = clueByPlayer.get(player.sessionId);
          return (
            <div key={player.sessionId} className="game-clue-item">
              <span className="game-clue-name">{name}</span>
              <span className="game-clue-text">{clueText ?? "—"}</span>
            </div>
          );
        })}
      </div>

      {submitted ? (
        <div className="game-reveal-card game-reveal-card--success" style={{ marginTop: "0.75rem" }}>
          <p className="game-reveal-title" style={{ display: "flex", alignItems: "center", gap: "0.5rem", justifyContent: "center" }}>
            <FiCheck size={18} /> Vote Submitted!
          </p>
          <p className="game-reveal-sub">You voted for <strong>{votedName}</strong>. Waiting for others…</p>
        </div>
      ) : (
        <>
          <div className="game-vote-grid">
            {players
              .filter((p) => p.sessionId !== sessionId)
              .map((player) => {
                const name = sessionById[player.sessionId] ?? player.sessionId.slice(0, 6);
                const selected = voteTarget === player.sessionId;
                // Find the actual index in the full players array to get consistent colors
                const playerIndex = players.findIndex(p => p.sessionId === player.sessionId);
                return (
                  <button
                    key={player.sessionId}
                    className={`game-vote-card${selected ? " game-vote-card--selected" : ""}`}
                    onClick={() => onVoteTargetChange(player.sessionId)}
                    data-tooltip={selected ? `Voting for ${name}` : `Vote for ${name}`}
                    data-tooltip-variant="game"
                  >
                    <div className="game-player-avatar">
                      <BorringAvatar
                        seed={player.sessionId}
                        playerIndex={playerIndex}
                      />
                    </div>
                    <span>{name}</span>
                    {selected && <FiCheck size={16} className="game-vote-check" />}
                  </button>
                );
              })}
          </div>

          <div className="game-actions">
            <button
              className="btn btn-primary game-action-btn"
              onClick={onSubmit}
              disabled={!voteTarget}
            >
              Submit Vote
            </button>
          </div>
        </>
      )}

      <p className="game-progress-text">
        Votes in: {voteCount} / {playerCount}
      </p>
    </div>
  );
}
