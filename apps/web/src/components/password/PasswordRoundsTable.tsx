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
  if (!rounds.length) {
    return null;
  }

  return (
    <div className="game-section">
      <h3 className="game-section-label">Round History</h3>
      <div className="panel overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Team</th>
              <th>Clue</th>
              <th>Guess</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rounds.map((round) => (
              <tr key={`${round.round}-${round.clueGiverId}`}>
                <td>{round.round}</td>
                <td>{teams[round.teamIndex]?.name ?? `Team ${round.teamIndex + 1}`}</td>
                <td style={{ color: "var(--primary)", fontWeight: 600 }}>{round.clue}</td>
                <td>{round.guess ?? "—"}</td>
                <td style={{ color: round.correct ? "#4ade80" : "#f87171" }}>
                  {round.correct ? "✓" : "✗"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
