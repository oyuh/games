type Team = { name: string; members: string[] };

export function PasswordTeamGrid({
  teams,
  scores,
  names,
  activeTeamIndex,
  sessionId,
  showScores
}: {
  teams: Team[];
  scores: Record<string, number>;
  names: Record<string, string>;
  activeTeamIndex: number | undefined;
  sessionId: string;
  showScores?: boolean;
}) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {teams.map((team, index) => (
        <div key={team.name} className="panel" style={{ fontSize: "0.875rem" }}>
          <p style={{ fontWeight: 600, color: "var(--primary)" }}>{team.name}</p>
          {showScores ? <p style={{ color: "var(--muted-foreground)" }}>Score: {scores[team.name] ?? 0}</p> : null}
          <p style={{ color: "var(--secondary)", marginTop: "0.25rem" }}>
            Members: {team.members.map((member) => `${names[member] ?? member.slice(0, 6)}${member === sessionId ? " (you)" : ""}`).join(", ") || "none"}
          </p>
          {activeTeamIndex === index ? (
            <span className="badge" style={{ marginTop: "0.5rem", display: "inline-flex" }}>Current team</span>
          ) : null}
        </div>
      ))}
    </div>
  );
}
