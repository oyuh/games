import { mutators, queries } from "@games/shared";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { FiAward } from "react-icons/fi";
import { PasswordRoundsTable } from "../components/password/PasswordRoundsTable";

export function PasswordResultsPage({ sessionId }: { sessionId: string }) {
  const zero = useZero();
  const params = useParams();
  const navigate = useNavigate();
  const gameId = params.id ?? "";
  const [games] = useQuery(queries.password.byId({ id: gameId }));
  const [sessions] = useQuery(queries.sessions.byGame({ gameType: "password", gameId }));
  const game = games[0];

  const names = useMemo(() => {
    return sessions.reduce<Record<string, string>>((acc, s) => {
      acc[s.id] = s.name ?? s.id.slice(0, 6);
      return acc;
    }, {});
  }, [sessions]);

  if (!game) {
    return (
      <div className="game-page">
        <div className="game-empty"><p>Game not found</p></div>
      </div>
    );
  }

  const isHost = game.host_id === sessionId;
  const sortedScores = Object.entries(game.scores).sort((a, b) => b[1] - a[1]);
  const winner = sortedScores[0];
  const teamColors = ["#7ecbff", "#a78bfa", "#4ade80", "#f59e0b", "#f87171", "#ec4899"];

  return (
    <div className="game-page">
      <div className="game-header">
        <div className="game-header-left">
          <h1 className="game-title">Password</h1>
          <span className="badge badge-success">Finished</span>
        </div>
      </div>

      {winner && (
        <div className="game-winner-banner">
          <FiAward size={28} />
          <div>
            <p className="game-winner-title">{winner[0]} Wins!</p>
            <p className="game-winner-score">{winner[1]} points</p>
          </div>
        </div>
      )}

      <div className="game-section">
        <h3 className="game-section-label">Final Scores</h3>
        <div className="game-scoreboard">
          {sortedScores.map(([teamName, score], i) => {
            const teamIndex = game.teams.findIndex((t) => t.name === teamName);
            const color = teamColors[teamIndex >= 0 ? teamIndex % teamColors.length : i % teamColors.length]!;
            const maxScore = sortedScores[0]?.[1] ?? 1;
            const pct = maxScore > 0 ? (score / maxScore) * 100 : 0;
            return (
              <div key={teamName} className="game-score-row">
                <span className="game-score-name" style={{ color }}>{teamName}</span>
                <div className="game-result-bar-track">
                  <div className="game-result-bar" style={{ width: `${pct}%`, background: color }} />
                </div>
                <span className="game-score-value">{score}</span>
              </div>
            );
          })}
        </div>
      </div>

      <PasswordRoundsTable rounds={game.rounds} teams={game.teams} names={names} />

      {isHost && (
        <div className="game-section">
          <button
            className="btn btn-primary game-action-btn"
            onClick={() => {
              void zero.mutate(mutators.password.resetToLobby({ gameId, hostId: sessionId }));
              void navigate(`/password/${game.id}/begin`);
            }}
          >
            Play Again
          </button>
        </div>
      )}
    </div>
  );
}
