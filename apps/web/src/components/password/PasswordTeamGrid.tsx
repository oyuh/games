import { useState, type CSSProperties } from "react";
import { FiArrowRight, FiCheck, FiChevronUp, FiLock } from "react-icons/fi";
import { BorringAvatar } from "../shared/BorringAvatar";
import { getPasswordPlayerName } from "../../lib/password-names";

type Team = { name: string; members: string[] };

const teamColors = ["#7ecbff", "#a78bfa", "#4ade80", "#f59e0b", "#f87171", "#ec4899"];

export function PasswordTeamGrid({
  teams,
  scores,
  names,
  activeTeamIndex,
  sessionId,
  showScores,
  targetScore,
  isLobby,
  defaultExpanded,
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
  targetScore?: number;
  isLobby?: boolean;
  defaultExpanded?: boolean;
  isHost?: boolean;
  teamsLocked?: boolean | undefined;
  onSwitchTeam?: (teamName: string) => void;
  onMovePlayer?: (playerId: string, teamName: string) => void;
}) {
  const [expandedTeams, setExpandedTeams] = useState<Set<string>>(
    () => new Set(defaultExpanded ? teams.map((team) => team.name) : [])
  );
  const myTeam = teams.find((t) => t.members.includes(sessionId))?.name;
  // Create a flat list of all players to determine their index for color assignment
  const allPlayers = teams.flatMap((t) => t.members);
  const toggleTeam = (teamName: string) => {
    setExpandedTeams((current) => {
      const next = new Set(current);
      if (next.has(teamName)) {
        next.delete(teamName);
      } else {
        next.add(teamName);
      }
      return next;
    });
  };

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
          const isExpanded = expandedTeams.has(team.name);

          return (
            <div
              key={team.name}
              className={`game-team-card${isActive ? " game-team-card--active" : ""}${isMyTeam ? " game-team-card--mine" : ""}${canJoin ? " game-team-card--joinable" : ""}${isExpanded ? " game-team-card--expanded" : ""}`}
              style={{ "--team-color": color } as CSSProperties}
              role="button"
              tabIndex={0}
              aria-expanded={isExpanded}
              aria-label={isExpanded ? `Collapse ${team.name}` : `Show ${team.name} members`}
              onClick={() => toggleTeam(team.name)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  toggleTeam(team.name);
                }
              }}
            >
              <span
                className="game-team-expand-btn"
                aria-hidden="true"
              >
                <FiChevronUp size={16} aria-hidden="true" />
              </span>
              <div className="game-team-summary">
                <span className="game-team-name">{team.name}</span>
                {showScores && (
                  <span className="game-team-score" data-tooltip={`${team.name}'s score${targetScore ? ` - first to ${targetScore} wins` : ""}`} data-tooltip-variant="game">
                    {score}{targetScore ? ` / ${targetScore}` : ""}
                  </span>
                )}
              </div>

              <div
                className="game-team-details"
                aria-hidden={!isExpanded}
                onClick={(event) => event.stopPropagation()}
              >
                <div className="game-team-detail-meta">
                  <span className="game-team-meta">{memberCountLabel}</span>
                  {isMyTeam && (
                    <span className="game-team-state-badge game-team-state-badge--mine">
                      <FiCheck size={11} /> You're in
                    </span>
                  )}
                  {isActive && <span className="badge badge-warn" style={{ fontSize: "0.75rem" }} data-tooltip="This team is currently guessing" data-tooltip-variant="game">Playing</span>}
                </div>

                <div className="game-team-members">
                  {team.members.length > 0 ? (
                    team.members.map((id) => {
                      const n = getPasswordPlayerName(names, id);
                      const isMe = id === sessionId;
                      const playerIndex = allPlayers.indexOf(id);
                      return (
                        <div key={id} className="game-team-member-row">
                          <div className="game-team-member-info">
                            <span className={`game-team-avatar${isMe ? " game-team-avatar--me" : ""}`}>
                              <BorringAvatar
                                seed={id}
                                playerIndex={playerIndex}
                              />
                            </span>
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
  const otherTeams = teams.reduce<Array<Team & { color: string }>>((targets, team, index) => {
    if (team.name !== currentTeam) {
      targets.push({ ...team, color: teamColors[index % teamColors.length]! });
    }
    return targets;
  }, []);

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
