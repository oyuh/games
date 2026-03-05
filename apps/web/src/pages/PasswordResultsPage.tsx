import { mutators, queries } from "@games/shared";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { useMemo } from "react";
import { useParams } from "react-router-dom";

export function PasswordResultsPage({ sessionId }: { sessionId: string }) {
  const zero = useZero();
  const params = useParams();
  const gameId = params.id ?? "";
  const [games] = useQuery(queries.password.byId({ id: gameId }));
  const [sessions] = useQuery(queries.sessions.byGame({ gameType: "password", gameId }));
  const game = games[0];

  const names = useMemo(() => {
    return sessions.reduce<Record<string, string>>((acc, session) => {
      acc[session.id] = session.name ?? session.id.slice(0, 6);
      return acc;
    }, {});
  }, [sessions]);

  if (!game) {
    return <p style={{ color: "var(--muted-foreground)" }}>Password game not found.</p>;
  }

  const isHost = game.host_id === sessionId;
  const top = Object.entries(game.scores).sort((a, b) => b[1] - a[1])[0];

  return (
    <div className="card p-6 space-y-4 max-w-3xl mx-auto">
      <div className="flex items-center justify-between gap-2">
        <h1 className="gradient-heading text-2xl font-bold uppercase tracking-widest">
          Password Results
        </h1>
        {top ? (
          <span className="badge badge-success">
            Winner: {top[0]} ({top[1]})
          </span>
        ) : null}
      </div>

      <div className="panel overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>Round</th>
              <th>Team</th>
              <th>Clue Giver</th>
              <th>Guesser</th>
              <th>Clue</th>
              <th>Guess</th>
              <th>Correct</th>
            </tr>
          </thead>
          <tbody>
            {game.rounds.map((round) => (
              <tr key={`${round.round}-${round.clueGiverId}-${round.guesserId}`}>
                <td>{round.round}</td>
                <td>{game.teams[round.teamIndex]?.name ?? `Team ${round.teamIndex + 1}`}</td>
                <td>{names[round.clueGiverId] ?? round.clueGiverId.slice(0, 6)}</td>
                <td>{names[round.guesserId] ?? round.guesserId.slice(0, 6)}</td>
                <td>{round.clue}</td>
                <td>{round.guess ?? "-"}</td>
                <td>{round.correct ? "✅" : "❌"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {isHost ? (
        <button
          className="btn btn-primary"
          onClick={() => zero.mutate(mutators.password.resetToLobby({ gameId, hostId: sessionId }))}
        >
          Back to lobby
        </button>
      ) : null}
    </div>
  );
}
