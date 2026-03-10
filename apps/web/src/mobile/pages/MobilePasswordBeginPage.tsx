import { mutators, queries } from "@games/shared";
import { useQuery, useZero } from "../../lib/zero";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { FiPlay, FiLogIn, FiLock, FiUnlock, FiArrowRight, FiCheck, FiXCircle } from "react-icons/fi";
import { addRecentGame } from "../../lib/session";
import { showToast } from "../../lib/toast";
import { useMobileHostRegister } from "../../lib/mobile-host-context";
import { MobileGameHeader } from "../components/MobileGameHeader";
import { MobileGameNotFound } from "../components/MobileGameNotFound";
import { MobileSpectatorBadge } from "../../components/shared/SpectatorBadge";

const teamColors = ["#7ecbff", "#a78bfa", "#4ade80", "#f59e0b", "#f87171", "#ec4899"];

export function MobilePasswordBeginPage({ sessionId }: { sessionId: string }) {
  const zero = useZero();
  const navigate = useNavigate();
  const params = useParams();
  const gameId = params.id ?? "";
  const [games] = useQuery(queries.password.byId({ id: gameId }));
  const [sessions] = useQuery(queries.sessions.byGame({ gameType: "password", gameId }));
  useQuery(queries.sessions.byId({ id: sessionId }));
  const game = games[0];
  const prevAnnouncementTs = useRef<number | null>(null);
  const isSpectatorRef = useRef(false);

  const names = useMemo(() => sessions.reduce<Record<string, string>>((acc, s) => { acc[s.id] = s.name ?? s.id.slice(0, 6); return acc; }, {}), [sessions]);

  useEffect(() => { if (game) addRecentGame({ id: game.id, code: game.code, gameType: "password" }); }, [game]);
  useEffect(() => { if (game?.phase === "playing") navigate(`/password/${game.id}`); }, [game?.phase, game?.id, navigate]);
  useEffect(() => {
    if (!game) return;
    if (game.phase === "ended") { showToast("The host ended the game", "info"); navigate("/"); return; }
    if (game.kicked.includes(sessionId)) { showToast("You were kicked from the game", "error"); navigate("/"); }
  }, [game?.phase, game?.kicked, sessionId, navigate]);

  useEffect(() => {
    const spectating = game?.spectators?.some((s) => s.sessionId === sessionId) ?? false;
    isSpectatorRef.current = spectating;
  }, [game?.spectators, sessionId]);

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

  const isHost = game?.host_id === sessionId;

  useMobileHostRegister(
    isHost && game
      ? { type: "password", gameId, hostId: game.host_id, players: game.teams.flatMap((t) => t.members.map((id) => ({ id, name: names[id] ?? id.slice(0, 6) }))), spectators: game.spectators ?? [] }
      : null
  );

  useEffect(() => {
    if (!game?.announcement) return;
    if (prevAnnouncementTs.current !== game.announcement.ts) {
      prevAnnouncementTs.current = game.announcement.ts;
      if (!isHost) showToast(`📢 ${game.announcement.text}`, "info");
    }
  }, [game?.announcement, isHost]);

  if (!game) return <MobileGameNotFound theme="password" />;

  const inGame = game.teams.some((t) => t.members.includes(sessionId));
  const isSpectator = game.spectators?.some((s) => s.sessionId === sessionId) ?? false;
  const myTeam = game.teams.find((t) => t.members.includes(sessionId))?.name;
  const teamsWithPlayers = game.teams.filter((t) => t.members.length > 0).length;
  const canStart = isHost && teamsWithPlayers >= 2;

  return (
    <div className="m-page" data-game-theme="password">
      <MobileGameHeader code={game.code} gameLabel="Password" phase="Lobby" round={game.current_round} accent="var(--game-accent)" category={game.settings.category ?? null}>
        {isSpectator && <MobileSpectatorBadge />}
      </MobileGameHeader>

      {/* Join prompt — not yet in a team */}
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
                        const n = names[id] ?? id.slice(0, 6);
                        const isMe = id === sessionId;
                        return (
                          <div key={id} className={`m-pw-member${isMe ? " m-pw-member--me" : ""}`}>
                            <span>{(n[0] ?? "?").toUpperCase()} {n}{isMe ? " (you)" : ""}</span>
                            {isHost && !isMe && (
                              <div className="m-pw-member-actions">
                                {game.teams.filter((t) => t.name !== team.name).map((t, ti) => (
                                  <button
                                    key={t.name}
                                    className="m-pw-move-btn"
                                    style={{ borderColor: teamColors[game.teams.indexOf(t) % teamColors.length], color: teamColors[game.teams.indexOf(t) % teamColors.length] }}
                                    onClick={() => void zero.mutate(mutators.password.movePlayer({ gameId, hostId: sessionId, playerId: id, teamName: t.name }))}
                                  >
                                    <FiArrowRight size={10} /> {t.name}
                                  </button>
                                ))}
                              </div>
                            )}
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
                      onClick={() => {
                        if (!inGame) {
                          const doJoin = () => zero.mutate(mutators.password.join({ gameId, sessionId }))
                            .client.then(() => zero.mutate(mutators.password.switchTeam({ gameId, sessionId, teamName: team.name })))
                            .catch(() => showToast("Couldn't join team", "error"));
                          if (isSpectator) void zero.mutate(mutators.password.leaveSpectator({ gameId, sessionId })).client.then(doJoin).catch(doJoin);
                          else void doJoin();
                        } else {
                          void zero.mutate(mutators.password.switchTeam({ gameId, sessionId, teamName: team.name }))
                            .client.catch(() => showToast("Couldn't switch team", "error"));
                        }
                      }}
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
        <div className="m-card">
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {isHost ? (
              <>
                <button
                  className="m-btn m-btn-primary"
                  style={{ width: "100%" }}
                  disabled={!canStart}
                  onClick={() => void zero.mutate(mutators.password.start({ gameId, hostId: sessionId }))}
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
                  onClick={() => void zero.mutate(mutators.password.endGame({ gameId, hostId: sessionId }))}
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
              onClick={() => void zero.mutate(mutators.password.leave({ gameId, sessionId }))}
            >
              Leave Game
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
