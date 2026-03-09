import { useState } from "react";
import { FiChevronDown, FiChevronUp } from "react-icons/fi";

type Round = {
  round: number;
  teamIndex: number;
  guesserId: string;
  word: string;
  clues: Array<{ sessionId: string; text: string }>;
  guess: string | null;
  correct: boolean;
};

type Team = { name: string };

const teamColors = ["#7ecbff", "#a78bfa", "#4ade80", "#f59e0b", "#f87171", "#ec4899"];

export function PasswordRoundsTable({
  rounds,
  teams,
  names,
  defaultOpen
}: {
  rounds: Round[];
  teams: Team[];
  names: Record<string, string>;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen ?? false);

  if (!rounds.length) {
    return null;
  }

  return (
    <div className="game-section">
      <button
        className="pw-history-toggle"
        onClick={() => setOpen(!open)}
      >
        <h3 className="game-section-label" style={{ margin: 0 }}>Round History</h3>
        <span className="pw-history-toggle-meta">
          {rounds.length} round{rounds.length !== 1 ? "s" : ""}
          {open ? <FiChevronUp size={16} /> : <FiChevronDown size={16} />}
        </span>
      </button>

      {open && (
        <div className="pw-history-list">
          {[...rounds].reverse().map((round, idx) => {
            const teamName = teams[round.teamIndex]?.name ?? `Team ${round.teamIndex + 1}`;
            const teamColor = teamColors[round.teamIndex % teamColors.length]!;
            const guesserName = names[round.guesserId] ?? round.guesserId.slice(0, 6);
            const clueGiverNames = round.clues.map((c) => names[c.sessionId] ?? c.sessionId.slice(0, 6));

            return (
              <div
                key={`${round.round}-${idx}`}
                className={`pw-history-card ${round.correct ? "pw-history-card--correct" : "pw-history-card--wrong"}`}
                style={{ "--pw-team-color": teamColor } as React.CSSProperties}
              >
                <div className="pw-history-card-top">
                  <span className="pw-history-team" style={{ color: teamColor }}>{teamName}</span>
                  <span className={`pw-history-result ${round.correct ? "pw-history-result--correct" : "pw-history-result--wrong"}`}>
                    {round.correct ? "+1" : "✗"}
                  </span>
                </div>

                <div className="pw-history-word-row">
                  <span className="pw-history-word">{round.word}</span>
                  <span className="pw-history-arrow">→</span>
                  <span className={`pw-history-guess ${round.correct ? "pw-history-guess--correct" : "pw-history-guess--wrong"}`}>
                    {round.guess ?? "No guess"}
                  </span>
                </div>

                <div className="pw-history-details">
                  <div className="pw-history-detail">
                    <span className="pw-history-detail-label">Clues</span>
                    <div className="pw-history-clues">
                      {round.clues.length > 0
                        ? round.clues.map((c, ci) => (
                            <span key={ci} className="pw-history-clue-chip">{c.text}</span>
                          ))
                        : <span className="pw-history-none">No clues given</span>}
                    </div>
                  </div>
                  <div className="pw-history-detail">
                    <span className="pw-history-detail-label">Guesser</span>
                    <span className="pw-history-detail-value">{guesserName}</span>
                  </div>
                  {clueGiverNames.length > 0 && (
                    <div className="pw-history-detail">
                      <span className="pw-history-detail-label">Clue by</span>
                      <span className="pw-history-detail-value">{clueGiverNames.join(", ")}</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
