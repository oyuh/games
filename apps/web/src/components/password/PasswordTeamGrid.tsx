import type { CSSProperties } from "react";
import { FiArrowRight, FiCheck, FiLock } from "react-icons/fi";

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
      <div className="game-section-header game-section-header--stack">
        <div className="game-section-header-copy">
          <h3 className="game-section-label">Teams</h3>
          {isLobby && (
            <p className="game-section-subtle">
              Pick the team you want before the host starts. Hosts can rebalance players instantly.
            </p>
          )}
        </div>
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
          const memberCountLabel = `${team.members.length} ${team.members.length === 1 ? "player" : "players"}`;

          return (
            <div
              key={team.name}
              className={`game-team-card${isActive ? " game-team-card--active" : ""}${isMyTeam ? " game-team-card--mine" : ""}${canJoin ? " game-team-card--joinable" : ""}`}
              style={{ "--team-color": color } as CSSProperties}
            >
              <div className="game-team-header">
                <div className="game-team-heading">
                  <span className="game-team-name">{team.name}</span>
                  <span className="game-team-meta">{memberCountLabel}</span>
                </div>
                <div className="game-team-badges">
                  {showScores && <span className="game-team-score" data-tooltip={`${team.name}'s total score`} data-tooltip-variant="game">{score}</span>}
                  {isMyTeam && (
                    <span className="game-team-state-badge game-team-state-badge--mine">
                      <FiCheck size={11} /> You're in
                    </span>
                  )}
                  {isActive && <span className="badge badge-warn" style={{ fontSize: "0.58rem" }} data-tooltip="This team is currently guessing" data-tooltip-variant="game">Playing</span>}
                </div>
              </div>
              <div className="game-team-members">
                {team.members.length > 0 ? (
                  team.members.map((id) => {
                    const n = names[id] ?? id.slice(0, 6);
                    const isMe = id === sessionId;
                    const initial = (n[0] ?? "?").toUpperCase();
                    return (
                      <div key={id} className="game-team-member-row">
                        <div className="game-team-member-info">
                          <span className={`game-team-avatar${isMe ? " game-team-avatar--me" : ""}`}>{initial}</span>
                          <div className="game-team-member-copy">
                            <span className={`game-team-member${isMe ? " game-team-member--me" : ""}`}>{n}</span>
                            <span className="game-team-member-caption">{isMe ? "You" : "Player"}</span>
                          </div>
                        </div>
                        {isHost && isLobby && !isMe && onMovePlayer && (
                          <MoveTargets
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
              <div className="game-team-footer">
                {canJoin && (
                  <button
                    className="btn btn-sm game-team-join-btn"
                    onClick={() => onSwitchTeam(team.name)}
                    data-tooltip={`Switch to ${team.name}`}
                    data-tooltip-variant="game"
                  >
                    <FiArrowRight size={14} /> {myTeam ? `Move to ${team.name}` : `Join ${team.name}`}
                  </button>
                )}
                {isMyTeam && isLobby && (
                  <div className="game-team-joined-note">
                    <FiCheck size={13} /> You're already on this team
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MoveTargets({
  teams,
  currentTeam,
  onMove,
}: {
  teams: Team[];
  currentTeam: string;
  onMove: (teamName: string) => void;
}) {
  const otherTeams = teams
    .map((team, index) => ({ ...team, color: teamColors[index % teamColors.length]! }))
    .filter((t) => t.name !== currentTeam);

  if (otherTeams.length === 0) return null;

  return (
    <div className="move-player-actions">
      <span className="move-player-label">Move to</span>
      <div className="move-player-targets">
        {otherTeams.map((team) => (
          <button
            key={team.name}
            type="button"
            className="move-player-btn"
            style={{ "--move-target-color": team.color } as CSSProperties}
            data-tooltip={`Move to ${team.name}`}
            data-tooltip-variant="game"
            onClick={() => onMove(team.name)}
          >
            <FiArrowRight size={11} /> {team.name}
          </button>
        ))}
      </div>
    </div>
  );
}
