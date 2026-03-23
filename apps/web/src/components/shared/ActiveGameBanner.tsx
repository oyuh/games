import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FiAlertTriangle, FiArrowRight, FiLogOut, FiX } from "react-icons/fi";
import { queries, mutators } from "@games/shared";
import { useQuery, useZero } from "../../lib/zero";
import { SessionGameType, leaveCurrentGame } from "../../lib/session";
import { showToast } from "../../lib/toast";

const GAME_LABELS: Record<SessionGameType, string> = {
  imposter: "Imposter",
  password: "Password",
  chain_reaction: "Chain Reaction",
  shade_signal: "Shade Signal",
  location_signal: "Location Signal",
};

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

  const [mySessionRows] = useQuery(queries.sessions.byId({ id: sessionId }));
  const mySession = mySessionRows[0] ?? null;

  const gameType = (mySession?.game_type ?? null) as SessionGameType | null;
  const gameId = mySession?.game_id ?? null;

  // Query each game type — only the matching one returns anything
  const [imposterRows] = useQuery(queries.imposter.byId({ id: gameType === "imposter" && gameId ? gameId : DUMMY_ID }));
  const [passwordRows] = useQuery(queries.password.byId({ id: gameType === "password" && gameId ? gameId : DUMMY_ID }));
  const [chainRows] = useQuery(queries.chainReaction.byId({ id: gameType === "chain_reaction" && gameId ? gameId : DUMMY_ID }));
  const [shadeRows] = useQuery(queries.shadeSignal.byId({ id: gameType === "shade_signal" && gameId ? gameId : DUMMY_ID }));
  const [locationRows] = useQuery(queries.locationSignal.byId({ id: gameType === "location_signal" && gameId ? gameId : DUMMY_ID }));

  const game = imposterRows[0] || passwordRows[0] || chainRows[0] || shadeRows[0] || locationRows[0] || null;

  const phase = (game as Record<string, unknown> | null)?.phase as string | undefined;
  const kicked = ((game as Record<string, unknown> | null)?.kicked ?? []) as string[];
  const wasKicked = kicked.includes(sessionId);

  // Only treat as ended when we actually found the game AND it's over.
  // game === null could mean the query hasn't resolved yet — don't auto-clear for that.
  const gameExistsAndEnded = game != null && (phase === "ended" || phase === "finished");

  // Auto-clear stale session when the game has ended or we've been kicked
  useEffect(() => {
    if (gameType && gameId && (gameExistsAndEnded || wasKicked)) {
      void zero.mutate(mutators.sessions.clearGame({ id: sessionId }));
    }
  }, [gameType, gameId, gameExistsAndEnded, wasKicked, zero, sessionId]);

  // Don't show if no session game attachment, or game has ended / been cleaned up
  if (!gameType || !gameId) return null;
  if (gameExistsAndEnded) return null;
  // game is null = query still loading or game doesn't exist yet; don't block
  if (!game) return null;
  // Suppress when the parent is mid-action (creating/joining a game)
  if (suppress) return null;

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

  return (
    <div className="modal-overlay">
      <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title" style={{ display: "flex", alignItems: "center", gap: "0.45rem" }}>
            <FiAlertTriangle size={18} /> {wasKicked ? "You were removed" : "You're in a game!"}
          </h2>
        </div>

        <div className="modal-body">
          {wasKicked ? (
            <p className="host-section-desc" style={{ marginBottom: "1rem" }}>
              You were removed from the <strong>{GAME_LABELS[gameType]}</strong> game.
            </p>
          ) : (
            <>
              <p className="host-section-desc" style={{ marginBottom: "0.75rem" }}>
                You're currently in a <strong>{GAME_LABELS[gameType]}</strong> game
                {phase === "lobby" ? " (lobby)" : " (in progress)"}.
              </p>
              <p className="host-section-desc" style={{ marginBottom: "1rem" }}>
                Would you like to rejoin or leave?
              </p>
            </>
          )}
          <div className="game-actions" style={{ justifyContent: "flex-end" }}>
            <button className="btn btn-muted" onClick={() => void handleLeave()} disabled={leaving}>
              <FiLogOut size={14} style={{ marginRight: "0.25rem" }} />
              {leaving ? "Leaving…" : "Leave Game"}
            </button>
            {!wasKicked && (
              <button className="btn btn-primary game-action-btn" onClick={handleRejoin}>
                Rejoin <FiArrowRight size={14} style={{ marginLeft: "0.25rem" }} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
