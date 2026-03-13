import { mutators, queries, chainCategoryLabels } from "@games/shared";
import { useQuery, useZero } from "../../lib/zero";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { FiHelpCircle, FiLogIn, FiLogOut, FiPlay, FiSend, FiX, FiXCircle, FiEye } from "react-icons/fi";
import { MobileGameHeader } from "../components/MobileGameHeader";
import { MobileGameNotFound } from "../components/MobileGameNotFound";
import { InSessionModal } from "../../components/shared/InSessionModal";
import { MobileSpectatorBadge } from "../../components/shared/SpectatorBadge";
import { MobileSpectatorOverlay } from "../../components/shared/SpectatorOverlay";
import { usePresenceSocket } from "../../hooks/usePresenceSocket";
import { addRecentGame, ensureName, leaveCurrentGame, SessionGameType } from "../../lib/session";
import { showToast } from "../../lib/toast";

type ChainSlot = { word: string; revealed: boolean; lettersShown: number; solvedBy?: string | null };

export function MobileChainReactionPage({ sessionId }: { sessionId: string }) {
  const zero = useZero();
  const navigate = useNavigate();
  const params = useParams();
  const gameId = params.id ?? "";
  const [games] = useQuery(queries.chainReaction.byId({ id: gameId }));
  const [sessions] = useQuery(queries.sessions.byGame({ gameType: "chain_reaction", gameId }));
  const [mySessionRows] = useQuery(queries.sessions.byId({ id: sessionId }));
  const game = games[0];

  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [guess, setGuess] = useState("");
  const inlineInputRef = useRef<HTMLInputElement>(null);
  const prevAnnouncementRef = useRef<{ text: string; ts: number } | null>(null);

  const [submissionWords, setSubmissionWords] = useState<string[]>([]);
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [viewingId, setViewingId] = useState<string>(sessionId);
  const [giveUpConfirm, setGiveUpConfirm] = useState<number | null>(null);
  const [showInSessionModal, setShowInSessionModal] = useState(false);
  const [joiningFromOtherGame, setJoiningFromOtherGame] = useState(false);

  usePresenceSocket({ sessionId, gameId, gameType: "chain_reaction" });

  const isHost = game?.host_id === sessionId;
  const me = useMemo(() => game?.players.find((p) => p.sessionId === sessionId), [game, sessionId]);
  const inGame = Boolean(me);
  const isSpectator = useMemo(() => game?.spectators?.some((s) => s.sessionId === sessionId) ?? false, [game, sessionId]);
  const mySession = mySessionRows[0];
  const activeGameType = (mySession?.game_type ?? null) as SessionGameType | null;
  const activeGameId = mySession?.game_id ?? null;
  const inAnotherGame = Boolean(activeGameType && activeGameId && (activeGameType !== "chain_reaction" || activeGameId !== gameId));

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
        void zero.mutate(mutators.chainReaction.leaveSpectator({ gameId, sessionId }));
      } else if (active && inGameRef.current && phaseRef.current !== "ended") {
        void zero.mutate(mutators.chainReaction.leave({ gameId, sessionId }));
      }
    };
  }, [gameId, sessionId, zero]);

  const sessionById = useMemo(() => {
    return sessions.reduce<Record<string, string>>((acc, s) => {
      acc[s.id] = s.name ?? s.id.slice(0, 6);
      return acc;
    }, {});
  }, [sessions]);

  const playerName = (id: string) => sessionById[id] ?? id.slice(0, 6);
  const opponent = useMemo(() => game?.players.find((p) => p.sessionId !== sessionId), [game, sessionId]);

  useEffect(() => {
    if (!game) return;
    addRecentGame({ id: game.id, code: game.code, gameType: "chain_reaction" });
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

  useEffect(() => {
    if (!game?.announcement) return;
    const prev = prevAnnouncementRef.current;
    const cur = game.announcement;
    if (prev && prev.text === cur.text && Math.abs(cur.ts - prev.ts) < 3000) return;
    prevAnnouncementRef.current = cur;
    showToast(`📢 ${cur.text}`, "info");
  }, [game?.announcement]);

  useEffect(() => {
    setEditingIndex(null);
    setGuess("");
    setHasSubmitted(false);
    setViewingId(sessionId);
    setGiveUpConfirm(null);
  }, [game?.settings.currentRound, sessionId]);

  useEffect(() => {
    if (game?.phase === "submitting" && !hasSubmitted) {
      setSubmissionWords(Array.from({ length: game.settings.chainLength }, () => ""));
    }
  }, [game?.phase, game?.settings.chainLength, hasSubmitted]);

  useEffect(() => {
    if (game?.phase === "submitting" && game.submitted_chains[sessionId]) {
      setHasSubmitted(true);
    }
  }, [game?.phase, game?.submitted_chains, sessionId]);

  useEffect(() => {
    if (editingIndex !== null) {
      inlineInputRef.current?.focus();
      inlineInputRef.current?.select();
    }
  }, [editingIndex]);

  if (!game) return <MobileGameNotFound theme="chain" />;

  const myChain: ChainSlot[] = game.chain[sessionId] ?? [];
  const opponentId = opponent?.sessionId;
  const oppChain: ChainSlot[] = opponentId ? (game.chain[opponentId] ?? []) : [];
  const viewingChain = viewingId === sessionId ? myChain : oppChain;
  const isViewingMine = viewingId === sessionId;

  const myDone = myChain.length > 0 && myChain.every((s) => s.revealed);
  const oppDone = oppChain.length > 0 && oppChain.every((s) => s.revealed);

  const handleSlotClick = (i: number) => {
    if (!isViewingMine || myDone) return;
    const slot = myChain[i];
    if (!slot || slot.revealed) return;
    setEditingIndex(i);
    if (slot.lettersShown > 0) {
      setGuess(slot.word.slice(0, slot.lettersShown));
    } else {
      setGuess("");
    }
  };

  const handleInlineGuess = async (e: FormEvent) => {
    e.preventDefault();
    if (editingIndex === null || !guess.trim()) return;
    const idx = editingIndex;
    const currentGuess = guess.trim();
    setGuess("");
    setEditingIndex(null);
    try {
      await zero.mutate(mutators.chainReaction.guess({ gameId, sessionId, wordIndex: idx, guess: currentGuess })).server;
    } catch { /* noop */ }
  };

  const handleHint = async (i: number) => {
    if (editingIndex === i) { setEditingIndex(null); setGuess(""); }
    try {
      await zero.mutate(mutators.chainReaction.revealLetter({ gameId, sessionId, wordIndex: i })).server;
    } catch { /* noop */ }
  };

  const handleGiveUp = async (i: number) => {
    if (giveUpConfirm === i) {
      setGiveUpConfirm(null);
      try {
        await zero.mutate(mutators.chainReaction.giveUp({ gameId, sessionId, wordIndex: i })).server;
      } catch { /* noop */ }
    } else {
      setGiveUpConfirm(i);
    }
  };

  const submitChain = async (event: FormEvent) => {
    event.preventDefault();
    if (submissionWords.some((w) => !w.trim())) return;
    try {
      await zero.mutate(mutators.chainReaction.submitChain({ gameId, sessionId, words: submissionWords.map((w) => w.trim()) })).server;
      setHasSubmitted(true);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Submit failed", "error");
    }
  };

  const joinGame = () => {
    ensureName(zero, sessionId);
    void zero.mutate(mutators.chainReaction.join({ gameId, sessionId })).client.catch(() => showToast("Couldn't join", "error"));
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

  const myScore = game.scores[sessionId] ?? 0;
  const opponentScore = opponentId ? (game.scores[opponentId] ?? 0) : 0;
  const myName = playerName(sessionId);
  const oppName = opponentId ? playerName(opponentId) : "???";

  const myProgress = myChain.length > 0 ? myChain.filter((s) => s.revealed).length - 2 : 0;
  const myTotal = myChain.length > 0 ? myChain.length - 2 : 0;
  const oppProgress = oppChain.length > 0 ? oppChain.filter((s) => s.revealed).length - 2 : 0;
  const oppTotal = oppChain.length > 0 ? oppChain.length - 2 : 0;

  return (
    <div className="m-page" data-game-theme="chain">
      <MobileGameHeader
        gameLabel="Chain Reaction"
        code={game.code}
        phase={game.phase}
        {...(game.phase !== "lobby" ? { round: game.settings.currentRound } : {})}
        totalRounds={game.settings.rounds}
        accent="var(--game-accent)"
        category={game.settings.category ?? null}
      >
        {isSpectator && <MobileSpectatorBadge />}
      </MobileGameHeader>

      {/* ── VS Scoreboard ── */}
      {game.phase !== "lobby" && game.players.length === 2 && (
        <div className="m-cr-versus">
          <div
            className={`m-cr-vs-card${isViewingMine && game.phase === "playing" ? " m-cr-vs-card--active" : ""}${myDone ? " m-cr-vs-card--done" : ""}`}
            onClick={() => { setViewingId(sessionId); setEditingIndex(null); setGuess(""); }}
          >
            <div className="m-cr-vs-avatar">{(myName[0] ?? "?").toUpperCase()}</div>
            <div className="m-cr-vs-details">
              <span className="m-cr-vs-name">{myName}</span>
              <span className="m-cr-vs-score">{myScore}</span>
              {game.phase === "playing" && <span className="m-cr-vs-progress">{myProgress}/{myTotal}</span>}
            </div>
            {myDone && <span className="m-cr-done-badge">✓</span>}
          </div>

          <div className="m-cr-vs-middle">
            <span className="m-cr-vs-label">VS</span>
            <span className="m-cr-vs-round">R{game.settings.currentRound}/{game.settings.rounds}</span>
          </div>

          <div
            className={`m-cr-vs-card${!isViewingMine && game.phase === "playing" ? " m-cr-vs-card--active" : ""}${oppDone ? " m-cr-vs-card--done" : ""}`}
            onClick={() => { setViewingId(opponentId ?? sessionId); setEditingIndex(null); setGuess(""); }}
          >
            <div className="m-cr-vs-avatar m-cr-vs-avatar--opp">{(oppName[0] ?? "?").toUpperCase()}</div>
            <div className="m-cr-vs-details">
              <span className="m-cr-vs-name">{oppName}</span>
              <span className="m-cr-vs-score">{opponentScore}</span>
              {game.phase === "playing" && <span className="m-cr-vs-progress">{oppProgress}/{oppTotal}</span>}
            </div>
            {oppDone && <span className="m-cr-done-badge">✓</span>}
          </div>
        </div>
      )}

      {/* ── Lobby ── */}
      {game.phase === "lobby" && (
        <div className="m-section">
          <div className="m-cr-duel-slots">
            {game.players[0] ? (() => {
              const p = game.players[0];
              const isMe = p.sessionId === sessionId;
              const name = playerName(p.sessionId);
              return (
                <div className={`m-cr-slot${isMe ? " m-cr-slot--me" : ""}`}>
                  <div className="m-cr-slot-avatar">{(name[0] ?? "?").toUpperCase()}</div>
                  <span className="m-cr-slot-name">{name}</span>
                  {isMe && <span className="m-badge-small">you</span>}
                  {p.sessionId === game.host_id && <span className="m-badge-small m-badge-small--host">host</span>}
                  {isHost && !isMe && (
                    <button className="m-btn-icon m-btn-icon--danger"
                      onClick={() => void zero.mutate(mutators.chainReaction.kick({ gameId, hostId: sessionId, targetId: p.sessionId }))}>
                      <FiX size={14} />
                    </button>
                  )}
                </div>
              );
            })() : (
              <div className="m-cr-slot m-cr-slot--empty">
                <div className="m-cr-slot-avatar m-cr-slot-avatar--empty">?</div>
                <span className="m-cr-slot-empty-text">Waiting…</span>
              </div>
            )}

            <div className="m-cr-lobby-vs">VS</div>

            {game.players[1] ? (() => {
              const p = game.players[1];
              const isMe = p.sessionId === sessionId;
              const name = playerName(p.sessionId);
              return (
                <div className={`m-cr-slot${isMe ? " m-cr-slot--me" : ""}`}>
                  <div className="m-cr-slot-avatar m-cr-slot-avatar--opp">{(name[0] ?? "?").toUpperCase()}</div>
                  <span className="m-cr-slot-name">{name}</span>
                  {isMe && <span className="m-badge-small">you</span>}
                  {p.sessionId === game.host_id && <span className="m-badge-small m-badge-small--host">host</span>}
                  {isHost && !isMe && (
                    <button className="m-btn-icon m-btn-icon--danger"
                      onClick={() => void zero.mutate(mutators.chainReaction.kick({ gameId, hostId: sessionId, targetId: p.sessionId }))}>
                      <FiX size={14} />
                    </button>
                  )}
                </div>
              );
            })() : !inGame ? (
              <div className="m-cr-slot m-cr-slot--join"
                onClick={handleJoinClick}>
                <div className="m-cr-slot-avatar m-cr-slot-avatar--empty"><FiLogIn size={18} /></div>
                <span className="m-cr-slot-join-text">Join Duel</span>
              </div>
            ) : (
              <div className="m-cr-slot m-cr-slot--empty">
                <div className="m-cr-slot-avatar m-cr-slot-avatar--empty">?</div>
                <span className="m-cr-slot-empty-text">Awaiting challenger…</span>
              </div>
            )}
          </div>

          <p className="m-text-muted m-text-center">
            Mode: <strong>{game.settings.chainMode === "custom" ? "Custom Chains" : "Premade Chains"}</strong>
          </p>

          {inGame && (
            <div className="m-actions">
              {isHost ? (
                <button className="m-btn m-btn-primary" disabled={game.players.length !== 2}
                  onClick={() => void zero.mutate(mutators.chainReaction.start({ gameId, hostId: sessionId }))}>
                  <FiPlay size={16} /> Start Duel
                </button>
              ) : (
                <p className="m-text-muted m-text-center">Waiting for host to start…</p>
              )}
              <button className="m-btn m-btn-muted"
                onClick={() => void zero.mutate(mutators.chainReaction.leave({ gameId, sessionId }))}>
                <FiLogOut size={14} /> Leave
              </button>
            </div>
          )}
        </div>
      )}

      {isSpectator && game.phase !== "lobby" && (
        <MobileSpectatorOverlay
          playerCount={game.players.length}
          phase={game.phase}
          onLeave={() => void zero.mutate(mutators.chainReaction.leaveSpectator({ gameId, sessionId })).client.then(() => navigate("/"))}
        />
      )}

      {/* ── Submitting (custom mode) - not submitted ── */}
      {!isSpectator && game.phase === "submitting" && inGame && !hasSubmitted && (
        <div className="m-section">
          <div className="m-cr-submit-banner">
            <FiSend size={16} />
            <span>Write your chain — {game.settings.chainLength} connected words</span>
          </div>
          {game.settings.category && (
            <p style={{ textAlign: "center", margin: "0.25rem 0 0.5rem", fontSize: "0.82rem", color: "var(--secondary)" }}>
              Category: <strong style={{ color: "var(--primary)" }}>{chainCategoryLabels[game.settings.category] ?? game.settings.category}</strong>
            </p>
          )}

          <form onSubmit={submitChain}>
            <div className="m-cr-chain">
              {submissionWords.map((word, i) => {
                const isEdge = i === 0 || i === submissionWords.length - 1;
                return (
                  <div key={i} className="m-cr-submit-slot">
                    <span className="m-cr-slot-num">{i + 1}</span>
                    <input
                      className="m-input"
                      autoFocus={i === 0}
                      onFocus={(e) => e.currentTarget.select()}
                      value={word}
                      onChange={(e) => {
                        const next = [...submissionWords];
                        next[i] = e.target.value;
                        setSubmissionWords(next);
                      }}
                      placeholder={isEdge ? "Hint word (shown)" : "Hidden word"}
                      maxLength={30}
                    />
                    {isEdge && <span className="m-badge-small m-badge-small--accent">visible</span>}
                    {i < submissionWords.length - 1 && <div className="m-cr-connector" />}
                  </div>
                );
              })}
            </div>
            <div className="m-actions">
              <button type="submit" className="m-btn m-btn-primary"
                disabled={submissionWords.some((w) => !w.trim())}>
                <FiSend size={14} /> Lock In Chain
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ── Submitting - already submitted ── */}
      {!isSpectator && game.phase === "submitting" && inGame && hasSubmitted && (
        <div className="m-section">
          <div className="m-cr-done-banner">✅ Chain locked in!</div>
          {game.submitted_chains[sessionId] && (
            <div className="m-cr-preview">
              <h4 className="m-label">Your Chain</h4>
              <div className="m-cr-preview-words">
                {game.submitted_chains[sessionId].map((word, i, arr) => {
                  const isEdge = i === 0 || i === arr.length - 1;
                  return (
                    <div key={i} className={`m-cr-preview-word${isEdge ? " m-cr-preview-word--edge" : ""}`}>
                      <span className="m-cr-slot-num">{i + 1}</span>
                      <span>{word}</span>
                      {isEdge && <span className="m-badge-small">hint</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          <div className="m-cr-opponent-status">
            {game.submitted_chains[opponentId ?? ""] ? (
              <p className="m-text-success">✅ {oppName} has submitted — starting soon!</p>
            ) : (
              <div className="m-waiting">
                <div className="m-pulse" />
                <p>{oppName} is writing their chain…</p>
              </div>
            )}
          </div>
        </div>
      )}

      {!isSpectator && game.phase === "submitting" && !inGame && (
        <div className="m-section">
          <div className="m-waiting">
            <div className="m-pulse" />
            <p>Players are writing their chains…</p>
          </div>
        </div>
      )}

      {/* ── Playing ── */}
      {!isSpectator && game.phase === "playing" && inGame && (
        <div className="m-section">
          <div className="m-cr-view-indicator">
            {isViewingMine ? (
              myDone ? (
                <span className="m-text-success">✅ You finished! Tap {oppName}'s card to spectate</span>
              ) : (
                <span>Solve the chain — tap a word to guess!</span>
              )
            ) : (
              <span className="m-text-muted">
                <FiEye size={14} style={{ verticalAlign: "middle" }} /> Watching {oppName}'s progress
              </span>
            )}
          </div>

          <div className="m-cr-chain">
            {viewingChain.map((slot, i) => {
              const isEditing = isViewingMine && editingIndex === i;
              const isEdge = i === 0 || i === viewingChain.length - 1;
              const canClick = isViewingMine && !myDone && !slot.revealed && !isEditing;

              return (
                <div key={i} className="m-cr-slot-outer">
                  <div className="m-cr-slot-row">
                    <span className="m-cr-slot-num">{i + 1}</span>

                    <div
                      className={[
                        "m-cr-word-slot",
                        slot.revealed ? "m-cr-word-slot--revealed" : "m-cr-word-slot--hidden",
                        isEditing ? "m-cr-word-slot--editing" : "",
                        canClick ? "m-cr-word-slot--clickable" : "",
                        slot.solvedBy === sessionId ? "m-cr-word-slot--mine" : "",
                        slot.solvedBy && slot.solvedBy !== sessionId ? "m-cr-word-slot--theirs" : "",
                        slot.revealed && !slot.solvedBy && !isEdge ? "m-cr-word-slot--givenup" : "",
                      ].filter(Boolean).join(" ")}
                      onClick={() => canClick && handleSlotClick(i)}
                    >
                      {isEditing ? (
                        <form onSubmit={handleInlineGuess} className="m-cr-inline-form">
                          <input
                            ref={inlineInputRef}
                            className="m-cr-inline-input"
                            value={guess}
                            onFocus={(e) => e.currentTarget.select()}
                            onChange={(e) => setGuess(e.target.value)}
                            placeholder="guess…"
                            maxLength={slot.word.length}
                            onBlur={() => { if (!guess.trim()) { setEditingIndex(null); } }}
                            onKeyDown={(e) => { if (e.key === "Escape") { setEditingIndex(null); setGuess(""); } }}
                          />
                          <button type="submit" className="m-cr-inline-go" disabled={!guess.trim()}>↵</button>
                        </form>
                      ) : slot.revealed ? (
                        <span className="m-cr-word-text">{slot.word}</span>
                      ) : (
                        <span className="m-cr-word-text m-cr-word-text--partial">
                          {renderPartialWord(slot.word, slot.lettersShown)}
                        </span>
                      )}
                    </div>

                    {/* Action buttons */}
                    <div className="m-cr-slot-actions">
                      {isViewingMine && !isEdge && !slot.revealed && !myDone && (
                        <>
                          <button className="m-btn-icon m-btn-icon--hint"
                            onClick={(e) => { e.stopPropagation(); void handleHint(i); }}
                            disabled={slot.lettersShown >= slot.word.length - 1}>
                            <FiHelpCircle size={16} />
                          </button>
                          <button
                            className={`m-btn-icon m-btn-icon--giveup${giveUpConfirm === i ? " m-btn-icon--confirm" : ""}`}
                            onClick={(e) => { e.stopPropagation(); void handleGiveUp(i); }}>
                            <FiXCircle size={16} />
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Tags */}
                  <div className="m-cr-slot-tags">
                    {!slot.revealed && !isEditing && slot.lettersShown > 0 && (
                      <span className="m-badge-small">{slot.lettersShown}/{slot.word.length}</span>
                    )}
                    {isEdge && slot.revealed && <span className="m-badge-small">hint</span>}
                    {slot.revealed && !slot.solvedBy && !isEdge && (
                      <span className="m-badge-small m-badge-small--muted">skipped</span>
                    )}
                    {slot.solvedBy && !isEdge && (
                      <span className={`m-badge-small${slot.solvedBy === sessionId ? " m-badge-small--accent" : ""}`}>
                        {slot.solvedBy === sessionId ? "you" : isViewingMine ? "you" : oppName}
                      </span>
                    )}
                    {giveUpConfirm === i && (
                      <span className="m-badge-small m-badge-small--danger">tap ✕ again to skip</span>
                    )}
                  </div>

                  {i < viewingChain.length - 1 && <div className="m-cr-connector" />}
                </div>
              );
            })}
          </div>

          <p className="m-text-center m-text-muted" style={{ marginTop: "0.5rem" }}>
            {isViewingMine ? `${myProgress} / ${myTotal} words cracked` : `${oppProgress} / ${oppTotal} words cracked`}
          </p>

          {myDone && isViewingMine && !oppDone && (
            <div className="m-waiting">
              <div className="m-pulse" />
              <p>Waiting for {oppName} to finish…</p>
            </div>
          )}
        </div>
      )}

      {!isSpectator && game.phase === "playing" && !inGame && (
        <div className="m-section">
          <div className="m-waiting">
            <div className="m-pulse" />
            <p>Duel in progress — watching!</p>
          </div>
        </div>
      )}

      {/* ── Finished ── */}
      {!isSpectator && game.phase === "finished" && (
        <div className="m-section">
          {(() => {
            const sorted = Object.entries(game.scores).sort(([, a], [, b]) => b - a);
            const winnerId = sorted[0]?.[0];
            const tied = sorted.length > 1 && sorted[0]?.[1] === sorted[1]?.[1];
            return (
              <div className={`m-winner-banner${tied ? "" : winnerId === sessionId ? " m-winner-banner--win" : " m-winner-banner--lose"}`}>
                <span className="m-winner-icon">{tied ? "🤝" : winnerId === sessionId ? "🏆" : "💀"}</span>
                <div>
                  <p className="m-winner-title">
                    {tied ? "It's a Tie!" : winnerId === sessionId ? "You Win!" : `${playerName(winnerId ?? "")} Wins!`}
                  </p>
                  <p className="m-winner-sub">{myScore} – {opponentScore}</p>
                </div>
              </div>
            );
          })()}

          {game.round_history.length > 0 && (
            <>
              <h3 className="m-label">Rounds</h3>
              <div className="m-cr-round-list">
                {game.round_history.map((r) => {
                  const myRoundChain = r.chains[sessionId] ?? [];
                  const oppRoundChain = opponentId ? (r.chains[opponentId] ?? []) : [];
                  return (
                    <div key={r.round} className="m-cr-round-row">
                      <span className="m-cr-round-num">R{r.round}</span>
                      <div className="m-cr-round-chains">
                        <div className="m-cr-round-chain">
                          <span className="m-cr-round-chain-label">You</span>
                          <div className="m-cr-round-words">
                            {myRoundChain.map((w, wi) => (
                              <span key={wi} className="m-cr-round-word m-cr-round-word--me">{w.word}</span>
                            ))}
                          </div>
                        </div>
                        <div className="m-cr-round-chain">
                          <span className="m-cr-round-chain-label">{oppName}</span>
                          <div className="m-cr-round-words">
                            {oppRoundChain.map((w, wi) => (
                              <span key={wi} className="m-cr-round-word m-cr-round-word--opp">{w.word}</span>
                            ))}
                          </div>
                        </div>
                      </div>
                      <div className="m-cr-round-scores">
                        <span>{r.scores[sessionId] ?? 0}</span>
                        <span>–</span>
                        <span>{opponentId ? (r.scores[opponentId] ?? 0) : 0}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          <div className="m-actions">
            {isHost ? (
              <>
                <button className="m-btn m-btn-primary"
                  onClick={() => void zero.mutate(mutators.chainReaction.resetToLobby({ gameId, hostId: sessionId }))}>
                  Play Again
                </button>
                <button className="m-btn m-btn-muted"
                  onClick={() => { void zero.mutate(mutators.chainReaction.endGame({ gameId, hostId: sessionId })); navigate("/"); }}>
                  End Game
                </button>
              </>
            ) : (
              <button className="m-btn m-btn-muted" onClick={() => navigate("/")}>
                Back to Home
              </button>
            )}
          </div>
        </div>
      )}

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

function renderPartialWord(word: string, lettersShown: number): string {
  return word
    .split("")
    .map((ch, i) => (i < lettersShown ? ch : "_"))
    .join(" ");
}
