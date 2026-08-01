import { mutators } from "@games/shared";
import { optimistic } from "../../lib/zero";
import { useEffect, useRef, useState } from "react";
import { FiPlay, FiLogIn, FiLock, FiUnlock, FiArrowRight, FiCheck, FiXCircle } from "react-icons/fi";
import { InSessionModal } from "../../components/shared/InSessionModal";
import { LobbyVisibilityToggle } from "../../components/shared/LobbyVisibilityToggle";
import { ensureName, leaveCurrentGame } from "../../lib/session";
import { getPasswordPlayerName } from "../../lib/password-names";
import { showToast } from "../../lib/toast";
import { useMobileHostRegister } from "../../lib/mobile-host-context";
import { MobileGameHeader } from "../components/MobileGameHeader";
import { MobileGameNotFound } from "../components/MobileGameNotFound";
import { MobileSpectatorBadge, MobileHostBadge } from "../../components/shared/SpectatorBadge";
import { usePasswordBegin } from "../../hooks/usePasswordBegin";

const teamColors = ["#7ecbff", "#a78bfa", "#4ade80", "#f59e0b", "#f87171", "#ec4899"];

export function MobilePasswordBeginPage({ sessionId }: { sessionId: string }) {
  const {
    zero, navigate, gameId, game, names, isHost,
    inGame, isSpectator, activeGameType, activeGameId, inAnotherGame,
    teamsWithPlayers, canStart, startingGame, startGame,
    showInSessionModal, setShowInSessionModal,
    joiningFromOtherGame, setJoiningFromOtherGame,
  } = usePasswordBegin(sessionId);
  const [pendingTeamToJoin, setPendingTeamToJoin] = useState<string | null>(null);

  /* Mobile-only: leaving the lobby as a spectator drops the spectator slot.
     The ref keeps the unmount cleanup from closing over a stale value. */
  const isSpectatorRef = useRef(false);
  useEffect(() => {
    isSpectatorRef.current = isSpectator;
  }, [isSpectator]);

  useEffect(() => {
    let active = false;
    const timer = setTimeout(() => { active = true; }, 500);
    return () => {
      clearTimeout(timer);
      if (active && isSpectatorRef.current) {
        void zero.mutate(mutators.password.leaveSpectator({ gameId, sessionId }));
      }
    };
  }, [gameId, sessionId, zero]);

  useMobileHostRegister(
    isHost && game
      ? { type: "password", gameId, hostId: game.host_id, players: game.teams.flatMap((t) => t.members.map((id) => ({ id, name: getPasswordPlayerName(names, id) }))), spectators: game.spectators ?? [] }
      : null
  );

  if (!game) return <MobileGameNotFound theme="password" />;

  const myTeam = game.teams.find((t) => t.members.includes(sessionId))?.name;

  const joinTeam = (teamName: string) => {
    if (!inGame) {
      const doJoin = async () => {
        await ensureName(zero, sessionId);
        return zero.mutate(mutators.password.join({ gameId, sessionId }))
          .client.then(() => zero.mutate(mutators.password.switchTeam({ gameId, sessionId, teamName })))
          .catch(() => showToast("Couldn't join team", "error"));
      };
      if (isSpectator) {
        void zero.mutate(mutators.password.leaveSpectator({ gameId, sessionId })).client.then(doJoin).catch(doJoin);
      } else {
        void doJoin();
      }
      return;
    }
    void zero.mutate(mutators.password.switchTeam({ gameId, sessionId, teamName }))
      .client.catch(() => showToast("Couldn't switch team", "error"));
  };

  const handleJoinTeamClick = (teamName: string) => {
    if (!inGame && inAnotherGame) {
      if (activeGameType && activeGameId) {
        setJoiningFromOtherGame(true);
        void leaveCurrentGame(zero, sessionId, activeGameType, activeGameId)
          .catch(() => showToast("Couldn't leave current game", "error"))
          .finally(() => {
            setJoiningFromOtherGame(false);
            joinTeam(teamName);
          });
        return;
      }
      return;
    }
    joinTeam(teamName);
  };

  const confirmLeaveAndJoin = () => {
    if (!activeGameType || !activeGameId) {
      setShowInSessionModal(false);
      return;
    }
    setJoiningFromOtherGame(true);
    void leaveCurrentGame(zero, sessionId, activeGameType, activeGameId)
      .then(() => {
        setShowInSessionModal(false);
        if (pendingTeamToJoin) {
          joinTeam(pendingTeamToJoin);
          setPendingTeamToJoin(null);
        }
      })
      .catch(() => showToast("Couldn't leave current game", "error"))
      .finally(() => setJoiningFromOtherGame(false));
  };

  return (
    <div className="m-page" data-game-theme="password">
      <MobileGameHeader code={game.code} gameLabel="Password" phase="Lobby" round={game.current_round} accent="var(--game-accent)" category={game.settings.category ?? null}>
        {isSpectator && <MobileSpectatorBadge />}
        {isHost && <MobileHostBadge />}
      </MobileGameHeader>

      {/* Join prompt - not yet in a team */}
      {!inGame && (
        <div className="m-card" style={{ textAlign: "center" }}>
          <p style={{ marginBottom: "0.75rem", opacity: 0.7 }}>{isSpectator ? "You're spectating. Join a team to play!" : "Pick a team to join!"}</p>
        </div>
      )}

      {/* Teams */}
      <div className="m-card">
        <div className="m-pw-teams-header">
          <h3 className="m-card-title" style={{ margin: 0 }}>Teams</h3>
          {game.settings.teamsLocked && (
            <span className="m-badge m-badge--warn"><FiLock size={10} /> Locked</span>
          )}
        </div>

        <div className="m-pw-teams-list">
          {game.teams.map((team, index) => {
            const color = teamColors[index % teamColors.length]!;
            const isMyTeam = team.name === myTeam;
            const canJoin = !game.settings.teamsLocked && !isMyTeam;
            return (
              <div key={team.name} className={`m-pw-team${isMyTeam ? " m-pw-team--mine" : ""}`}>
                <div className="m-pw-team-accent" style={{ background: color }} />
                <div className="m-pw-team-body">
                  <div className="m-pw-team-top">
                    <span className="m-pw-team-name" style={{ color }}>{team.name}</span>
                    <span className="m-pw-team-count">{team.members.length} player{team.members.length !== 1 ? "s" : ""}</span>
                  </div>
                  {team.members.length > 0 ? (
                    <div className="m-pw-team-members">
                      {team.members.map((id) => {
                        const n = getPasswordPlayerName(names, id);
                        const isMe = id === sessionId;
                        return (
                          <div key={id} className={`m-pw-member${isMe ? " m-pw-member--me" : ""}`}>
                            <span className="m-pw-member-name">{(n[0] ?? "?").toUpperCase()} {n}{isMe ? " (you)" : ""}</span>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="m-pw-team-empty">No players yet</p>
                  )}
                  {canJoin && (
                    <button
                      className="m-pw-team-join"
                      style={{ borderColor: color, color }}
                      onClick={() => handleJoinTeamClick(team.name)}
                    >
                      {inGame ? <><FiArrowRight size={13} /> Move here</> : <><FiLogIn size={13} /> Join</>}
                    </button>
                  )}
                  {isMyTeam && (
                    <div className="m-pw-team-you"><FiCheck size={12} /> You're here</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Actions */}
      {inGame && (
        <div className="m-card m-bottom-safe">
          <div className="m-pw-host-actions">
            {isHost ? (
              <>
                <p className="m-pw-host-actions-title">Host controls</p>
                <div style={{ display: "flex", justifyContent: "center" }}>
                  <LobbyVisibilityToggle gameType="password" gameId={gameId} sessionId={sessionId} isPublic={game.is_public} />
                </div>
                <button
                  className="m-btn m-btn-primary"
                  style={{ width: "100%" }}
                  disabled={!canStart || startingGame}
                  onClick={() => void startGame()}
                >
                  <FiPlay size={16} /> {canStart ? "Start Game" : `Need ${2 - teamsWithPlayers} more team${2 - teamsWithPlayers > 1 ? "s" : ""}`}
                </button>
                <button
                  className="m-btn m-btn-muted"
                  style={{ width: "100%" }}
                  onClick={() => void zero.mutate(mutators.password.lockTeams({ gameId, hostId: sessionId, locked: !game.settings.teamsLocked }))}
                >
                  {game.settings.teamsLocked ? <><FiUnlock size={14} /> Unlock Teams</> : <><FiLock size={14} /> Lock Teams</>}
                </button>
                <button
                  className="m-btn m-btn-muted"
                  style={{ width: "100%", color: "var(--destructive)" }}
                  onClick={() => {
                    void zero.mutate(mutators.password.endGame({ gameId, hostId: sessionId }))
                      .client.then(() => navigate("/"))
                      .catch(() => showToast("Couldn't end game", "error"));
                  }}
                >
                  <FiXCircle size={14} /> End Game
                </button>
              </>
            ) : (
              <div className="m-pw-waiting">
                <div className="m-waiting-pulse" />
                <span>Waiting for host to start…</span>
              </div>
            )}
            <button
              className="m-btn m-btn-muted"
              style={{ width: "100%" }}
              onClick={() => {
                void optimistic(zero.mutate(mutators.password.leave({ gameId, sessionId })))
                  .catch((error) => showToast(error instanceof Error ? error.message : "Couldn't leave game", "error"));
              }}
            >
              Leave Game
            </button>
          </div>
        </div>
      )}

      {showInSessionModal && activeGameType && (
        <InSessionModal
          gameType={activeGameType}
          busy={joiningFromOtherGame}
          onCancel={() => {
            setShowInSessionModal(false);
            setPendingTeamToJoin(null);
          }}
          onConfirm={confirmLeaveAndJoin}
        />
      )}
    </div>
  );
}
