import { mutators, queries } from "@games/shared";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { useEffect, useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { PasswordHeader } from "../components/password/PasswordHeader";
import { PasswordTeamGrid } from "../components/password/PasswordTeamGrid";
import { addRecentGame } from "../lib/session";

export function PasswordBeginPage({ sessionId }: { sessionId: string }) {
  const zero = useZero();
  const params = useParams();
  const gameId = params.id ?? "";
  const [games] = useQuery(queries.password.byId({ id: gameId }));
  const [sessions] = useQuery(queries.sessions.byGame({ gameType: "password", gameId }));
  const game = games[0];

  useEffect(() => {
    if (!gameId) {
      return;
    }
    void zero.mutate(mutators.password.join({ gameId, sessionId }));
  }, [zero, gameId, sessionId]);

  const names = useMemo(() => {
    return sessions.reduce<Record<string, string>>((acc, session) => {
      acc[session.id] = session.name ?? session.id.slice(0, 6);
      return acc;
    }, {});
  }, [sessions]);

  useEffect(() => {
    if (!game) {
      return;
    }
    addRecentGame({
      id: game.id,
      code: game.code,
      gameType: "password"
    });
  }, [game]);

  if (!game) {
    return <p>Password game not found.</p>;
  }

  const isHost = game.host_id === sessionId;

  return (
    <div className="card p-6 space-y-4 max-w-3xl mx-auto">
      <PasswordHeader title="Password Lobby" code={game.code} />
      <p style={{ color: "var(--muted-foreground)", fontSize: "0.875rem" }}>Current round: {game.current_round}</p>

      <PasswordTeamGrid
        teams={game.teams}
        scores={game.scores}
        names={names}
        activeTeamIndex={undefined}
        sessionId={sessionId}
      />

      {isHost ? (
        <button className="btn btn-primary" onClick={() => zero.mutate(mutators.password.start({ gameId, hostId: sessionId }))}>
          Start game
        </button>
      ) : (
        <p style={{ color: "var(--secondary)", fontSize: "0.875rem" }}>Waiting for host to start the game.</p>
      )}

      <Link to={`/password/${game.id}`} className="btn btn-ghost inline-flex">
        Enter game
      </Link>
    </div>
  );
}
