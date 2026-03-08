import { mutators, queries } from "@games/shared";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { useEffect, useMemo, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { FiAward } from "react-icons/fi";
import { PasswordRoundsTable } from "../components/password/PasswordRoundsTable";
import { showToast } from "../lib/toast";

export function PasswordResultsPage({ sessionId }: { sessionId: string }) {
  const zero = useZero();
  const params = useParams();
  const navigate = useNavigate();
  const gameId = params.id ?? "";
  const [games] = useQuery(queries.password.byId({ id: gameId }));
  const [sessions] = useQuery(queries.sessions.byGame({ gameType: "password", gameId }));
  const game = games[0];
  const prevAnnouncementTs = useRef<number | null>(null);

  const names = useMemo(() => {
    return sessions.reduce<Record<string, string>>((acc, s) => {
      acc[s.id] = s.name ?? s.id.slice(0, 6);
      return acc;
    }, {});
  }, [sessions]);

  useEffect(() => {
    if (!game) return;
    if (game.phase === "ended") {
      showToast("The host ended the game", "info");
      navigate("/");
      return;
    }
    if (game.kicked.includes(sessionId)) {
      showToast("You were kicked from the game", "error");
      navigate("/");
    }
  }, [game?.phase, game?.kicked, sessionId, navigate]);

  // Announcement watcher (skip for host — they sent it)
  useEffect(() => {
    if (!game?.announcement) return;
    if (prevAnnouncementTs.current !== game.announcement.ts) {
      prevAnnouncementTs.current = game.announcement.ts;
      if (game.host_id !== sessionId) showToast(`📢 ${game.announcement.text}`, "info");
    }
  }, [game?.announcement, game?.host_id, sessionId]);

  if (!game) {
    return (
      <div className="game-page">
        <div className="game-empty"><p>Game not found</p></div>
      </div>
    );
  }

  const isHost = game.host_id === sessionId;
  const sortedScores = Object.entries(game.scores).sort((a, b) => b[1] - a[1]);
  const topScore = sortedScores[0]?.[1] ?? 0;
  const winners = sortedScores.filter(([, score]) => score === topScore);
  const isTie = winners.length > 1 && topScore > 0;
  const teamColors = ["#7ecbff", "#a78bfa", "#4ade80", "#f59e0b", "#f87171", "#ec4899"];

  return (
    <div className="game-page">
      <div className="game-header">
        <div className="game-header-left">
          <h1 className="game-title">Password</h1>
          <span className="badge badge-success">Finished</span>
        </div>
      </div>

      {isTie ? (
        <div className="game-winner-banner">
          <FiAward size={28} />
          <div>
            <p className="game-winner-title">It's a Tie!</p>
            <p className="game-winner-score">{winners.map(([name]) => name).join(" & ")} — {topScore} points each</p>
          </div>
        </div>
      ) : winners[0] ? (
        <div className="game-winner-banner">
          <FiAward size={28} />
          <div>
            <p className="game-winner-title">{winners[0][0]} Wins!</p>
            <p className="game-winner-score">{winners[0][1]} points</p>
          </div>
        </div>
      ) : null}

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

      {isHost ? (
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
          <button
            className="btn btn-muted"
            style={{ marginTop: "0.5rem" }}
            onClick={() => {
              void zero.mutate(mutators.password.endGame({ gameId, hostId: sessionId }));
              navigate("/");
            }}
          >
            End Game
          </button>
        </div>
      ) : (
        <div className="game-section">
          <button className="btn btn-muted game-action-btn" onClick={() => navigate("/")}>
            Back to Home
          </button>
        </div>
      )}
    </div>
  );
}
