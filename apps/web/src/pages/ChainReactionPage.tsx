import { mutators, queries } from "@games/shared";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { FiEye, FiHelpCircle, FiLogIn, FiLogOut, FiPlay, FiSend, FiX, FiXCircle } from "react-icons/fi";
import { PasswordHeader } from "../components/password/PasswordHeader";
import { usePresenceSocket } from "../hooks/usePresenceSocket";
import { addRecentGame } from "../lib/session";
import { showToast } from "../lib/toast";
import { useIsMobile } from "../hooks/useIsMobile";
import { MobileChainReactionPage } from "../mobile/pages/MobileChainReactionPage";

type ChainSlot = { word: string; revealed: boolean; lettersShown: number; solvedBy?: string | null };

export function ChainReactionPage({ sessionId }: { sessionId: string }) {
  const isMobile = useIsMobile();
  if (isMobile) return <MobileChainReactionPage sessionId={sessionId} />;

  const zero = useZero();
  const navigate = useNavigate();
  const params = useParams();
  const gameId = params.id ?? "";
  const [games] = useQuery(queries.chainReaction.byId({ id: gameId }));
  const [sessions] = useQuery(queries.sessions.byGame({ gameType: "chain_reaction", gameId }));
  useQuery(queries.sessions.byId({ id: sessionId }));
  const game = games[0];

  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [guess, setGuess] = useState("");
  const inlineInputRef = useRef<HTMLInputElement>(null);
  const prevAnnouncementRef = useRef<{ text: string; ts: number } | null>(null);

  // Chain submission state (for custom mode)
  const [submissionWords, setSubmissionWords] = useState<string[]>([]);
  const [hasSubmitted, setHasSubmitted] = useState(false);

  // Which player's chain we're viewing: our own (solving) or opponent's (spectating their progress)
  const [viewingId, setViewingId] = useState<string>(sessionId);
  // Give-up confirmation: index of slot awaiting second press
  const [giveUpConfirm, setGiveUpConfirm] = useState<number | null>(null);

  usePresenceSocket({ sessionId, gameId, gameType: "chain_reaction" });

  const isHost = game?.host_id === sessionId;
  const me = useMemo(() => game?.players.find((p) => p.sessionId === sessionId), [game, sessionId]);
  const inGame = Boolean(me);

  const inGameRef = useRef(inGame);
  const phaseRef = useRef(game?.phase);
  inGameRef.current = inGame;
  phaseRef.current = game?.phase;

  // Unmount cleanup
  useEffect(() => {
    let active = false;
    const timer = setTimeout(() => { active = true; }, 500);
    return () => {
      clearTimeout(timer);
      if (active && inGameRef.current && phaseRef.current !== "ended") {
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
    // Skip if same text & ts within 3s (optimistic vs server duplicate)
    if (prev && prev.text === cur.text && Math.abs(cur.ts - prev.ts) < 3000) return;
    prevAnnouncementRef.current = cur;
    showToast(`📢 ${cur.text}`, "info");
  }, [game?.announcement]);

  // Reset between rounds
  useEffect(() => {
    setEditingIndex(null);
    setGuess("");
    setHasSubmitted(false);
    setViewingId(sessionId);
    setGiveUpConfirm(null);
  }, [game?.settings.currentRound, sessionId]);

  // Initialize submission words
  useEffect(() => {
    if (game?.phase === "submitting" && !hasSubmitted) {
      setSubmissionWords(Array.from({ length: game.settings.chainLength }, () => ""));
    }
  }, [game?.phase, game?.settings.chainLength, hasSubmitted]);

  // Track submitted
  useEffect(() => {
    if (game?.phase === "submitting" && game.submitted_chains[sessionId]) {
      setHasSubmitted(true);
    }
  }, [game?.phase, game?.submitted_chains, sessionId]);

  // Auto-focus inline input
  useEffect(() => {
    if (editingIndex !== null) {
      inlineInputRef.current?.focus();
    }
  }, [editingIndex]);

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

  // Per-player chains
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
    // Prefill with revealed hint letters
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
      await zero.mutate(mutators.chainReaction.guess({
        gameId,
        sessionId,
        wordIndex: idx,
        guess: currentGuess
      })).server;
    } catch {
      // Mutation error — stay out of editing
    }
  };

  const handleHint = async (i: number) => {
    // Exit editing so the updated partial word is visible immediately
    if (editingIndex === i) {
      setEditingIndex(null);
      setGuess("");
    }
    try {
      await zero.mutate(mutators.chainReaction.revealLetter({ gameId, sessionId, wordIndex: i })).server;
    } catch {
      // All revealable letters already shown
    }
  };

  const handleGiveUp = async (i: number) => {
    if (giveUpConfirm === i) {
      setGiveUpConfirm(null);
      try {
        await zero.mutate(mutators.chainReaction.giveUp({ gameId, sessionId, wordIndex: i })).server;
      } catch {
        // Already revealed
      }
    } else {
      setGiveUpConfirm(i);
    }
  };

  const submitChain = async (event: FormEvent) => {
    event.preventDefault();
    if (submissionWords.some((w) => !w.trim())) return;
    try {
      await zero.mutate(mutators.chainReaction.submitChain({
        gameId,
        sessionId,
        words: submissionWords.map((w) => w.trim())
      })).server;
      setHasSubmitted(true);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Submit failed", "error");
    }
  };

  const myScore = game.scores[sessionId] ?? 0;
  const opponentScore = opponentId ? (game.scores[opponentId] ?? 0) : 0;
  const myName = playerName(sessionId);
  const oppName = opponentId ? playerName(opponentId) : "???";

  // Progress counts (hidden words solved)
  const myProgress = myChain.length > 0 ? myChain.filter((s) => s.revealed).length - 2 : 0;
  const myTotal = myChain.length > 0 ? myChain.length - 2 : 0;
  const oppProgress = oppChain.length > 0 ? oppChain.filter((s) => s.revealed).length - 2 : 0;
  const oppTotal = oppChain.length > 0 ? oppChain.length - 2 : 0;

  return (
    <div className="game-page" data-game-theme="chain">
      <PasswordHeader
        title="Chain Reaction"
        code={game.code}
        phase={game.phase}
        {...(game.phase !== "lobby" ? { currentRound: game.settings.currentRound } : {})}
        endsAt={game.settings.phaseEndsAt}
        isHost={isHost}
      />

      {/* ─── VS Scoreboard with clickable cards ─── */}
      {game.phase !== "lobby" && game.players.length === 2 && (
        <div className="cr-versus">
          <div
            className={`cr-vs-player cr-vs-player--clickable${isViewingMine && game.phase === "playing" ? " cr-vs-player--active" : ""}${myDone ? " cr-vs-player--done" : ""}`}
            onClick={() => { setViewingId(sessionId); setEditingIndex(null); setGuess(""); }}
          >
            <div className="cr-vs-avatar">{(myName[0] ?? "?").toUpperCase()}</div>
            <div className="cr-vs-info">
              <span className="cr-vs-name">{myName}</span>
              <span className="cr-vs-score" data-tooltip="Total score" data-tooltip-variant="game">{myScore}</span>
              {game.phase === "playing" && <span className="cr-vs-progress" data-tooltip="Words solved this round" data-tooltip-variant="info">{myProgress}/{myTotal}</span>}
            </div>
            {myDone && <span className="cr-vs-done-badge" data-tooltip="Finished this round" data-tooltip-variant="success">✓</span>}
          </div>

          <div className="cr-vs-divider">
            <span className="cr-vs-badge">VS</span>
            <span className="cr-vs-round">R{game.settings.currentRound}/{game.settings.rounds}</span>
          </div>

          <div
            className={`cr-vs-player cr-vs-player--right cr-vs-player--clickable${!isViewingMine && game.phase === "playing" ? " cr-vs-player--active" : ""}${oppDone ? " cr-vs-player--done" : ""}`}
            onClick={() => { setViewingId(opponentId ?? sessionId); setEditingIndex(null); setGuess(""); }}
          >
            <div className="cr-vs-info">
              <span className="cr-vs-name">{oppName}</span>
              <span className="cr-vs-score" data-tooltip="Total score" data-tooltip-variant="game">{opponentScore}</span>
              {game.phase === "playing" && <span className="cr-vs-progress" data-tooltip="Words solved this round" data-tooltip-variant="info">{oppProgress}/{oppTotal}</span>}
            </div>
            <div className="cr-vs-avatar cr-vs-avatar--opp">{(oppName[0] ?? "?").toUpperCase()}</div>
            {oppDone && <span className="cr-vs-done-badge" data-tooltip="Finished this round" data-tooltip-variant="success">✓</span>}
          </div>
        </div>
      )}

      {/* ─── Lobby: 1v1 Duel Matchup + chain mode toggle ─── */}
      {game.phase === "lobby" && (
        <div className="game-section">
          <div className="cr-lobby-duel">
            {game.players[0] ? (() => {
              const p = game.players[0];
              const isMe = p.sessionId === sessionId;
              const name = playerName(p.sessionId);
              return (
                <div className={`cr-lobby-slot cr-lobby-slot--filled${isMe ? " cr-lobby-slot--me" : ""}`}>
                  <div className="cr-lobby-avatar">{(name[0] ?? "?").toUpperCase()}</div>
                  <span className="cr-lobby-name">{name}</span>
                  {isMe && <span className="cr-lobby-you">you</span>}
                  {p.sessionId === game.host_id && <span className="badge" style={{ fontSize: "0.55rem" }}>host</span>}
                  {isHost && !isMe && (
                    <button className="btn-icon btn-icon--danger cr-lobby-kick" data-tooltip="Remove from game" data-tooltip-variant="danger"
                      onClick={() => void zero.mutate(mutators.chainReaction.kick({ gameId, hostId: sessionId, targetId: p.sessionId }))}>
                      <FiX size={12} />
                    </button>
                  )}
                </div>
              );
            })() : (
              <div className="cr-lobby-slot cr-lobby-slot--empty">
                <div className="cr-lobby-avatar cr-lobby-avatar--empty">?</div>
                <span className="cr-lobby-empty-text">Waiting…</span>
              </div>
            )}

            <div className="cr-lobby-vs">VS</div>

            {game.players[1] ? (() => {
              const p = game.players[1];
              const isMe = p.sessionId === sessionId;
              const name = playerName(p.sessionId);
              return (
                <div className={`cr-lobby-slot cr-lobby-slot--filled${isMe ? " cr-lobby-slot--me" : ""}`}>
                  <div className="cr-lobby-avatar cr-lobby-avatar--opp">{(name[0] ?? "?").toUpperCase()}</div>
                  <span className="cr-lobby-name">{name}</span>
                  {isMe && <span className="cr-lobby-you">you</span>}
                  {p.sessionId === game.host_id && <span className="badge" style={{ fontSize: "0.55rem" }}>host</span>}
                  {isHost && !isMe && (
                    <button className="btn-icon btn-icon--danger cr-lobby-kick" data-tooltip="Remove from game" data-tooltip-variant="danger"
                      onClick={() => void zero.mutate(mutators.chainReaction.kick({ gameId, hostId: sessionId, targetId: p.sessionId }))}>
                      <FiX size={12} />
                    </button>
                  )}
                </div>
              );
            })() : !inGame ? (
              <div className="cr-lobby-slot cr-lobby-slot--join"
                onClick={() => void zero.mutate(mutators.chainReaction.join({ gameId, sessionId })).client.catch(() => showToast("Couldn't join", "error"))}>
                <div className="cr-lobby-avatar cr-lobby-avatar--empty"><FiLogIn size={20} /></div>
                <span className="cr-lobby-join-text">Join Duel</span>
              </div>
            ) : (
              <div className="cr-lobby-slot cr-lobby-slot--empty">
                <div className="cr-lobby-avatar cr-lobby-avatar--empty">?</div>
                <span className="cr-lobby-empty-text">Awaiting challenger…</span>
              </div>
            )}
          </div>

          <p className="cr-mode-info">
            Mode: <strong>{game.settings.chainMode === "custom" ? "Custom Chains" : "Premade Chains"}</strong>
          </p>

          {inGame && (
            <div className="game-actions" style={{ marginTop: "0.75rem" }}>
              {isHost ? (
                <button className="btn btn-primary game-action-btn" disabled={game.players.length !== 2}
                  onClick={() => void zero.mutate(mutators.chainReaction.start({ gameId, hostId: sessionId }))}>
                  <FiPlay size={16} /> Start Duel
                </button>
              ) : (
                <p className="game-waiting-text">Waiting for host to start…</p>
              )}
              <button className="btn btn-muted game-action-btn"
                onClick={() => void zero.mutate(mutators.chainReaction.leave({ gameId, sessionId }))}>
                <FiLogOut size={14} /> Leave
              </button>
            </div>
          )}
        </div>
      )}

      {/* ─── Submitting: chain input form (not submitted yet) ─── */}
      {game.phase === "submitting" && inGame && !hasSubmitted && (
        <div className="game-section">
          <div className="cr-submit-banner">
            <FiSend size={18} />
            <span>Write your chain — {game.settings.chainLength} connected words</span>
          </div>

          <form onSubmit={submitChain}>
            <div className="cr-chain">
              {submissionWords.map((word, i) => {
                const isEdge = i === 0 || i === submissionWords.length - 1;
                return (
                  <div key={i} className="cr-submit-slot">
                    <span className="cr-slot-num">{i + 1}</span>
                    <input
                      className="cr-submit-input"
                      value={word}
                      onChange={(e) => {
                        const next = [...submissionWords];
                        next[i] = e.target.value;
                        setSubmissionWords(next);
                      }}
                      placeholder={isEdge ? "Hint word (shown)" : "Hidden word"}
                      maxLength={30}
                    />
                    {isEdge && <span className="cr-slot-tag">visible</span>}
                    {i < submissionWords.length - 1 && <div className="cr-chain-connector" />}
                  </div>
                );
              })}
            </div>
            <div className="game-actions" style={{ marginTop: "0.75rem" }}>
              <button type="submit" className="btn btn-primary game-action-btn"
                disabled={submissionWords.some((w) => !w.trim())}>
                <FiSend size={14} /> Lock In Chain
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ─── Submitted: chain preview + opponent status ─── */}
      {game.phase === "submitting" && inGame && hasSubmitted && (
        <div className="game-section">
          <div className="cr-submit-done-banner">✅ Chain locked in!</div>
          {game.submitted_chains[sessionId] && (
            <div className="cr-chain-preview">
              <h4 className="cr-preview-label">Your Chain</h4>
              <div className="cr-preview-words">
                {game.submitted_chains[sessionId].map((word, i, arr) => {
                  const isEdge = i === 0 || i === arr.length - 1;
                  return (
                    <div key={i} className={`cr-preview-word${isEdge ? " cr-preview-word--edge" : ""}`}>
                      <span className="cr-slot-num">{i + 1}</span>
                      <span className="cr-preview-text">{word}</span>
                      {isEdge && <span className="cr-slot-tag">hint</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          <div className="cr-opponent-status">
            {game.submitted_chains[opponentId ?? ""] ? (
              <p className="cr-status-text cr-status-text--done">✅ {oppName} has submitted — starting soon!</p>
            ) : (
              <div className="cr-status-writing">
                <div className="game-waiting-pulse" />
                <p className="cr-status-text">{oppName} is writing their chain…</p>
              </div>
            )}
          </div>
        </div>
      )}

      {game.phase === "submitting" && !inGame && (
        <div className="game-section">
          <div className="game-waiting">
            <div className="game-waiting-pulse" />
            <p>Players are writing their chains…</p>
          </div>
        </div>
      )}

      {/* ─── Playing: simultaneous chain solving ─── */}
      {game.phase === "playing" && inGame && (
        <div className="game-section">
          {/* View indicator */}
          <div className="cr-view-indicator">
            {isViewingMine ? (
              myDone ? (
                <span className="cr-view-label cr-view-label--done">✅ You finished! Click {oppName}'s card to spectate</span>
              ) : (
                <span className="cr-view-label">Solve the chain — tap a word to guess!</span>
              )
            ) : (
              <span className="cr-view-label cr-view-label--spectate">
                <FiEye size={14} /> Watching {oppName}'s progress
              </span>
            )}
          </div>

          {/* Chain display */}
          <div className="cr-chain">
            {viewingChain.map((slot, i) => {
              const isEditing = isViewingMine && editingIndex === i;
              const isEdge = i === 0 || i === viewingChain.length - 1;
              const canClick = isViewingMine && !myDone && !slot.revealed && !isEditing;

              return (
                <div key={i} className="cr-slot-outer">
                  <div className="cr-slot-wrapper">
                    {/* Hint button — left side */}
                    {isViewingMine && !isEdge && !slot.revealed && !myDone ? (
                      <button
                        className="cr-action-hint"
                        data-tooltip="Reveal a letter"
                        data-tooltip-pos="left"
                        onClick={(e) => { e.stopPropagation(); void handleHint(i); }}
                        disabled={slot.lettersShown >= slot.word.length - 1}
                      >
                        <FiHelpCircle size={18} />
                      </button>
                    ) : (
                      <div className="cr-action-spacer" />
                    )}

                    <div
                      className={[
                        "cr-word-slot",
                        slot.revealed ? "cr-word-slot--revealed" : "cr-word-slot--hidden",
                        isEditing ? "cr-word-slot--editing" : "",
                        canClick ? "cr-word-slot--clickable" : "",
                        slot.solvedBy === sessionId ? "cr-word-slot--mine" : "",
                        slot.solvedBy && slot.solvedBy !== sessionId ? "cr-word-slot--theirs" : "",
                        slot.revealed && !slot.solvedBy && !isEdge ? "cr-word-slot--givenup" : "",
                      ].filter(Boolean).join(" ")}
                      onClick={() => canClick && handleSlotClick(i)}
                    >
                      <span className="cr-slot-idx">{i + 1}</span>

                      <div className="cr-slot-body">
                        {isEditing ? (
                          <form onSubmit={handleInlineGuess} className="cr-inline-form">
                            <input
                              ref={inlineInputRef}
                              className="cr-inline-input"
                              value={guess}
                              onChange={(e) => setGuess(e.target.value)}
                              placeholder="type your guess…"
                              maxLength={slot.word.length}
                              onBlur={() => { if (!guess.trim()) { setEditingIndex(null); } }}
                              onKeyDown={(e) => { if (e.key === "Escape") { setEditingIndex(null); setGuess(""); } }}
                            />
                            <button type="submit" className="cr-inline-go" disabled={!guess.trim()}>↵</button>
                          </form>
                        ) : slot.revealed ? (
                          <span className="cr-word-text">{slot.word}</span>
                        ) : (
                          <span className="cr-word-text cr-word-text--partial">
                            {renderPartialWord(slot.word, slot.lettersShown)}
                          </span>
                        )}
                      </div>

                      {!slot.revealed && !isEditing && slot.lettersShown > 0 && (
                        <span className="cr-letters-count">{slot.lettersShown}/{slot.word.length}</span>
                      )}
                      {isEdge && slot.revealed && <span className="cr-slot-tag">hint</span>}
                      {slot.revealed && !slot.solvedBy && !isEdge && (
                        <span className="cr-solver-tag cr-solver-tag--skip">skipped</span>
                      )}
                      {slot.solvedBy && !isEdge && (
                        <span className={`cr-solver-tag${slot.solvedBy === sessionId ? " cr-solver-tag--me" : ""}`}>
                          {slot.solvedBy === sessionId ? "you" : isViewingMine ? "you" : oppName}
                        </span>
                      )}
                    </div>

                    {/* Give-up button — right side */}
                    {isViewingMine && !isEdge && !slot.revealed && !myDone ? (
                      <button
                        className={`cr-action-giveup${giveUpConfirm === i ? " cr-action-giveup--confirm" : ""}`}
                        data-tooltip={giveUpConfirm === i ? "Press again to confirm" : "Skip word"}
                        data-tooltip-pos="right"
                        data-tooltip-variant={giveUpConfirm === i ? "danger" : undefined}
                        onClick={(e) => { e.stopPropagation(); void handleGiveUp(i); }}
                      >
                        <FiXCircle size={18} />
                      </button>
                    ) : (
                      <div className="cr-action-spacer" />
                    )}
                  </div>

                  {i < viewingChain.length - 1 && <div className="cr-chain-connector" />}
                </div>
              );
            })}
          </div>

          {/* Progress bar */}
          {isViewingMine ? (
            <p className="game-progress-text">{myProgress} / {myTotal} words cracked</p>
          ) : (
            <p className="game-progress-text">{oppProgress} / {oppTotal} words cracked</p>
          )}

          {/* Waiting overlay when you're done */}
          {myDone && isViewingMine && !oppDone && (
            <div className="cr-done-waiting">
              <div className="game-waiting-pulse" />
              <p>Waiting for {oppName} to finish…</p>
            </div>
          )}
        </div>
      )}

      {game.phase === "playing" && !inGame && (
        <div className="game-section">
          <div className="game-waiting">
            <div className="game-waiting-pulse" />
            <p>Duel in progress — watching!</p>
          </div>
        </div>
      )}

      {/* ─── Finished ─── */}
      {game.phase === "finished" && (
        <div className="game-section">
          {(() => {
            const sorted = Object.entries(game.scores).sort(([, a], [, b]) => b - a);
            const winnerId = sorted[0]?.[0];
            const tied = sorted.length > 1 && sorted[0]?.[1] === sorted[1]?.[1];
            return (
              <div className={`cr-winner-card${tied ? "" : winnerId === sessionId ? " cr-winner-card--win" : " cr-winner-card--lose"}`}>
                <span className="cr-winner-icon">{tied ? "🤝" : winnerId === sessionId ? "🏆" : "💀"}</span>
                <div>
                  <p className="cr-winner-title">
                    {tied ? "It's a Tie!" : winnerId === sessionId ? "You Win!" : `${playerName(winnerId ?? "")} Wins!`}
                  </p>
                  <p className="cr-winner-sub">{myScore} – {opponentScore}</p>
                </div>
              </div>
            );
          })()}

          {game.round_history.length > 0 && (
            <>
              <h3 className="game-section-label">Rounds</h3>
              <div className="cr-round-list">
                {game.round_history.map((r) => {
                  const myRoundChain = r.chains[sessionId] ?? [];
                  const oppRoundChain = opponentId ? (r.chains[opponentId] ?? []) : [];
                  return (
                    <div key={r.round} className="cr-round-row">
                      <span className="cr-round-num">R{r.round}</span>
                      <div className="cr-round-chains">
                        <div className="cr-round-chain">
                          <span className="cr-round-chain-label">You</span>
                          {myRoundChain.map((w, wi) => (
                            <span key={wi} className="cr-round-word cr-round-word--me">{w.word}</span>
                          ))}
                        </div>
                        <div className="cr-round-chain">
                          <span className="cr-round-chain-label">{oppName}</span>
                          {oppRoundChain.map((w, wi) => (
                            <span key={wi} className="cr-round-word cr-round-word--opp">{w.word}</span>
                          ))}
                        </div>
                      </div>
                      <div className="cr-round-scores">
                        <span>{r.scores[sessionId] ?? 0}</span>
                        <span className="cr-round-dash">–</span>
                        <span>{opponentId ? (r.scores[opponentId] ?? 0) : 0}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          <div className="game-actions">
            {isHost ? (
              <>
                <button
                  className="btn btn-primary game-action-btn"
                  onClick={() => void zero.mutate(mutators.chainReaction.resetToLobby({ gameId, hostId: sessionId }))}
                >
                  Play Again
                </button>
                <button
                  className="btn btn-muted"
                  onClick={() => {
                    void zero.mutate(mutators.chainReaction.endGame({ gameId, hostId: sessionId }));
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
    </div>
  );
}

function renderPartialWord(word: string, lettersShown: number): string {
  return word
    .split("")
    .map((ch, i) => (i < lettersShown ? ch : "_"))
    .join(" ");
}
