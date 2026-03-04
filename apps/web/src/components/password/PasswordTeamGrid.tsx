import { Badge } from "flowbite-react";

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
        <div key={team.name} className="rounded border p-3 text-sm">
          <p className="font-semibold">{team.name}</p>
          {showScores ? <p className="text-gray-600">Score: {scores[team.name] ?? 0}</p> : null}
          <p className="text-gray-500">
            Members: {team.members.map((member) => `${names[member] ?? member.slice(0, 6)}${member === sessionId ? " (you)" : ""}`).join(", ") || "none"}
          </p>
          {activeTeamIndex === index ? <Badge className="mt-2">Current team</Badge> : null}
        </div>
      ))}
    </div>
  );
}
