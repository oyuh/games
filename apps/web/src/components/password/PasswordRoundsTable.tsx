type Round = {
  round: number;
  teamIndex: number;
  guesserId: string;
  word: string;
  clues: Array<{ sessionId: string; text: string }>;
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
              <th data-tooltip="Round number" data-tooltip-variant="info">#</th>
              <th data-tooltip="Which team played" data-tooltip-variant="info">Team</th>
              <th data-tooltip="Clues given to the guesser" data-tooltip-variant="info">Clues</th>
              <th data-tooltip="What the guesser guessed" data-tooltip-variant="info">Guess</th>
              <th data-tooltip="Correct or wrong" data-tooltip-variant="info"></th>
            </tr>
          </thead>
          <tbody>
            {rounds.map((round, idx) => (
              <tr key={`${round.round}-${idx}`}>
                <td>{round.round}</td>
                <td>{teams[round.teamIndex]?.name ?? `Team ${round.teamIndex + 1}`}</td>
                <td style={{ color: "var(--primary)", fontWeight: 600 }}>
                  {round.clues.length > 0
                    ? round.clues.map((c) => c.text).join(", ")
                    : "—"}
                </td>
                <td>{round.guess ?? "—"}</td>
                <td
                  style={{ color: round.correct ? "#4ade80" : "#f87171" }}
                  data-tooltip={round.correct ? "Correct guess!" : "Wrong guess"}
                  data-tooltip-variant={round.correct ? "success" : "danger"}
                >
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
