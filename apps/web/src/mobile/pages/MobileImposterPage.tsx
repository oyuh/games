import { mutators, queries } from "@games/shared";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { FiLogIn, FiEye, FiEyeOff, FiSend, FiCheck, FiArrowRight, FiClock } from "react-icons/fi";
import { usePresenceSocket } from "../../hooks/usePresenceSocket";
import { addRecentGame } from "../../lib/session";
import { showToast } from "../../lib/toast";
import { useMobileHostRegister } from "../../lib/mobile-host-context";
import { MobileGameHeader } from "../components/MobileGameHeader";
import { MobileGameNotFound } from "../components/MobileGameNotFound";

export function MobileImposterPage({ sessionId }: { sessionId: string }) {
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
  const prevAnnouncementRef = useRef<{ text: string; ts: number } | null>(null);

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

  useMobileHostRegister(
    isHost && game
      ? { type: "imposter", gameId, hostId: game.host_id, players: game.players.map((p) => ({ sessionId: p.sessionId, name: sessionById[p.sessionId] ?? null })) }
      : null
  );

  const inGameRef = useRef(inGame);
  const phaseRef = useRef(game?.phase);
  inGameRef.current = inGame;
  phaseRef.current = game?.phase;

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

  const tally = useMemo(() => {
    if (!game) return {} as Record<string, number>;
    return game.votes.reduce<Record<string, number>>((acc, v) => {
      acc[v.targetId] = (acc[v.targetId] ?? 0) + 1;
      return acc;
    }, {});
  }, [game]);

  // Countdown timer for timed phases
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  useEffect(() => {
    const endsAt = game?.settings.phaseEndsAt;
    if (!endsAt) { setTimeLeft(null); return; }
    const tick = () => setTimeLeft(Math.max(0, Math.floor((endsAt - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [game?.settings.phaseEndsAt]);

  useEffect(() => {
    if (!game) return;
    addRecentGame({ id: game.id, code: game.code, gameType: "imposter" });
  }, [game]);

  useEffect(() => {
    if (!game) return;
    if (game.phase === "ended") { showToast("The host ended the game", "info"); navigate("/"); return; }
    if (game.kicked.includes(sessionId)) { showToast("You were kicked from the game", "error"); navigate("/"); }
  }, [game?.phase, game?.kicked, sessionId, navigate]);

  useEffect(() => {
    if (!game) return;
    const phaseEnd = game.settings.phaseEndsAt;
    if (!phaseEnd || (game.phase !== "playing" && game.phase !== "voting")) return;
    const remaining = phaseEnd - Date.now();
    if (remaining <= 0) { void zero.mutate(mutators.imposter.advanceTimer({ gameId })); return; }
    const timer = setTimeout(() => { void zero.mutate(mutators.imposter.advanceTimer({ gameId })); }, remaining + 500);
    return () => clearTimeout(timer);
  }, [game?.settings.phaseEndsAt, game?.phase, gameId, zero]);

  useEffect(() => {
    if (!game?.announcement || isHost) return;
    const prev = prevAnnouncementRef.current;
    const cur = game.announcement;
    if (prev && prev.text === cur.text && Math.abs(cur.ts - prev.ts) < 3000) return;
    prevAnnouncementRef.current = cur;
    showToast(`📢 ${cur.text}`, "info");
  }, [game?.announcement, isHost]);

  if (!game) return <MobileGameNotFound theme="imposter" />;

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
  const revealRoles = game.phase === "results" || game.phase === "finished";

  return (
    <div className="m-page" data-game-theme="imposter">
      <MobileGameHeader
        code={game.code}
        gameLabel="Imposter"
        phase={game.phase}
        round={game.settings.currentRound}
        totalRounds={game.settings.rounds}
        accent="var(--game-accent)"
      >
        {timeLeft != null && (
          <span className={`m-badge${timeLeft <= 10 ? " m-badge--danger" : " m-badge--warn"}`}>
            <FiClock size={10} /> {String(Math.floor(timeLeft / 60)).padStart(2, "0")}:{String(timeLeft % 60).padStart(2, "0")}
          </span>
        )}
      </MobileGameHeader>

      {/* Players */}
      <div className="m-card">
        <h3 className="m-card-title">Players</h3>
        <div className="m-player-chips">
          {game.players.map((p) => {
            const name = sessionById[p.sessionId] ?? p.sessionId.slice(0, 6);
            const isImposter = revealRoles && p.role === "imposter";
            const isMe = p.sessionId === sessionId;
            return (
              <div
                key={p.sessionId}
                className={`m-player-chip${isImposter ? " m-player-chip--danger" : ""}${isMe ? " m-player-chip--me" : ""}`}
              >
                <span className="m-player-avatar">{(name[0] ?? "?").toUpperCase()}</span>
                <span>{name}</span>
                {isImposter && <span className="m-badge m-badge--danger" style={{ fontSize: "0.6rem" }}>IMP</span>}
              </div>
            );
          })}
        </div>
      </div>

      {/* Lobby: Join prompt */}
      {game.phase === "lobby" && !inGame && (
        <div className="m-card" style={{ textAlign: "center" }}>
          <p style={{ marginBottom: "0.75rem", opacity: 0.7 }}>You're not in this lobby yet.</p>
          <button
            className="m-btn m-btn-primary"
            style={{ width: "100%" }}
            onClick={() =>
              void zero.mutate(mutators.imposter.join({ gameId, sessionId }))
                .client.catch(() => showToast("Couldn't join game", "error"))
            }
          >
            <FiLogIn size={16} /> Join Game
          </button>
        </div>
      )}

      {/* Lobby: Actions */}
      {game.phase === "lobby" && inGame && (
        <div className="m-card">
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {isHost && game.players.length >= 3 && (
              <button
                className="m-btn m-btn-primary"
                style={{ width: "100%" }}
                onClick={() => void zero.mutate(mutators.imposter.start({ gameId, hostId: sessionId }))}
              >
                Start Game
              </button>
            )}
            {isHost && game.players.length < 3 && (
              <p style={{ textAlign: "center", opacity: 0.6, fontSize: "0.85rem" }}>Need at least 3 players to start</p>
            )}
            <button
              className="m-btn m-btn-muted"
              style={{ width: "100%" }}
              onClick={() => void zero.mutate(mutators.imposter.leave({ gameId, sessionId }))}
            >
              Leave Game
            </button>
          </div>
        </div>
      )}

      {/* Playing: Clue section */}
      {game.phase === "playing" && inGame && (
        <div className="m-card">
          <div className={`m-role-card${me?.role === "imposter" ? " m-role-card--danger" : ""}`}>
            <div className="m-role-icon">
              {me?.role === "imposter" ? <FiEyeOff size={22} /> : <FiEye size={22} />}
            </div>
            <div>
              <p className="m-role-title">
                {me?.role === "imposter" ? "You are the Imposter" : "You are a Player"}
              </p>
              {me?.role !== "imposter" && game.secret_word && (
                <p className="m-role-word">Secret word: <strong>{game.secret_word}</strong></p>
              )}
              {me?.role === "imposter" && (
                <p className="m-role-hint">Blend in! Give a believable clue.</p>
              )}
            </div>
          </div>

          <form className="m-input-row" onSubmit={submitClue} style={{ marginTop: "0.75rem" }}>
            <input
              className="m-input"
              style={{ flex: 1 }}
              value={clue}
              onChange={(e) => setClue(e.target.value)}
              placeholder={me?.role === "imposter" ? "Give a vague clue…" : "Clue about the word…"}
              maxLength={80}
            />
            <button type="submit" className="m-btn m-btn-primary" disabled={!clue.trim()}>
              <FiSend size={14} />
            </button>
          </form>

          <p className="m-progress-text">Clues: {game.clues.length} / {game.players.length}</p>
        </div>
      )}

      {/* Playing: Waiting (spectator) */}
      {game.phase === "playing" && !inGame && (
        <div className="m-card">
          <div className="m-waiting">
            <div className="m-waiting-pulse" />
            <p>Players are submitting clues… ({game.clues.length}/{game.players.length})</p>
          </div>
        </div>
      )}

      {/* Voting */}
      {game.phase === "voting" && inGame && (
        <div className="m-card">
          <h3 className="m-card-title">Who is the imposter?</h3>

          {/* Clue recap */}
          <div className="m-clue-recap">
            {game.players.map((p) => {
              const name = sessionById[p.sessionId] ?? p.sessionId.slice(0, 6);
              const clueText = game.clues.find(c => c.sessionId === p.sessionId)?.text;
              return (
                <div key={p.sessionId} className="m-clue-item">
                  <span className="m-clue-name">{name}</span>
                  <span className="m-clue-text">{clueText ?? "—"}</span>
                </div>
              );
            })}
          </div>

          {/* Vote grid */}
          <div className="m-vote-grid">
            {game.players
              .filter((p) => p.sessionId !== sessionId)
              .map((p) => {
                const name = sessionById[p.sessionId] ?? p.sessionId.slice(0, 6);
                const selected = voteTarget === p.sessionId;
                return (
                  <button
                    key={p.sessionId}
                    className={`m-vote-card${selected ? " m-vote-card--selected" : ""}`}
                    onClick={() => setVoteTarget(p.sessionId)}
                  >
                    <span className="m-player-avatar">{(name[0] ?? "?").toUpperCase()}</span>
                    <span>{name}</span>
                    {selected && <FiCheck size={14} />}
                  </button>
                );
              })}
          </div>

          <button
            className="m-btn m-btn-primary"
            style={{ width: "100%", marginTop: "0.75rem" }}
            onClick={() => void submitVote()}
            disabled={!voteTarget}
          >
            Submit Vote
          </button>

          <p className="m-progress-text">Votes: {game.votes.length} / {game.players.length}</p>
        </div>
      )}

      {/* Voting: Waiting (spectator) */}
      {game.phase === "voting" && !inGame && (
        <div className="m-card">
          <div className="m-waiting">
            <div className="m-waiting-pulse" />
            <p>Players are voting… ({game.votes.length}/{game.players.length})</p>
          </div>
        </div>
      )}

      {/* Results */}
      {game.phase === "results" && (() => {
        const maxVotes = Math.max(...Object.values(tally), 1);
        const imposters = game.players.filter((p) => p.role === "imposter");
        const imposterNames = imposters.map((p) => sessionById[p.sessionId] ?? p.sessionId.slice(0, 6));
        const topVoteCount = Math.max(...Object.values(tally), 0);
        const topVoted = new Set(Object.entries(tally).filter(([, c]) => c === topVoteCount && topVoteCount > 0).map(([id]) => id));
        const caught = imposters.length > 0 && imposters.some((p) => topVoted.has(p.sessionId));

        return (
          <>
            <div className={`m-card ${caught ? "m-card--success" : "m-card--danger"}`}>
              <h3 className="m-reveal-title">
                {caught ? "Imposter Caught!" : "Imposter Got Away!"}
              </h3>
              {imposterNames.length > 0 && (
                <p className="m-reveal-sub">
                  The imposter was <strong>{imposterNames.join(", ")}</strong>
                </p>
              )}
              {game.secret_word && (
                <p className="m-reveal-word">The word was: <strong>{game.secret_word}</strong></p>
              )}
            </div>

            <div className="m-card">
              <h3 className="m-card-title">Vote Results</h3>
              <div className="m-results-list">
                {game.players.map((p) => {
                  const name = sessionById[p.sessionId] ?? p.sessionId.slice(0, 6);
                  const votes = tally[p.sessionId] ?? 0;
                  const pct = maxVotes > 0 ? (votes / maxVotes) * 100 : 0;
                  const isImp = p.role === "imposter";
                  return (
                    <div key={p.sessionId} className="m-result-row">
                      <div className="m-result-info">
                        <span className={isImp ? "m-result-name--danger" : ""}>{name} {isImp ? "(imp)" : ""}</span>
                        <span className="m-result-votes">{votes}</span>
                      </div>
                      <div className="m-result-bar-track">
                        <div className={`m-result-bar${isImp ? " m-result-bar--danger" : ""}`} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="m-card">
              {isHost ? (
                <button
                  className="m-btn m-btn-primary"
                  style={{ width: "100%" }}
                  onClick={() => void zero.mutate(mutators.imposter.nextRound({ gameId, hostId: sessionId }))}
                >
                  <FiArrowRight size={16} /> {isLastRound ? "View Summary" : "Next Round"}
                </button>
              ) : (
                <p className="m-waiting-text">Waiting for host to continue…</p>
              )}
            </div>
          </>
        );
      })()}

      {/* Finished */}
      {game.phase === "finished" && (
        <>
          <div className="m-card m-card--success">
            <h3 className="m-reveal-title">Game Complete!</h3>
            <p className="m-reveal-sub">{game.settings.rounds} rounds played</p>
          </div>

          {(game.round_history ?? []).length > 0 && (
            <div className="m-card">
              <h3 className="m-card-title">Round Summary</h3>
              <div className="m-data-table-wrap">
                <table className="m-data-table">
                  <thead>
                    <tr><th>#</th><th>Word</th><th>Imposters</th><th>Result</th></tr>
                  </thead>
                  <tbody>
                    {(game.round_history ?? []).map((rh) => (
                      <tr key={rh.round}>
                        <td>{rh.round}</td>
                        <td style={{ color: "var(--primary)", fontWeight: 600 }}>{rh.secretWord ?? "—"}</td>
                        <td>{rh.imposters.map((id) => sessionById[id] ?? id.slice(0, 6)).join(", ")}</td>
                        <td style={{ color: rh.caught ? "#4ade80" : "#f87171" }}>{rh.caught ? "Caught" : "Escaped"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="m-card">
            {isHost ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                <button
                  className="m-btn m-btn-primary"
                  style={{ width: "100%" }}
                  onClick={() => void zero.mutate(mutators.imposter.resetToLobby({ gameId, hostId: sessionId }))}
                >
                  Play Again
                </button>
                <button
                  className="m-btn m-btn-muted"
                  style={{ width: "100%" }}
                  onClick={() => { void zero.mutate(mutators.imposter.endGame({ gameId, hostId: sessionId })); navigate("/"); }}
                >
                  End Game
                </button>
              </div>
            ) : (
              <button className="m-btn m-btn-muted" style={{ width: "100%" }} onClick={() => navigate("/")}>
                Back to Home
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
