import { mutators, queries } from "@games/shared";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { FiPlay, FiLogOut, FiLogIn, FiLock, FiUnlock, FiHelpCircle } from "react-icons/fi";
import { PasswordHeader } from "../components/password/PasswordHeader";
import { PasswordTeamGrid } from "../components/password/PasswordTeamGrid";
import { addRecentGame } from "../lib/session";
import { showToast } from "../lib/toast";
import { useIsMobile } from "../hooks/useIsMobile";
import { MobilePasswordBeginPage } from "../mobile/pages/MobilePasswordBeginPage";
import { PasswordDemo } from "../components/demos/PasswordDemo";

export function PasswordBeginPage({ sessionId }: { sessionId: string }) {
  const isMobile = useIsMobile();
  if (isMobile) return <MobilePasswordBeginPage sessionId={sessionId} />;

  const zero = useZero();
  const navigate = useNavigate();
  const params = useParams();
  const gameId = params.id ?? "";
  const [games] = useQuery(queries.password.byId({ id: gameId }));
  const [sessions] = useQuery(queries.sessions.byGame({ gameType: "password", gameId }));
  useQuery(queries.sessions.byId({ id: sessionId }));
  const game = games[0];
  const prevAnnouncementTs = useRef<number | null>(null);
  const [showDemo, setShowDemo] = useState(false);

  const names = useMemo(() => {
    return sessions.reduce<Record<string, string>>((acc, s) => {
      acc[s.id] = s.name ?? s.id.slice(0, 6);
      return acc;
    }, {});
  }, [sessions]);

  useEffect(() => {
    if (!game) return;
    addRecentGame({ id: game.id, code: game.code, gameType: "password" });
  }, [game]);

  // Auto-navigate to game when host starts
  useEffect(() => {
    if (game?.phase === "playing") {
      navigate(`/password/${game.id}`);
    }
  }, [game?.phase, game?.id, navigate]);

  useEffect(() => {
    if (!game) return;
    if (game.phase === "ended") {
      showToast("The host ended the game", "info");
      navigate("/");
      return;
    }
    if (game.kicked.includes(sessionId)) {
      showToast("You were kicked from the game", "error");
      navigate("/");
    }
  }, [game?.phase, game?.kicked, sessionId, navigate]);

  // Announcement watcher (skip for host — they sent it)
  const isHost = game?.host_id === sessionId;
  useEffect(() => {
    if (!game?.announcement) return;
    if (prevAnnouncementTs.current !== game.announcement.ts) {
      prevAnnouncementTs.current = game.announcement.ts;
      if (!isHost) showToast(`📢 ${game.announcement.text}`, "info");
    }
  }, [game?.announcement, isHost]);

  useEffect(() => {
    if (game) return;
    const timer = setTimeout(() => navigate("/"), 3000);
    return () => clearTimeout(timer);
  }, [game, navigate]);

  if (!game) {
    return (
      <div className="game-page">
        <div className="game-empty">
          <p className="game-empty-title">Game not found</p>
          <p className="game-empty-sub">Redirecting home…</p>
          <button className="btn btn-primary" onClick={() => navigate("/")}>Go Home</button>
        </div>
      </div>
    );
  }

  const inGame = game.teams.some((t) => t.members.includes(sessionId));
  const teamsWithPlayers = game.teams.filter((t) => t.members.length > 0).length;
  const canStart = isHost && teamsWithPlayers >= 2;

  return (
    <div className="game-page" data-game-theme="password">
      <PasswordHeader
        title="Password"
        code={game.code}
        phase={game.phase}
        currentRound={game.current_round}
        isHost={isHost}
      />

      <PasswordTeamGrid
        teams={game.teams}
        scores={game.scores}
        names={names}
        activeTeamIndex={undefined}
        sessionId={sessionId}
        isLobby
        isHost={isHost}
        teamsLocked={game.settings.teamsLocked}
        onSwitchTeam={(teamName) =>
          void zero.mutate(mutators.password.switchTeam({ gameId, sessionId, teamName }))
            .client.catch(() => showToast("Couldn't switch team", "error"))
        }
        onMovePlayer={(playerId, teamName) =>
          void zero.mutate(mutators.password.movePlayer({ gameId, hostId: sessionId, playerId, teamName }))
            .client.catch(() => showToast("Couldn't move player", "error"))
        }
      />

      {!inGame && (
        <div className="game-section game-join-prompt">
          <p className="game-join-text">You're not in this lobby yet.</p>
          <button
            className="btn btn-primary game-action-btn"
            onClick={() =>
              void zero.mutate(mutators.password.join({ gameId, sessionId }))
                .client.catch(() => showToast("Couldn't join game", "error"))
            }
          >
            <FiLogIn size={16} /> Join Game
          </button>
        </div>
      )}

      {inGame && (
        <div className="game-section">
          {teamsWithPlayers < 2 && (
            <p className="game-hint">Need at least 2 teams with players to start</p>
          )}
          <div className="game-actions">
            {isHost && (
              <button
                className="btn btn-muted"
                onClick={() =>
                  void zero.mutate(mutators.password.lockTeams({ gameId, hostId: sessionId, locked: !game.settings.teamsLocked }))
                }
              >
                {game.settings.teamsLocked ? <><FiUnlock size={14} /> Unlock Teams</> : <><FiLock size={14} /> Lock Teams</>}
              </button>
            )}
            {isHost ? (
              <button
                className="btn btn-primary game-action-btn"
                disabled={!canStart}
                onClick={() => void zero.mutate(mutators.password.start({ gameId, hostId: sessionId }))}
              >
                <FiPlay size={16} /> Start Game
              </button>
            ) : (
              <p className="game-waiting-text">Waiting for host to start…</p>
            )}
            <button
              className="btn btn-muted"
              onClick={() => void zero.mutate(mutators.password.leave({ gameId, sessionId }))}
            >
              <FiLogOut size={14} /> Leave
            </button>
          </div>
        </div>
      )}

      <div className="game-section" style={{ textAlign: "center" }}>
        <button className="demo-trigger-btn" onClick={() => setShowDemo(true)}>
          <FiHelpCircle size={16} /> How to Play
        </button>
      </div>

      {showDemo && <PasswordDemo onClose={() => setShowDemo(false)} />}
    </div>
  );
}
