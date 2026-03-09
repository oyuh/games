import { mutators, queries } from "@games/shared";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { FiLogIn, FiHelpCircle } from "react-icons/fi";
import { ImposterClueSection } from "../components/imposter/ImposterClueSection";
import { ImposterHeader } from "../components/imposter/ImposterHeader";
import { ImposterLobbyActions } from "../components/imposter/ImposterLobbyActions";
import { ImposterPlayersCard } from "../components/imposter/ImposterPlayersCard";
import { ImposterResultsSection } from "../components/imposter/ImposterResultsSection";
import { ImposterVoteSection } from "../components/imposter/ImposterVoteSection";
import { usePresenceSocket } from "../hooks/usePresenceSocket";
import { addRecentGame } from "../lib/session";
import { showToast } from "../lib/toast";
import { useIsMobile } from "../hooks/useIsMobile";
import { MobileImposterPage } from "../mobile/pages/MobileImposterPage";
import { ImposterDemo } from "../components/demos/ImposterDemo";

export function ImposterPage({ sessionId }: { sessionId: string }) {
  const isMobile = useIsMobile();
  if (isMobile) return <MobileImposterPage sessionId={sessionId} />;

  const zero = useZero();
  const navigate = useNavigate();
  const params = useParams();
  const gameId = params.id ?? "";
  const [games] = useQuery(queries.imposter.byId({ id: gameId }));
  const [sessions] = useQuery(queries.sessions.byGame({ gameType: "imposter", gameId }));
  useQuery(queries.sessions.byId({ id: sessionId }));
  const game = games[0];
  const [clue, setClue] = useState("");
  const [showDemo, setShowDemo] = useState(false);
  const [voteTarget, setVoteTarget] = useState("");
  const prevAnnouncementRef = useRef<{ text: string; ts: number } | null>(null);

  usePresenceSocket({ sessionId, gameId, gameType: "imposter" });

  const isHost = game?.host_id === sessionId;
  const me = useMemo(() => game?.players.find((p) => p.sessionId === sessionId), [game, sessionId]);
  const inGame = Boolean(me);

  // Keep refs current so the unmount cleanup reads fresh values
  const inGameRef = useRef(inGame);
  const phaseRef = useRef(game?.phase);
  inGameRef.current = inGame;
  phaseRef.current = game?.phase;

  // When the host navigates away (unmount), call the leave mutator so the
  // game ends for everyone.  A 500ms guard prevents React StrictMode's
  // double-mount from accidentally triggering the leave.
  useEffect(() => {
    let active = false;
    const timer = setTimeout(() => { active = true; }, 500);
    return () => {
      clearTimeout(timer);
      if (active && inGameRef.current && phaseRef.current !== "ended") {
        void zero.mutate(mutators.imposter.leave({ gameId, sessionId }));
      }
    };
  }, [gameId, sessionId, zero]);

  const sessionById = useMemo(() => {
    return sessions.reduce<Record<string, string>>((acc, s) => {
      acc[s.id] = s.name ?? s.id.slice(0, 6);
      return acc;
    }, {});
  }, [sessions]);

  const tally = useMemo(() => {
    if (!game) return {} as Record<string, number>;
    return game.votes.reduce<Record<string, number>>((acc, v) => {
      acc[v.targetId] = (acc[v.targetId] ?? 0) + 1;
      return acc;
    }, {});
  }, [game]);

  useEffect(() => {
    if (!game) return;
    addRecentGame({ id: game.id, code: game.code, gameType: "imposter" });
  }, [game]);

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

  // Timer auto-advance
  useEffect(() => {
    if (!game) return;
    const phaseEnd = game.settings.phaseEndsAt;
    if (!phaseEnd || (game.phase !== "playing" && game.phase !== "voting" && game.phase !== "results")) return;
    const remaining = phaseEnd - Date.now();
    if (remaining <= 0) {
      void zero.mutate(mutators.imposter.advanceTimer({ gameId }));
      return;
    }
    const timer = setTimeout(() => {
      void zero.mutate(mutators.imposter.advanceTimer({ gameId }));
    }, remaining + 500);
    return () => clearTimeout(timer);
  }, [game?.settings.phaseEndsAt, game?.phase, gameId, zero]);

  // Announcement watcher (skip for host — they sent it)
  useEffect(() => {
    if (!game?.announcement || isHost) return;
    const prev = prevAnnouncementRef.current;
    const cur = game.announcement;
    if (prev && prev.text === cur.text && Math.abs(cur.ts - prev.ts) < 3000) return;
    prevAnnouncementRef.current = cur;
    showToast(`📢 ${cur.text}`, "info");
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

  const submitClue = async (event: FormEvent) => {
    event.preventDefault();
    if (!clue.trim()) return;
    await zero.mutate(mutators.imposter.submitClue({ gameId, sessionId, text: clue.trim() })).server;
    setClue("");
  };

  const submitVote = async () => {
    if (!voteTarget) return;
    await zero.mutate(mutators.imposter.submitVote({ gameId, voterId: sessionId, targetId: voteTarget })).server;
  };


  return (
    <div className="game-page" data-game-theme="imposter">
      <ImposterHeader
        code={game.code}
        phase={game.phase}
        currentRound={game.settings.currentRound}
        totalRounds={game.settings.rounds}
        phaseEndsAt={game.settings.phaseEndsAt}
        isHost={isHost}
      />

      <ImposterPlayersCard
        players={game.players}
        sessionId={sessionId}
        sessionById={sessionById}
        revealRoles={game.phase === "results" || game.phase === "finished"}
      />

      {game.phase === "lobby" && !inGame && (
        <div className="game-section game-join-prompt">
          <p className="game-join-text">You're not in this lobby yet.</p>
          <button
            className="btn btn-primary game-action-btn"
            onClick={() =>
              void zero.mutate(mutators.imposter.join({ gameId, sessionId }))
                .client.catch(() => showToast("Couldn't join game", "error"))
            }
          >
            <FiLogIn size={16} /> Join Game
          </button>
        </div>
      )}

      {game.phase === "lobby" && inGame && (
        <ImposterLobbyActions
          canStart={Boolean(isHost && game.players.length >= 3)}
          isHost={Boolean(isHost)}
          playerCount={game.players.length}
          onStart={() => void zero.mutate(mutators.imposter.start({ gameId, hostId: sessionId }))}
          onLeave={() => void zero.mutate(mutators.imposter.leave({ gameId, sessionId }))}
        />
      )}

      {game.phase === "lobby" && (
        <div className="game-section" style={{ textAlign: "center" }}>
          <button className="demo-trigger-btn" onClick={() => setShowDemo(true)}>
            <FiHelpCircle size={16} /> How to Play
          </button>
        </div>
      )}

      {game.phase === "playing" && inGame && (
        <ImposterClueSection
          role={me?.role}
          secretWord={game.secret_word}
          category={game.category ?? null}
          clue={clue}
          clueCount={game.clues.length}
          playerCount={game.players.length}
          submitted={game.clues.some((c) => c.sessionId === sessionId)}
          clues={game.clues}
          sessionId={sessionId}
          sessionById={sessionById}
          onClueChange={setClue}
          onSubmit={submitClue}
        />
      )}

      {game.phase === "playing" && !inGame && (
        <div className="game-section">
          <div className="game-waiting">
            <div className="game-waiting-pulse" />
            <p>Players are submitting clues… ({game.clues.length}/{game.players.length})</p>
          </div>
        </div>
      )}

      {game.phase === "voting" && inGame && (
        <ImposterVoteSection
          players={game.players}
          sessionId={sessionId}
          sessionById={sessionById}
          voteTarget={voteTarget}
          voteCount={game.votes.length}
          playerCount={game.players.length}
          clues={game.clues}
          submitted={game.votes.some((v) => v.voterId === sessionId)}
          onVoteTargetChange={setVoteTarget}
          onSubmit={() => void submitVote()}
        />
      )}

      {game.phase === "voting" && !inGame && (
        <div className="game-section">
          <div className="game-waiting">
            <div className="game-waiting-pulse" />
            <p>Players are voting… ({game.votes.length}/{game.players.length})</p>
          </div>
        </div>
      )}

      {game.phase === "results" && (
        <ImposterResultsSection
          tally={tally}
          votes={game.votes}
          players={game.players}
          sessionById={sessionById}
          secretWord={game.secret_word}
          phaseEndsAt={game.settings.phaseEndsAt}
        />
      )}

      {game.phase === "finished" && (
        <div className="game-section">
          <div className="game-reveal-card game-reveal-card--success">
            <p className="game-reveal-title">Game Complete!</p>
            <p className="game-reveal-sub">{game.settings.rounds} rounds played</p>
          </div>

          {(game.round_history ?? []).length > 0 && (
            <>
              <h3 className="game-section-label">Round Summary</h3>
              <div className="panel overflow-x-auto">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Word</th>
                      <th>Imposters</th>
                      <th>Result</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(game.round_history ?? []).map((rh) => (
                      <tr key={rh.round}>
                        <td>{rh.round}</td>
                        <td style={{ color: "var(--primary)", fontWeight: 600 }}>{rh.secretWord ?? "—"}</td>
                        <td>{rh.imposters.map((id) => sessionById[id] ?? id.slice(0, 6)).join(", ")}</td>
                        <td style={{ color: rh.caught ? "#4ade80" : "#f87171" }}>
                          {rh.caught ? "Caught" : "Escaped"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          <div className="game-actions">
            {isHost ? (
              <>
                <button
                  className="btn btn-primary game-action-btn"
                  onClick={() => void zero.mutate(mutators.imposter.resetToLobby({ gameId, hostId: sessionId }))}
                >
                  Play Again
                </button>
                <button
                  className="btn btn-muted"
                  onClick={() => {
                    void zero.mutate(mutators.imposter.endGame({ gameId, hostId: sessionId }));
                    navigate("/");
                  }}
                >
                  End Game
                </button>
              </>
            ) : (
              <button className="btn btn-muted game-action-btn" onClick={() => navigate("/")}>
                Back to Home
              </button>
            )}
          </div>
        </div>
      )}
      {showDemo && <ImposterDemo onClose={() => setShowDemo(false)} />}
    </div>
  );
}
