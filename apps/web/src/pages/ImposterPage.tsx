import { mutators, queries } from "@games/shared";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { FiLogIn } from "react-icons/fi";
import { ImposterClueSection } from "../components/imposter/ImposterClueSection";
import { ImposterHeader } from "../components/imposter/ImposterHeader";
import { ImposterLobbyActions } from "../components/imposter/ImposterLobbyActions";
import { ImposterPlayersCard } from "../components/imposter/ImposterPlayersCard";
import { ImposterResultsSection } from "../components/imposter/ImposterResultsSection";
import { ImposterVoteSection } from "../components/imposter/ImposterVoteSection";
import { ChatWindow } from "../components/shared/ChatWindow";
import { usePresenceSocket } from "../hooks/usePresenceSocket";
import { addRecentGame } from "../lib/session";
import { showToast } from "../lib/toast";

export function ImposterPage({ sessionId }: { sessionId: string }) {
  const zero = useZero();
  const navigate = useNavigate();
  const params = useParams();
  const gameId = params.id ?? "";
  const [games] = useQuery(queries.imposter.byId({ id: gameId }));
  const [sessions] = useQuery(queries.sessions.byGame({ gameType: "imposter", gameId }));
  useQuery(queries.sessions.byId({ id: sessionId }));
  const game = games[0];
  const [clue, setClue] = useState("");
  const [voteTarget, setVoteTarget] = useState("");
  const prevAnnouncementTs = useRef<number | null>(null);

  usePresenceSocket({ sessionId, gameId, gameType: "imposter" });

  const isHost = game?.host_id === sessionId;
  const me = useMemo(() => game?.players.find((p) => p.sessionId === sessionId), [game, sessionId]);
  const inGame = Boolean(me);

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
    if (!phaseEnd || (game.phase !== "playing" && game.phase !== "voting")) return;
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

  // Announcement watcher
  useEffect(() => {
    if (!game?.announcement) return;
    if (prevAnnouncementTs.current !== game.announcement.ts) {
      prevAnnouncementTs.current = game.announcement.ts;
      showToast(`📢 ${game.announcement.text}`, "info");
    }
  }, [game?.announcement]);

  if (!game) {
    return (
      <div className="game-page">
        <div className="game-empty"><p>Game not found</p></div>
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

  const isLastRound = game.settings.currentRound >= game.settings.rounds;

  return (
    <div className="game-page">
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

      {game.phase === "playing" && inGame && (
        <ImposterClueSection
          role={me?.role}
          secretWord={game.secret_word}
          clue={clue}
          clueCount={game.clues.length}
          playerCount={game.players.length}
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
          players={game.players}
          sessionById={sessionById}
          secretWord={game.secret_word}
          canAdvance={Boolean(isHost)}
          isLastRound={isLastRound}
          onNextRound={() => void zero.mutate(mutators.imposter.nextRound({ gameId, hostId: sessionId }))}
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
              <button
                className="btn btn-primary game-action-btn"
                onClick={() => void zero.mutate(mutators.imposter.resetToLobby({ gameId, hostId: sessionId }))}
              >
                Play Again
              </button>
            ) : (
              <button className="btn btn-muted game-action-btn" onClick={() => navigate("/")}>
                Back to Home
              </button>
            )}
          </div>
        </div>
      )}

      {/* In-game Chat */}
      {game && game.phase !== "ended" && (
        <ChatWindow
          gameType="imposter"
          gameId={gameId}
          hostId={game.host_id}
          myBadge={getChatBadge()}
          myName={sessionById[sessionId] ?? sessionId.slice(0, 6)}
        />
      )}
    </div>
  );

  function getChatBadge() {
    const parts: string[] = [];
    if (isHost) parts.push("Host");
    if (me?.role === "imposter" && (game?.phase === "results" || game?.phase === "finished")) parts.push("Imposter");
    else if (me?.role) parts.push(me.role.charAt(0).toUpperCase() + me.role.slice(1));
    return parts.join(" · ") || undefined;
  }
}
