import { Table } from "flowbite-react";

type Round = {
  round: number;
  teamIndex: number;
  clueGiverId: string;
  guesserId: string;
  clue: string;
  guess: string | null;
  correct: boolean;
};

type Team = { name: string };

export function PasswordRoundsTable({
  rounds,
  teams,
  names
}: {
  rounds: Round[];
  teams: Team[];
  names: Record<string, string>;
}) {
  return (
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
        {rounds.map((round) => (
          <Table.Row key={`${round.round}-${round.clueGiverId}-${round.guesserId}`}>
            <Table.Cell>{round.round}</Table.Cell>
            <Table.Cell>{teams[round.teamIndex]?.name ?? `Team ${round.teamIndex + 1}`}</Table.Cell>
            <Table.Cell>{names[round.clueGiverId] ?? round.clueGiverId.slice(0, 6)}</Table.Cell>
            <Table.Cell>{names[round.guesserId] ?? round.guesserId.slice(0, 6)}</Table.Cell>
            <Table.Cell>{round.clue}</Table.Cell>
            <Table.Cell>{round.guess ?? "-"}</Table.Cell>
            <Table.Cell>{round.correct ? "✅" : "❌"}</Table.Cell>
          </Table.Row>
        ))}
      </Table.Body>
    </Table>
  );
}
