import { imposterCategoryLabels, mutators, queries } from "@games/shared";
import { useQuery, useZero } from "../../lib/zero";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { FiLogIn, FiEye, FiEyeOff, FiSend, FiCheck, FiArrowRight, FiClock } from "react-icons/fi";
import { usePresenceSocket } from "../../hooks/usePresenceSocket";
import { addRecentGame, ensureName, leaveCurrentGame, SessionGameType } from "../../lib/session";
import { showToast } from "../../lib/toast";
import { useMobileHostRegister } from "../../lib/mobile-host-context";
import { BorringAvatar } from "../../components/shared/BorringAvatar";
import { InSessionModal } from "../../components/shared/InSessionModal";
import { MobileGameHeader } from "../components/MobileGameHeader";
import { MobileSpectatorBadge } from "../../components/shared/SpectatorBadge";
import { MobileSpectatorOverlay } from "../../components/shared/SpectatorOverlay";
import { RoundCountdown } from "../../components/shared/RoundCountdown";
import { MobileGameNotFound } from "../components/MobileGameNotFound";

/** Redact a clue showing a contiguous ~65% chunk of each word. */
function redactClue(text: string): string {
  return text.split(" ").map((word) => {
    const len = word.length;
    if (len <= 2) return "_".repeat(len);
    const showCount = Math.max(1, Math.floor(len * 0.65));
    const start = Math.floor(len * 0.2);
    return word.split("").map((ch, i) =>
      i >= start && i < start + showCount ? ch : "_"
    ).join("");
  }).join(" ");
}

export function MobileImposterPage({ sessionId }: { sessionId: string }) {
  const zero = useZero();
  const navigate = useNavigate();
  const params = useParams();
  const gameId = params.id ?? "";
  const [games] = useQuery(queries.imposter.byId({ id: gameId }));
  const [sessions] = useQuery(queries.sessions.byGame({ gameType: "imposter", gameId }));
  const [mySessionRows] = useQuery(queries.sessions.byId({ id: sessionId }));
  const game = games[0];
  const [clue, setClue] = useState("");
  const [voteTarget, setVoteTarget] = useState("");
  const [showInSessionModal, setShowInSessionModal] = useState(false);
  const [joiningFromOtherGame, setJoiningFromOtherGame] = useState(false);
  const prevAnnouncementRef = useRef<{ text: string; ts: number } | null>(null);

  usePresenceSocket({ sessionId, gameId, gameType: "imposter" });

  const isHost = game?.host_id === sessionId;
  const me = useMemo(() => game?.players.find((p) => p.sessionId === sessionId), [game, sessionId]);
  const inGame = Boolean(me);
  const isSpectator = useMemo(() => game?.spectators?.some((s) => s.sessionId === sessionId) ?? false, [game, sessionId]);
  const mySession = mySessionRows[0];
  const activeGameType = (mySession?.game_type ?? null) as SessionGameType | null;
  const activeGameId = mySession?.game_id ?? null;
  const inAnotherGame = Boolean(activeGameType && activeGameId && (activeGameType !== "imposter" || activeGameId !== gameId));

  const sessionById = useMemo(() => {
    return sessions.reduce<Record<string, string>>((acc, s) => {
      acc[s.id] = s.name ?? s.id.slice(0, 6);
      return acc;
    }, {});
  }, [sessions]);

  useMobileHostRegister(
    isHost && game
      ? { type: "imposter", gameId, hostId: game.host_id, players: game.players.map((p) => ({ sessionId: p.sessionId, name: sessionById[p.sessionId] ?? null })), spectators: game.spectators ?? [] }
      : null
  );

  const inGameRef = useRef(inGame);
  const phaseRef = useRef(game?.phase);
  const isSpectatorRef = useRef(isSpectator);
  inGameRef.current = inGame;
  phaseRef.current = game?.phase;
  isSpectatorRef.current = isSpectator;

  useEffect(() => {
    if (isSpectator) {
      showToast("You are a spectator", "info");
    }
  }, [isSpectator]);

  useEffect(() => {
    let active = false;
    const timer = setTimeout(() => { active = true; }, 500);
    return () => {
      clearTimeout(timer);
      if (active && isSpectatorRef.current) {
        void zero.mutate(mutators.imposter.leaveSpectator({ gameId, sessionId }));
      } else if (active && inGameRef.current && phaseRef.current !== "ended") {
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
    if (!phaseEnd || (game.phase !== "playing" && game.phase !== "voting" && game.phase !== "results")) return;
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

  const joinGame = () => {
    ensureName(zero, sessionId);
    if (isSpectator) {
      void zero.mutate(mutators.imposter.leaveSpectator({ gameId, sessionId }))
        .client.then(() => zero.mutate(mutators.imposter.join({ gameId, sessionId })))
        .catch(() => showToast("Couldn't join game", "error"));
      return;
    }
    void zero.mutate(mutators.imposter.join({ gameId, sessionId }))
      .client.catch(() => showToast("Couldn't join game", "error"));
  };

  const handleJoinClick = () => {
    if (inAnotherGame && activeGameType && activeGameId) {
      setJoiningFromOtherGame(true);
      void leaveCurrentGame(zero, sessionId, activeGameType, activeGameId)
        .catch(() => showToast("Couldn't leave current game", "error"))
        .finally(() => {
          setJoiningFromOtherGame(false);
          joinGame();
        });
      return;
    }
    joinGame();
  };

  const confirmLeaveAndJoin = () => {
    if (!activeGameType || !activeGameId) {
      setShowInSessionModal(false);
      joinGame();
      return;
    }
    setJoiningFromOtherGame(true);
    void leaveCurrentGame(zero, sessionId, activeGameType, activeGameId)
      .then(() => {
        setShowInSessionModal(false);
        joinGame();
      })
      .catch(() => showToast("Couldn't leave current game", "error"))
      .finally(() => setJoiningFromOtherGame(false));
  };

  const revealRoles = game.phase === "finished";
  // During results, only reveal the voted-out player's role
  const mobileVotedOutId = game.phase === "results" ? (() => {
    const t = game.votes.reduce<Record<string, number>>((acc, v) => { acc[v.targetId] = (acc[v.targetId] ?? 0) + 1; return acc; }, {});
    const max = Math.max(...Object.values(t), 0);
    const top = Object.entries(t).filter(([, c]) => c === max && max > 0).map(([id]) => id);
    return top[0] ?? null;
  })() : null;

  return (
    <div className="m-page" data-game-theme="imposter">
      <MobileGameHeader
        code={game.code}
        gameLabel="Imposter"
        phase={game.phase}
        round={game.settings.currentRound}
        totalRounds={game.settings.rounds}
        accent="var(--game-accent)"
        category={game.category}
      >
        {isSpectator && <MobileSpectatorBadge />}
        {timeLeft != null && (
          <span className={`m-badge${timeLeft <= 10 ? " m-badge--danger" : " m-badge--warn"}`}>
            <FiClock size={10} /> {String(Math.floor(timeLeft / 60)).padStart(2, "0")}:{String(timeLeft % 60).padStart(2, "0")}
          </span>
        )}
      </MobileGameHeader>

      {/* Players */}
      <div className="m-card">
        <h3 className="m-card-title">Players <span style={{ opacity: 0.5, fontWeight: 400 }}>{game.players.filter((p) => !p.eliminated).length}/{game.players.length}</span></h3>
        <div className="m-player-chips">
          {game.players.map((p, playerIndex) => {
            const name = sessionById[p.sessionId] ?? p.sessionId.slice(0, 6);
            const showRole = revealRoles || p.sessionId === mobileVotedOutId;
            const isImposter = showRole && p.role === "imposter";
            const isMe = p.sessionId === sessionId;
            const isEliminated = Boolean(p.eliminated);
            return (
              <div
                key={p.sessionId}
                className={`m-player-chip${isImposter ? " m-player-chip--danger" : ""}${isMe ? " m-player-chip--me" : ""}${isEliminated ? " m-player-chip--eliminated" : ""}`}
                style={isEliminated ? { opacity: 0.45, textDecoration: "line-through" } : undefined}
              >
                <span className="m-player-avatar">{isEliminated ? "☠" : (
                  <BorringAvatar
                    seed={p.sessionId}
                    playerIndex={playerIndex}
                  />
                )}</span>
                <span>{name}</span>
                {isEliminated && <span className="m-badge m-badge--muted" style={{ fontSize: "0.6rem" }}>OUT</span>}
                {!isEliminated && isImposter && <span className="m-badge m-badge--danger" style={{ fontSize: "0.6rem" }}>IMP</span>}
                {!isEliminated && showRole && !isImposter && p.role && <span className="m-badge m-badge--success" style={{ fontSize: "0.6rem" }}>OK</span>}
              </div>
            );
          })}
        </div>
      </div>

      {/* Lobby: Join prompt */}
      {game.phase === "lobby" && !inGame && (
        <div className="m-card" style={{ textAlign: "center" }}>
          <p style={{ marginBottom: "0.75rem", opacity: 0.7 }}>{isSpectator ? "You're spectating. Join to play!" : "You're not in this lobby yet."}</p>
          <button
            className="m-btn m-btn-primary"
            style={{ width: "100%" }}
            onClick={handleJoinClick}
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
            {isHost && game.players.length === 3 && (
              <p style={{ textAlign: "center", opacity: 0.5, fontSize: "0.8rem" }}>4+ players recommended</p>
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

      {isSpectator && game.phase !== "lobby" && (
        <MobileSpectatorOverlay
          playerCount={game.players.filter((p) => !p.eliminated).length}
          phase={game.phase}
          onLeave={() => void zero.mutate(mutators.imposter.leaveSpectator({ gameId, sessionId })).client.then(() => navigate("/"))}
        />
      )}

      {/* Playing: Clue section */}
      {!isSpectator && game.phase === "playing" && inGame && !me?.eliminated && (() => {
        const isImposter = me?.role === "imposter";
        const hasSubmitted = game.clues.some((c) => c.sessionId === sessionId);
        const othersClues = game.clues.filter((c) => c.sessionId !== sessionId);

        return (
          <div className="m-card">
            {game.category && (
              <p style={{ fontSize: "0.75rem", color: "var(--secondary)", textAlign: "center", marginBottom: "0.4rem" }}>
                Category: <strong style={{ color: "var(--foreground)" }}>{imposterCategoryLabels[game.category] ?? game.category}</strong>
              </p>
            )}
            <div className={`m-role-card${isImposter ? " m-role-card--danger" : ""}`}>
              <div className="m-role-icon">
                {isImposter ? <FiEyeOff size={22} /> : <FiEye size={22} />}
              </div>
              <div>
                <p className="m-role-title">
                  {isImposter ? "You are the Imposter" : "You are a Player"}
                </p>
                {!isImposter && game.secret_word && (
                  <p className="m-role-word">Secret word: <strong>{game.secret_word}</strong></p>
                )}
                {isImposter && (
                  <p className="m-role-hint">Blend in! Give a believable clue.</p>
                )}
              </div>
            </div>

            {isImposter && othersClues.length > 0 && (
              <div style={{ marginTop: "0.5rem" }}>
                <p style={{ fontSize: "0.75rem", opacity: 0.6, marginBottom: "0.25rem" }}>Hints from other clues</p>
                <div className="m-clue-recap">
                  {othersClues.map((c) => {
                    const name = sessionById[c.sessionId] ?? c.sessionId.slice(0, 6);
                    return (
                      <div key={c.sessionId} className="m-clue-item">
                        <span className="m-clue-name">{name}</span>
                        <span className="m-clue-text" style={{ fontFamily: "monospace", letterSpacing: "0.1em" }}>
                          {redactClue(c.text)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {hasSubmitted ? (
              <div className="m-card m-card--success" style={{ marginTop: "0.75rem", padding: "0.75rem", textAlign: "center" }}>
                <p style={{ fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", gap: "0.4rem" }}>
                  <FiCheck size={16} /> Clue Submitted!
                </p>
                <p style={{ fontSize: "0.8rem", opacity: 0.7 }}>Waiting for other players…</p>
              </div>
            ) : (
              <form className="m-input-row" onSubmit={submitClue} style={{ marginTop: "0.75rem" }}>
                <input
                  className="m-input"
                  autoFocus
                  onFocus={(e) => e.currentTarget.select()}
                  style={{ flex: 1 }}
                  value={clue}
                  onChange={(e) => setClue(e.target.value)}
                  placeholder={isImposter ? "Give a vague clue…" : "Clue about the word…"}
                  maxLength={80}
                />
                <button type="submit" className="m-btn m-btn-primary" disabled={!clue.trim()}>
                  <FiSend size={14} />
                </button>
              </form>
            )}

            <p className="m-progress-text">Clues: {game.clues.length} / {game.players.filter((p) => !p.eliminated).length}</p>
          </div>
        );
      })()}

      {/* Playing: Waiting (spectator) */}
      {!isSpectator && game.phase === "playing" && (!inGame || me?.eliminated) && (
        <div className="m-card">
          <div className="m-waiting">
            <div className="m-waiting-pulse" />
            <p>{me?.eliminated ? "You've been eliminated. Spectating\u2026" : "Players are submitting clues\u2026"} ({game.clues.length}/{game.players.filter((p) => !p.eliminated).length})</p>
          </div>
        </div>
      )}

      {/* Voting */}
      {!isSpectator && game.phase === "voting" && inGame && !me?.eliminated && (() => {
        const hasVoted = game.votes.some((v) => v.voterId === sessionId);
        const votedName = voteTarget ? (sessionById[voteTarget] ?? voteTarget.slice(0, 6)) : null;
        const activePlayers = game.players.filter((p) => !p.eliminated);

        return (
          <div className="m-card">
            <h3 className="m-card-title">Who is the imposter?</h3>

            {/* Clue recap */}
            <div className="m-clue-recap">
              {activePlayers.map((p) => {
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

            {hasVoted ? (
              <div className="m-card m-card--success" style={{ marginTop: "0.75rem", padding: "0.75rem", textAlign: "center" }}>
                <p style={{ fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", gap: "0.4rem" }}>
                  <FiCheck size={16} /> Vote Submitted!
                </p>
                <p style={{ fontSize: "0.8rem", opacity: 0.7 }}>You voted for <strong>{votedName}</strong>. Waiting for others…</p>
              </div>
            ) : (
              <>
                {/* Vote grid */}
                <div className="m-vote-grid">
                  {activePlayers
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
                          <span className="m-player-avatar">
                            <BorringAvatar
                              seed={p.sessionId}
                              playerIndex={game.players.findIndex(pl => pl.sessionId === p.sessionId)}
                            />
                          </span>
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
              </>
            )}

            <p className="m-progress-text">Votes: {game.votes.length} / {activePlayers.length}</p>
          </div>
        );
      })()}

      {/* Voting: Waiting (spectator) */}
      {!isSpectator && game.phase === "voting" && (!inGame || me?.eliminated) && (
        <div className="m-card">
          <div className="m-waiting">
            <div className="m-waiting-pulse" />
            <p>{me?.eliminated ? "You've been eliminated. Spectating\u2026" : "Players are voting\u2026"} ({game.votes.length}/{game.players.filter((p) => !p.eliminated).length})</p>
          </div>
        </div>
      )}

      {/* Results */}
      {!isSpectator && game.phase === "results" && (() => {
        const activePlayers = game.players.filter((p) => !p.eliminated);
        const maxVotes = Math.max(...Object.values(tally), 1);
        const topVoteCount = Math.max(...Object.values(tally), 0);
        const topVoted = Object.entries(tally).filter(([, c]) => c === topVoteCount && topVoteCount > 0).map(([id]) => id);
        const votedOutId = topVoted.length > 0 ? topVoted[0] : null;
        const votedOutPlayer = votedOutId ? activePlayers.find((p) => p.sessionId === votedOutId) : null;
        const votedOutName = votedOutPlayer ? (sessionById[votedOutPlayer.sessionId] ?? votedOutPlayer.sessionId.slice(0, 6)) : null;
        const wasImposter = votedOutPlayer?.role === "imposter";

        return (
          <>
            <div className={`m-card ${wasImposter ? "m-card--success" : "m-card--danger"}`}>
              {votedOutName ? (
                <>
                  <h3 className="m-reveal-title">{votedOutName} was voted out!</h3>
                  <p className="m-reveal-sub">
                    They were {wasImposter
                      ? <strong style={{ color: "#f87171" }}>the Imposter!</strong>
                      : <strong style={{ color: "#4ade80" }}>innocent.</strong>}
                  </p>
                </>
              ) : (
                <>
                  <h3 className="m-reveal-title">No one was voted out!</h3>
                  <p className="m-reveal-sub">Not enough votes were cast.</p>
                </>
              )}
              {game.secret_word && (
                <p className="m-reveal-word">The word was: <strong>{game.secret_word}</strong></p>
              )}
            </div>

            <div className="m-card">
              <h3 className="m-card-title">Vote Results</h3>
              <div className="m-results-list">
                {activePlayers.map((p) => {
                  const name = sessionById[p.sessionId] ?? p.sessionId.slice(0, 6);
                  const voteCount = tally[p.sessionId] ?? 0;
                  const pct = maxVotes > 0 ? (voteCount / maxVotes) * 100 : 0;
                  const isVotedOut = p.sessionId === votedOutId;
                  const voterNames = game.votes
                    .filter((v) => v.targetId === p.sessionId)
                    .map((v) => sessionById[v.voterId] ?? v.voterId.slice(0, 6));
                  return (
                    <div key={p.sessionId} className="m-result-row">
                      <div className="m-result-info">
                        <span className={isVotedOut ? "m-result-name--danger" : ""}>{name} {isVotedOut ? "⬅ voted out" : ""}</span>
                        <span className="m-result-votes">{voteCount}</span>
                      </div>
                      <div className="m-result-bar-track">
                        <div className={`m-result-bar${isVotedOut ? " m-result-bar--danger" : ""}`} style={{ width: `${pct}%` }} />
                      </div>
                      {voterNames.length > 0 && (
                        <p className="m-result-voters" style={{ fontSize: "0.7rem", opacity: 0.7, margin: "0.15rem 0 0" }}>
                          Voted by: {voterNames.join(", ")}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="m-card" style={{ textAlign: "center" }}>
              <RoundCountdown endsAt={game.settings.phaseEndsAt} label="Next round" />
              <button
                className={`m-btn ${(game.settings.skipVotes ?? []).includes(sessionId) ? "m-btn-muted" : "m-btn-primary"}`}
                style={{ width: "100%", marginTop: "0.5rem" }}
                onClick={() => void zero.mutate(mutators.imposter.voteSkipResults({ gameId, sessionId }))}
                disabled={(game.settings.skipVotes ?? []).includes(sessionId)}
              >
                {(game.settings.skipVotes ?? []).includes(sessionId)
                  ? `Voted to Skip (${(game.settings.skipVotes ?? []).length}/${activePlayers.length})`
                  : `Skip (${(game.settings.skipVotes ?? []).length}/${activePlayers.length})`}
              </button>
            </div>
          </>
        );
      })()}

      {/* Finished */}
      {!isSpectator && game.phase === "finished" && (() => {
        const impostersLeft = game.players.filter((p) => p.role === "imposter" && !p.eliminated).length;
        const playersWin = impostersLeft === 0;
        const imposters = game.players.filter((p) => p.role === "imposter");
        const imposterNames = imposters.map((p) => sessionById[p.sessionId] ?? p.sessionId.slice(0, 6));

        return (
          <>
            <div className={`m-card ${playersWin ? "m-card--success" : "m-card--danger"}`}>
              <h3 className="m-reveal-title">{playersWin ? "Players Win!" : "Imposters Win!"}</h3>
              <p className="m-reveal-sub">
                {playersWin ? "All imposters have been found!" : "The imposters survived!"}
              </p>
              <p className="m-reveal-sub">
                {imposters.length > 1 ? "The imposters were " : "The imposter was "}
                <strong>{imposterNames.join(", ")}</strong>
              </p>
              {game.secret_word && (
                <p className="m-reveal-word">The word was: <strong>{game.secret_word}</strong></p>
              )}
            </div>

            {(game.round_history ?? []).length > 0 && (
              <div className="m-card">
                <h3 className="m-card-title">Round Summary</h3>
                <div className="m-data-table-wrap">
                  <table className="m-data-table">
                    <thead>
                      <tr><th>#</th><th>Word</th><th>Voted Out</th><th>Role</th></tr>
                    </thead>
                    <tbody>
                      {(game.round_history ?? []).map((rh) => (
                        <tr key={rh.round}>
                          <td>{rh.round}</td>
                          <td style={{ color: "var(--primary)", fontWeight: 600 }}>{rh.secretWord ?? "—"}</td>
                          <td style={{ fontWeight: 600 }}>{rh.votedOutName ?? "No one"}</td>
                          <td style={{ color: rh.wasImposter ? "#f87171" : "#4ade80", fontWeight: 600 }}>
                            {rh.votedOutName ? (rh.wasImposter ? "Imposter" : "Innocent") : "—"}
                          </td>
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
        );
      })()}

      {showInSessionModal && activeGameType && (
        <InSessionModal
          gameType={activeGameType}
          busy={joiningFromOtherGame}
          onCancel={() => setShowInSessionModal(false)}
          onConfirm={confirmLeaveAndJoin}
        />
      )}
    </div>
  );
}
