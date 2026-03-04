import { mutators, queries } from "@games/shared";
import { Button, Card } from "flowbite-react";
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

  const isHost = game.hostId === sessionId;

  return (
    <Card className="space-y-4">
      <PasswordHeader title="Password Lobby" code={game.code} />
      <p className="text-sm text-gray-600">Current round: {game.currentRound}</p>

      <PasswordTeamGrid
        teams={game.teams}
        scores={game.scores}
        names={names}
        activeTeamIndex={undefined}
        sessionId={sessionId}
      />

      {isHost ? (
        <Button className="w-fit bg-[var(--color-primary-500)] hover:bg-[var(--color-primary-600)]" onClick={() => zero.mutate(mutators.password.start({ gameId, hostId: sessionId }))}>
          Start game
        </Button>
      ) : (
        <p className="text-sm text-gray-500">Waiting for host to start the game.</p>
      )}

      <Button as={Link} to={`/password/${game.id}`} className="w-fit bg-[var(--color-primary-500)] hover:bg-[var(--color-primary-600)]">
        Enter game
      </Button>
    </Card>
  );
}
