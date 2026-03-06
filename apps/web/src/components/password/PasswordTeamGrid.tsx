import type { CSSProperties } from "react";

type Team = { name: string; members: string[] };

const teamColors = ["#7ecbff", "#a78bfa", "#4ade80", "#f59e0b", "#f87171", "#ec4899"];

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
    <div className="game-section">
      <h3 className="game-section-label">Teams</h3>
      <div className="game-teams-grid">
        {teams.map((team, index) => {
          const isActive = activeTeamIndex === index;
          const color = teamColors[index % teamColors.length]!;
          const score = scores[team.name] ?? 0;

          return (
            <div
              key={team.name}
              className={`game-team-card${isActive ? " game-team-card--active" : ""}`}
              style={{ "--team-color": color } as CSSProperties}
            >
              <div className="game-team-header">
                <span className="game-team-name">{team.name}</span>
                {showScores && <span className="game-team-score">{score}</span>}
                {isActive && <span className="badge badge-warn" style={{ fontSize: "0.58rem" }}>Playing</span>}
              </div>
              <div className="game-team-members">
                {team.members.length > 0 ? (
                  team.members.map((id) => {
                    const n = names[id] ?? id.slice(0, 6);
                    const isMe = id === sessionId;
                    return (
                      <span key={id} className={`game-team-member${isMe ? " game-team-member--me" : ""}`}>
                        {n}{isMe ? " (you)" : ""}
                      </span>
                    );
                  })
                ) : (
                  <span className="game-team-empty">No members</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
