import type { CSSProperties } from "react";
import { FiLock, FiArrowRight } from "react-icons/fi";

type Team = { name: string; members: string[] };

const teamColors = ["#7ecbff", "#a78bfa", "#4ade80", "#f59e0b", "#f87171", "#ec4899"];

export function PasswordTeamGrid({
  teams,
  scores,
  names,
  activeTeamIndex,
  sessionId,
  showScores,
  isLobby,
  isHost,
  teamsLocked,
  onSwitchTeam,
  onMovePlayer,
}: {
  teams: Team[];
  scores: Record<string, number>;
  names: Record<string, string>;
  activeTeamIndex: number | undefined;
  sessionId: string;
  showScores?: boolean;
  isLobby?: boolean;
  isHost?: boolean;
  teamsLocked?: boolean | undefined;
  onSwitchTeam?: (teamName: string) => void;
  onMovePlayer?: (playerId: string, teamName: string) => void;
}) {
  const myTeam = teams.find((t) => t.members.includes(sessionId))?.name;

  return (
    <div className="game-section">
      <div className="game-section-header">
        <h3 className="game-section-label">Teams</h3>
        {teamsLocked && (
          <span className="teams-locked-badge" data-tooltip="Host has locked teams" data-tooltip-variant="info"><FiLock size={11} /> Locked</span>
        )}
      </div>
      <div className="game-teams-grid">
        {teams.map((team, index) => {
          const isActive = activeTeamIndex === index;
          const color = teamColors[index % teamColors.length]!;
          const score = scores[team.name] ?? 0;
          const isMyTeam = team.name === myTeam;
          const canJoin = isLobby && !teamsLocked && !isMyTeam && onSwitchTeam;

          return (
            <div
              key={team.name}
              className={`game-team-card${isActive ? " game-team-card--active" : ""}${isMyTeam ? " game-team-card--mine" : ""}`}
              style={{ "--team-color": color } as CSSProperties}
            >
              <div className="game-team-header">
                <span className="game-team-name">{team.name}</span>
                {showScores && <span className="game-team-score" data-tooltip={`${team.name}'s total score`} data-tooltip-variant="game">{score}</span>}
                {isActive && <span className="badge badge-warn" style={{ fontSize: "0.58rem" }} data-tooltip="This team is currently guessing" data-tooltip-variant="game">Playing</span>}
              </div>
              <div className="game-team-members">
                {team.members.length > 0 ? (
                  team.members.map((id) => {
                    const n = names[id] ?? id.slice(0, 6);
                    const isMe = id === sessionId;
                    return (
                      <div key={id} className="game-team-member-row">
                        <span className={`game-team-member${isMe ? " game-team-member--me" : ""}`}>
                          {n}{isMe ? " (you)" : ""}
                        </span>
                        {isHost && isLobby && !isMe && onMovePlayer && (
                          <MoveDropdown
                            teams={teams}
                            currentTeam={team.name}
                            onMove={(targetTeam) => onMovePlayer(id, targetTeam)}
                          />
                        )}
                      </div>
                    );
                  })
                ) : (
                  <span className="game-team-empty">No members</span>
                )}
              </div>
              {canJoin && (
                <button
                  className="btn btn-sm game-team-join-btn"
                  onClick={() => onSwitchTeam(team.name)}
                  data-tooltip={`Switch to ${team.name}`}
                  data-tooltip-variant="game"
                >
                  Join
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MoveDropdown({
  teams,
  currentTeam,
  onMove,
}: {
  teams: Team[];
  currentTeam: string;
  onMove: (teamName: string) => void;
}) {
  const otherTeams = teams.filter((t) => t.name !== currentTeam);
  if (otherTeams.length === 0) return null;

  if (otherTeams.length === 1) {
    return (
      <button
        className="move-player-btn"
        data-tooltip={`Move to ${otherTeams[0]!.name}`}
        onClick={() => onMove(otherTeams[0]!.name)}
      >
        <FiArrowRight size={12} />
      </button>
    );
  }

  return (
    <select
      className="move-player-select"
      defaultValue=""
      onChange={(e) => {
        if (e.target.value) {
          onMove(e.target.value);
          e.target.value = "";
        }
      }}
    >
      <option value="" disabled>Move…</option>
      {otherTeams.map((t) => (
        <option key={t.name} value={t.name}>{t.name}</option>
      ))}
    </select>
  );
}
