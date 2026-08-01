import { mutators } from "@games/shared";
import { FiAward } from "react-icons/fi";
import { showToast } from "../../lib/toast";
import { MobileGameHeader } from "../components/MobileGameHeader";
import { MobileGameNotFound } from "../components/MobileGameNotFound";
import { PASSWORD_TEAM_COLORS, usePasswordResults } from "../../hooks/usePasswordResults";

const teamColors = PASSWORD_TEAM_COLORS;

export function MobilePasswordResultsPage({ sessionId }: { sessionId: string }) {
  const {
    zero, gameId, game, navigate,
    isHost, sortedScores, topScore, winners, isTie, roundsForView,
  } = usePasswordResults(sessionId);

  if (!game) return <MobileGameNotFound theme="password" />;

  return (
    <div className="m-page" data-game-theme="password">
      <MobileGameHeader code={game.code} gameLabel="Password" phase="Finished" accent="var(--game-accent)" category={game.settings.category ?? null} />

      {/* Winner banner */}
      {isTie ? (
        <div className="m-card m-card--success">
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <FiAward size={28} style={{ color: "#f59e0b" }} />
            <div>
              <h3 className="m-reveal-title">It's a Tie!</h3>
              <p className="m-reveal-sub">{winners.map(([n]) => n).join(" & ")} - {topScore} pts each</p>
            </div>
          </div>
        </div>
      ) : winners[0] ? (
        <div className="m-card m-card--success">
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <FiAward size={28} style={{ color: "#f59e0b" }} />
            <div>
              <h3 className="m-reveal-title">{winners[0][0]} Wins!</h3>
              <p className="m-reveal-sub">{winners[0][1]} points</p>
            </div>
          </div>
        </div>
      ) : null}

      {/* Scores */}
      <div className="m-card">
        <h3 className="m-card-title">Final Scores</h3>
        <div className="m-results-list">
          {sortedScores.map(([teamName, score], i) => {
            const teamIndex = game.teams.findIndex((t) => t.name === teamName);
            const color = teamColors[teamIndex >= 0 ? teamIndex % teamColors.length : i % teamColors.length]!;
            const maxScore = sortedScores[0]?.[1] ?? 1;
            const pct = maxScore > 0 ? (score / maxScore) * 100 : 0;
            return (
              <div key={teamName} className="m-result-row m-result-row--stack">
                <div className="m-result-info">
                  <span style={{ color, fontWeight: 600 }}>{teamName}</span>
                  <span className="m-result-votes">{score}</span>
                </div>
                <div className="m-result-bar-track">
                  <div className="m-result-bar" style={{ width: `${pct}%`, background: color }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Rounds table */}
      {roundsForView.length > 0 && (
        <div className="m-card">
          <h3 className="m-card-title">Rounds</h3>
          <div className="m-data-table-wrap">
            <table className="m-data-table">
              <thead><tr><th>#</th><th>Team</th><th>Word</th><th>Pts</th></tr></thead>
              <tbody>
                {roundsForView.map((r) => (
                  <tr key={r.roundId ?? `${r.round}-${r.teamIndex}`}>
                    <td>{r.round}</td>
                    <td>{game.teams[r.teamIndex]?.name ?? `Team ${r.teamIndex + 1}`}</td>
                    <td style={{ color: "var(--primary)", fontWeight: 600 }}>{r.word}</td>
                    <td style={{ color: r.correct ? "#4ade80" : "#f87171" }}>{r.correct ? `+${r.points ?? 1}` : "0"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="m-card m-bottom-safe">
        {isHost ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            <button
              className="m-btn m-btn-primary"
              style={{ width: "100%" }}
              onClick={() => { void zero.mutate(mutators.password.resetToLobby({ gameId, hostId: sessionId })); void navigate(`/password/${game.id}/begin`); }}
            >
              Play Again
            </button>
            <button
              className="m-btn m-btn-muted"
              style={{ width: "100%" }}
              onClick={() => {
                void zero.mutate(mutators.password.endGame({ gameId, hostId: sessionId }))
                  .client.then(() => navigate("/"))
                  .catch(() => showToast("Couldn't end game", "error"));
              }}
            >
              End Game
            </button>
          </div>
        ) : (
          <button className="m-btn m-btn-muted" style={{ width: "100%" }} onClick={() => navigate("/")}>
            Back to Home
          </button>
        )}
      </div>
    </div>
  );
}
