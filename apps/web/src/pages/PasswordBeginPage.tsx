import { mutators, queries } from "@games/shared";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { useEffect, useMemo } from "react";
import { useParams } from "react-router-dom";
import { FiPlay, FiLogOut, FiLogIn } from "react-icons/fi";
import { PasswordHeader } from "../components/password/PasswordHeader";
import { PasswordTeamGrid } from "../components/password/PasswordTeamGrid";
import { addRecentGame } from "../lib/session";

export function PasswordBeginPage({ sessionId }: { sessionId: string }) {
  const zero = useZero();
  const params = useParams();
  const gameId = params.id ?? "";
  const [games] = useQuery(queries.password.byId({ id: gameId }));
  const [sessions] = useQuery(queries.sessions.byGame({ gameType: "password", gameId }));
  useQuery(queries.sessions.byId({ id: sessionId }));
  const game = games[0];

  const names = useMemo(() => {
    return sessions.reduce<Record<string, string>>((acc, s) => {
      acc[s.id] = s.name ?? s.id.slice(0, 6);
      return acc;
    }, {});
  }, [sessions]);

  useEffect(() => {
    if (!game) return;
    addRecentGame({ id: game.id, code: game.code, gameType: "password" });
  }, [game]);

  if (!game) {
    return (
      <div className="game-page">
        <div className="game-empty"><p>Game not found</p></div>
      </div>
    );
  }

  const isHost = game.host_id === sessionId;
  const inGame = game.teams.some((t) => t.members.includes(sessionId));
  const teamsWithPlayers = game.teams.filter((t) => t.members.length > 0).length;
  const canStart = isHost && teamsWithPlayers >= 2;

  return (
    <div className="game-page">
      <PasswordHeader
        title="Password"
        code={game.code}
        phase={game.phase}
        currentRound={game.current_round}
      />

      <PasswordTeamGrid
        teams={game.teams}
        scores={game.scores}
        names={names}
        activeTeamIndex={undefined}
        sessionId={sessionId}
      />

      {!inGame && (
        <div className="game-section game-join-prompt">
          <p className="game-join-text">You're not in this lobby yet.</p>
          <button
            className="btn btn-primary game-action-btn"
            onClick={() => void zero.mutate(mutators.password.join({ gameId, sessionId }))}
          >
            <FiLogIn size={16} /> Join Game
          </button>
        </div>
      )}

      {inGame && (
        <div className="game-section">
          {teamsWithPlayers < 2 && (
            <p className="game-hint">Need at least 2 teams with players to start</p>
          )}
          <div className="game-actions">
            {isHost ? (
              <button
                className="btn btn-primary game-action-btn"
                disabled={!canStart}
                onClick={() => void zero.mutate(mutators.password.start({ gameId, hostId: sessionId }))}
              >
                <FiPlay size={16} /> Start Game
              </button>
            ) : (
              <p className="game-waiting-text">Waiting for host to start…</p>
            )}
            <button
              className="btn btn-muted"
              onClick={() => void zero.mutate(mutators.password.leave({ gameId, sessionId }))}
            >
              <FiLogOut size={14} /> Leave
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
