import { mutators, queries, chainCategoryLabels } from "@games/shared";
import { KeyboardEvent, useEffect, useState } from "react";
import { FiHelpCircle, FiLogIn, FiLogOut, FiPlay, FiSend, FiX, FiXCircle, FiEye, FiClock } from "react-icons/fi";
import { MobileGameHeader } from "../components/MobileGameHeader";
import { MobileGameNotFound } from "../components/MobileGameNotFound";
import { InSessionModal } from "../../components/shared/InSessionModal";
import { LobbyVisibilityToggle } from "../../components/shared/LobbyVisibilityToggle";
import { MobileSpectatorBadge, MobileHostBadge } from "../../components/shared/SpectatorBadge";
import { MobileSpectatorOverlay } from "../../components/shared/SpectatorOverlay";
import { ChainGuessField } from "../../components/chain/ChainGuessField";
import { showToast } from "../../lib/toast";
import { useChainReactionGame } from "../../hooks/useChainReactionGame";


export function MobileChainReactionPage({ sessionId }: { sessionId: string }) {
  const {
    zero, navigate, gameId, game, me, isHost, inGame, isSpectator, opponent, opponentId,
    playerName, liveBySession,
    editingIndex, setEditingIndex, guess, setGuess,
    submissionWords, setSubmissionWords, hasSubmitted,
    viewingTarget, setViewingTarget, giveUpConfirm,
    inlineInputRef, submissionFirstInputRef,
    activeGameType, activeGameId, inAnotherGame,
    showInSessionModal, setShowInSessionModal,
    joiningFromOtherGame, setJoiningFromOtherGame,
    myChain, oppChain, isViewingMine, viewingId, viewingChain, viewingLiveDraft,
    myDone, oppDone, submittedChainEntries,
    myScore, opponentScore, myName, oppName,
    myProgress, myTotal, oppProgress, oppTotal,
    handleSlotClick, handleInlineGuess, handleHint, handleGiveUp, handleNavigate,
    submitChain, handleJoinClick, confirmLeaveAndJoin,
  } = useChainReactionGame(sessionId);

  // Countdown timer
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  useEffect(() => {
    const endsAt = game?.settings.phaseEndsAt;
    if (!endsAt) { setTimeLeft(null); return; }
    const tick = () => setTimeLeft(Math.max(0, Math.floor((endsAt - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [game?.settings.phaseEndsAt]);

  if (!game) return <MobileGameNotFound theme="chain" />;

  const submissionSlots = submissionWords.map((word, index) => ({ id: `mobile-submission-slot-${index}`, word, index }));
  const viewingSlots = viewingChain.map((slot, index) => ({ id: `${viewingId}-mobile-chain-slot-${index}`, slot, index }));

  const activateOnKeyboard = (event: KeyboardEvent<HTMLElement>, action: () => void) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      action();
    }
  };

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
        {isHost && <MobileHostBadge />}
        {timeLeft != null && (
          <span className={`m-timer${timeLeft <= 10 ? " m-timer--danger" : " m-timer--warn"}`}>
            <FiClock size={14} /> {String(Math.floor(timeLeft / 60)).padStart(2, "0")}:{String(timeLeft % 60).padStart(2, "0")}
          </span>
        )}
      </MobileGameHeader>

      {/* ── VS Scoreboard ── */}
      {game.phase !== "lobby" && game.players.length === 2 && (
        <div className="m-cr-versus">
          <div
            className={`m-cr-vs-card${isViewingMine && game.phase === "playing" ? " m-cr-vs-card--active" : ""}${myDone ? " m-cr-vs-card--done" : ""}`}
            onClick={() => { setViewingTarget("self"); setEditingIndex(null); setGuess(""); }}
            onKeyDown={(event) => activateOnKeyboard(event, () => { setViewingTarget("self"); setEditingIndex(null); setGuess(""); })}
            role="button"
            tabIndex={0}
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
            onClick={() => { setViewingTarget("opponent"); setEditingIndex(null); setGuess(""); }}
            onKeyDown={(event) => activateOnKeyboard(event, () => { setViewingTarget("opponent"); setEditingIndex(null); setGuess(""); })}
            role="button"
            tabIndex={0}
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
              <div
                className="m-cr-slot m-cr-slot--join"
                onClick={handleJoinClick}
                onKeyDown={(event) => activateOnKeyboard(event, handleJoinClick)}
                role="button"
                tabIndex={0}
              >
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
            <div className="m-actions m-bottom-safe">
              {isHost && (
                <div style={{ display: "flex", justifyContent: "center", width: "100%" }}>
                  <LobbyVisibilityToggle gameType="chain_reaction" gameId={gameId} sessionId={sessionId} isPublic={game.is_public} />
                </div>
              )}
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
            <span>Write your chain - {game.settings.chainLength} connected words</span>
          </div>
          {game.settings.category && (
            <p style={{ textAlign: "center", margin: "0.25rem 0 0.5rem", fontSize: "0.82rem", color: "var(--secondary)" }}>
              Category: <strong style={{ color: "var(--primary)" }}>{chainCategoryLabels[game.settings.category] ?? game.settings.category}</strong>
            </p>
          )}

          <form onSubmit={submitChain}>
            <div className="m-cr-chain">
              {submissionSlots.map(({ id, word, index: i }) => {
                const isEdge = i === 0 || i === submissionWords.length - 1;
                return (
                  <div key={id} className="m-cr-submit-slot">
                    <span className="m-cr-slot-num">{i + 1}</span>
                    <input
                      ref={i === 0 ? submissionFirstInputRef : undefined}
                      className="m-input"
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
                {submittedChainEntries.map(({ id, word, index: i }) => {
                  const isEdge = i === 0 || i === submittedChainEntries.length - 1;
                  return (
                    <div key={id} className={`m-cr-preview-word${isEdge ? " m-cr-preview-word--edge" : ""}`}>
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
              <p className="m-text-success">✅ {oppName} has submitted - starting soon!</p>
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
                <span>Solve the chain - tap a word to guess!</span>
              )
            ) : (
              <span className="m-text-muted">
                <FiEye size={14} style={{ verticalAlign: "middle" }} /> Watching {oppName}'s progress
              </span>
            )}
          </div>

          <div className="m-cr-chain">
            {viewingSlots.map(({ id, slot, index: i }) => {
              const isEditing = isViewingMine && editingIndex === i;
              const isEdge = i === 0 || i === viewingChain.length - 1;
              const canClick = isViewingMine && !myDone && !slot.revealed && !isEditing;
              const isLiveDrafting = Boolean(
                !isViewingMine &&
                !slot.revealed &&
                viewingLiveDraft?.wordIndex === i &&
                viewingLiveDraft.text.trim()
              );
              const slotClassName = [
                "m-cr-word-slot",
                slot.revealed ? "m-cr-word-slot--revealed" : "m-cr-word-slot--hidden",
                isEditing ? "m-cr-word-slot--editing" : "",
                canClick ? "m-cr-word-slot--clickable" : "",
                isLiveDrafting ? "m-cr-word-slot--live" : "",
                slot.solvedBy === sessionId ? "m-cr-word-slot--mine" : "",
                slot.solvedBy && slot.solvedBy !== sessionId ? "m-cr-word-slot--theirs" : "",
                slot.revealed && !slot.solvedBy && !isEdge ? "m-cr-word-slot--givenup" : "",
              ].filter(Boolean).join(" ");
              const slotContent = isEditing ? (
                <ChainGuessField
                  word={slot.word}
                  lettersShown={slot.lettersShown}
                  value={guess}
                  compact
                  inputRef={inlineInputRef}
                  onChange={setGuess}
                  onSubmit={() => void handleInlineGuess()}
                  onNavigate={handleNavigate}
                  onCancel={() => { setEditingIndex(null); setGuess(""); }}
                />
              ) : slot.revealed ? (
                <span className="m-cr-word-text">{slot.word}</span>
              ) : (
                /* Same masked field, read-only: the letters line up whether or not
                   this is the word being typed in. */
                <ChainGuessField
                  word={slot.word}
                  lettersShown={slot.lettersShown}
                  value={isLiveDrafting ? (viewingLiveDraft?.text ?? "") : ""}
                  compact
                  readOnly
                  live={isLiveDrafting}
                />
              );
              const slotMeta = (
                <div className="m-cr-slot-meta">
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
                    <span className="m-badge-small m-badge-small--danger">tap X again to skip</span>
                  )}
                </div>
              );
              const slotInner = (
                <div className="m-cr-word-slot-inner">
                  <div className="m-cr-slot-content">{slotContent}</div>
                  {slotMeta}
                </div>
              );

              return (
                <div key={id} className="m-cr-slot-outer">
                  <div className="m-cr-slot-row">
                    <span className="m-cr-slot-num">{i + 1}</span>

                    {canClick ? (
                      <button type="button" className={slotClassName} onClick={() => handleSlotClick(i)}>
                        {slotInner}
                      </button>
                    ) : (
                      <div className={slotClassName}>{slotInner}</div>
                    )}

                    {/* Action buttons */}
                    <div className="m-cr-slot-actions">
                      {isViewingMine && !isEdge && !slot.revealed && !myDone && (
                        <>
                          <button type="button" className="m-btn-icon m-btn-icon--hint" aria-label="Reveal a letter"
                            onClick={(e) => { e.stopPropagation(); void handleHint(i); }}
                            disabled={slot.lettersShown >= slot.word.length - 1}>
                            <FiHelpCircle size={16} />
                          </button>
                          <button
                            type="button"
                            aria-label={giveUpConfirm === i ? "Confirm skip word" : "Skip word"}
                            className={`m-btn-icon m-btn-icon--giveup${giveUpConfirm === i ? " m-btn-icon--confirm" : ""}`}
                            onClick={(e) => { e.stopPropagation(); void handleGiveUp(i); }}>
                            <FiXCircle size={16} />
                          </button>
                        </>
                      )}
                    </div>
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
            <p>Duel in progress - watching!</p>
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
                  const myRoundWords = myRoundChain.map((word, index) => ({ id: `mobile-you-${r.round}-${index}`, word }));
                  const oppRoundWords = oppRoundChain.map((word, index) => ({ id: `mobile-opponent-${r.round}-${index}`, word }));
                  return (
                    <div key={r.round} className="m-cr-round-row">
                      <span className="m-cr-round-num">R{r.round}</span>
                      <div className="m-cr-round-chains">
                        <div className="m-cr-round-chain">
                          <span className="m-cr-round-chain-label">You</span>
                          <div className="m-cr-round-words">
                            {myRoundWords.map((entry) => (
                              <span key={entry.id} className="m-cr-round-word m-cr-round-word--me">{entry.word.word}</span>
                            ))}
                          </div>
                        </div>
                        <div className="m-cr-round-chain">
                          <span className="m-cr-round-chain-label">{oppName}</span>
                          <div className="m-cr-round-words">
                            {oppRoundWords.map((entry) => (
                              <span key={entry.id} className="m-cr-round-word m-cr-round-word--opp">{entry.word.word}</span>
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

          <div className="m-actions m-bottom-safe">
            {isHost ? (
              <>
                <button className="m-btn m-btn-primary"
                  onClick={() => void zero.mutate(mutators.chainReaction.resetToLobby({ gameId, hostId: sessionId }))}>
                  Play Again
                </button>
                <button className="m-btn m-btn-muted"
                  onClick={() => {
                    void zero.mutate(mutators.chainReaction.endGame({ gameId, hostId: sessionId }))
                      .client.then(() => navigate("/"))
                      .catch(() => showToast("Couldn't end game", "error"));
                  }}>
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
