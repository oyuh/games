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
          {rounds.map((round) => (
            <tr key={`${round.round}-${round.clueGiverId}-${round.guesserId}`}>
              <td>{round.round}</td>
              <td>{teams[round.teamIndex]?.name ?? `Team ${round.teamIndex + 1}`}</td>
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
  );
}
