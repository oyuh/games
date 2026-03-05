import { mutators, queries } from "@games/shared";
import { Badge, Button, Card, Table } from "flowbite-react";
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
    return <p>Password game not found.</p>;
  }

  const isHost = game.host_id === sessionId;
  const top = Object.entries(game.scores).sort((a, b) => b[1] - a[1])[0];

  return (
    <Card className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Password Results</h1>
        {top ? <Badge color="success">Winner: {top[0]} ({top[1]})</Badge> : null}
      </div>

      <Table striped>
        <Table.Head>
          <Table.HeadCell>Round</Table.HeadCell>
          <Table.HeadCell>Team</Table.HeadCell>
          <Table.HeadCell>Clue Giver</Table.HeadCell>
          <Table.HeadCell>Guesser</Table.HeadCell>
          <Table.HeadCell>Clue</Table.HeadCell>
          <Table.HeadCell>Guess</Table.HeadCell>
          <Table.HeadCell>Correct</Table.HeadCell>
        </Table.Head>
        <Table.Body className="divide-y">
          {game.rounds.map((round) => (
            <Table.Row key={`${round.round}-${round.clueGiverId}-${round.guesserId}`}>
              <Table.Cell>{round.round}</Table.Cell>
              <Table.Cell>{game.teams[round.teamIndex]?.name ?? `Team ${round.teamIndex + 1}`}</Table.Cell>
              <Table.Cell>{names[round.clueGiverId] ?? round.clueGiverId.slice(0, 6)}</Table.Cell>
              <Table.Cell>{names[round.guesserId] ?? round.guesserId.slice(0, 6)}</Table.Cell>
              <Table.Cell>{round.clue}</Table.Cell>
              <Table.Cell>{round.guess ?? "-"}</Table.Cell>
              <Table.Cell>{round.correct ? "✅" : "❌"}</Table.Cell>
            </Table.Row>
          ))}
        </Table.Body>
      </Table>

      {isHost ? (
        <Button className="w-fit bg-[var(--color-primary-500)] hover:bg-[var(--color-primary-600)]" onClick={() => zero.mutate(mutators.password.resetToLobby({ gameId, hostId: sessionId }))}>
          Back to lobby
        </Button>
      ) : null}
    </Card>
  );
}
