import { type CSSProperties, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FiAlertTriangle, FiArrowRight, FiHash, FiLogOut } from "react-icons/fi";
import { GAME_META, multiplayerTypeToGameSlug, queries, mutators } from "@games/shared";
import { useQuery, useZero } from "../../lib/zero";
import { SessionGameType, leaveCurrentGame } from "../../lib/session";
import { showToast } from "../../lib/toast";

const ACTIVE_GAME_MODAL_DELAY_MS = 800;

function formatPhase(phase: string | undefined): string {
  if (!phase) return "Syncing";
  if (phase === "lobby") return "Lobby";
  if (phase === "playing") return "In progress";
  if (phase === "submitting") return "Submitting";
  if (phase === "results") return "Results";
  if (phase === "finished") return "Finished";
  if (phase === "ended") return "Ended";
  return phase.charAt(0).toUpperCase() + phase.slice(1);
}

function routeForGame(gameType: SessionGameType, gameId: string): string {
  if (gameType === "imposter") return `/imposter/${gameId}`;
  if (gameType === "password") return `/password/${gameId}/begin`;
  if (gameType === "chain_reaction") return `/chain/${gameId}`;
  if (gameType === "shade_signal") return `/shade/${gameId}`;
  return `/location/${gameId}`;
}

const DUMMY_ID = "________";

/**
 * Modal that blocks the home page when the session is attached to an active game.
 * Renders nothing if there's no active game or the game has ended.
 */
export function ActiveGameModal({ sessionId, suppress }: { sessionId: string; suppress?: boolean }) {
  const zero = useZero();
  const navigate = useNavigate();
  const [leaving, setLeaving] = useState(false);
  const [readyToShow, setReadyToShow] = useState(false);

  const [mySessionRows] = useQuery(queries.sessions.byId({ id: sessionId }));
  const mySession = mySessionRows[0] ?? null;

  const gameType = (mySession?.game_type ?? null) as SessionGameType | null;
  const gameId = mySession?.game_id ?? null;

  // Query each game type - only the matching one returns anything
  const [imposterRows] = useQuery(queries.imposter.byId({ id: gameType === "imposter" && gameId ? gameId : DUMMY_ID }));
  const [passwordRows] = useQuery(queries.password.byId({ id: gameType === "password" && gameId ? gameId : DUMMY_ID }));
  const [chainRows] = useQuery(queries.chainReaction.byId({ id: gameType === "chain_reaction" && gameId ? gameId : DUMMY_ID }));
  const [shadeRows] = useQuery(queries.shadeSignal.byId({ id: gameType === "shade_signal" && gameId ? gameId : DUMMY_ID }));
  const [locationRows] = useQuery(queries.locationSignal.byId({ id: gameType === "location_signal" && gameId ? gameId : DUMMY_ID }));

  const game = imposterRows[0] || passwordRows[0] || chainRows[0] || shadeRows[0] || locationRows[0] || null;

  const gameRecord = game as Record<string, unknown> | null;
  const phase = gameRecord?.phase as string | undefined;
  const gameCode = gameRecord?.code as string | undefined;
  const kicked = (gameRecord?.kicked ?? []) as string[];
  const wasKicked = kicked.includes(sessionId);

  // Only treat as ended when we actually found the game AND it's over.
  // game === null could mean the query hasn't resolved yet - don't auto-clear for that.
  const gameExistsAndEnded = game != null && (phase === "ended" || phase === "finished");
  const shouldBlock = Boolean(gameType && gameId && game && !gameExistsAndEnded && !suppress);

  // Auto-clear stale session when the game has ended or we've been kicked
  useEffect(() => {
    if (gameType && gameId && (gameExistsAndEnded || wasKicked)) {
      void zero.mutate(mutators.sessions.clearGame({ id: sessionId }));
    }
  }, [gameType, gameId, gameExistsAndEnded, wasKicked, zero, sessionId]);

  useEffect(() => {
    setReadyToShow(false);
    if (!shouldBlock) return;

    const timer = window.setTimeout(() => setReadyToShow(true), ACTIVE_GAME_MODAL_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [shouldBlock, gameType, gameId, phase]);

  // Don't show if no session game attachment, or game has ended / been cleaned up
  if (!gameType || !gameId) return null;
  if (gameExistsAndEnded) return null;
  // game is null = query still loading or game doesn't exist yet; don't block
  if (!game) return null;
  // Suppress when the parent is mid-action (creating/joining a game)
  if (suppress) return null;
  if (!readyToShow) return null;

  const handleRejoin = () => {
    navigate(routeForGame(gameType, gameId));
  };

  const handleLeave = async () => {
    setLeaving(true);
    try {
      // Immediately detach the session (guaranteed to dismiss the modal)
      await zero.mutate(mutators.sessions.clearGame({ id: sessionId })).client;
      // Best-effort: also remove from the game's player list
      void leaveCurrentGame(zero, sessionId, gameType, gameId).catch(() => {});
    } catch {
      showToast("Couldn't leave game", "error");
    } finally {
      setLeaving(false);
    }
  };

  const gameMeta = GAME_META[multiplayerTypeToGameSlug(gameType)];
  const gameLabel = gameMeta.title;
  const accent = gameMeta.accent;
  const roomLabel = gameCode ?? gameId.slice(0, 6).toUpperCase();

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="active-game-title">
      <div className="modal-panel active-game-modal" style={{ "--active-game-accent": accent } as CSSProperties}>
        <div className="modal-header">
          <h2 id="active-game-title" className="modal-title active-game-title">
            <FiAlertTriangle size={18} /> {wasKicked ? "You were removed" : "Game already open"}
          </h2>
        </div>

        <div className="modal-body">
          {wasKicked ? (
            <p className="active-game-copy">
              You were removed from this <strong>{gameLabel}</strong> game.
            </p>
          ) : (
            <p className="active-game-copy">
              You are still attached to this game. Rejoin it, or leave it before starting or joining another room.
            </p>
          )}

          <div className="active-game-summary">
            <div className="active-game-summary-row">
              <span className="active-game-summary-label">Game</span>
              <strong>{gameLabel}</strong>
            </div>
            <div className="active-game-summary-row">
              <span className="active-game-summary-label">Room</span>
              <strong className="active-game-code">
                <FiHash size={12} /> {roomLabel}
              </strong>
            </div>
            <div className="active-game-summary-row">
              <span className="active-game-summary-label">Status</span>
              <strong>{formatPhase(phase)}</strong>
            </div>
          </div>

          <div className="game-actions active-game-actions">
            {!wasKicked && (
              <button className="btn active-game-rejoin-btn game-action-btn" onClick={handleRejoin}>
                Rejoin {gameLabel} <FiArrowRight size={14} />
              </button>
            )}
            <button className="btn active-game-leave-btn" onClick={() => void handleLeave()} disabled={leaving}>
              <FiLogOut size={14} />
              {leaving ? "Leaving..." : "Leave Game"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
