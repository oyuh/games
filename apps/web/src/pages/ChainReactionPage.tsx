import { mutators, queries, chainCategoryLabels } from "@games/shared";
import { optimistic, useQuery, useZero } from "../lib/zero";
import "../styles/game-shared.css";
import "../styles/chain-reaction.css";
import { FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { FiEye, FiHelpCircle, FiLogIn, FiLogOut, FiPlay, FiSend, FiX, FiXCircle } from "react-icons/fi";
import { PasswordHeader } from "../components/password/PasswordHeader";
import { InSessionModal } from "../components/shared/InSessionModal";
import { LobbyVisibilityToggle } from "../components/shared/LobbyVisibilityToggle";
import { SpectatorOverlay } from "../components/shared/SpectatorOverlay";
import { ChainGuessField } from "../components/chain/ChainGuessField";
import { useChainReactionLiveTyping } from "../hooks/useChainReactionLiveTyping";
import { addRecentGame, ensureName, getDisplayName, leaveCurrentGame, SessionGameType } from "../lib/session";
import { showToast } from "../lib/toast";
import { useIsMobile } from "../hooks/useIsMobile";
import { MobileChainReactionPage } from "../mobile/pages/MobileChainReactionPage";
import { ChainDemo } from "../components/demos/ChainDemo";
import { PlayerAvatar } from "../components/shared/PlayerAvatar";
import { useChainReactionGame, type ChainSlot } from "../hooks/useChainReactionGame";
import { playHint } from "../lib/sounds";


function ChainReactionPageDesktop({ sessionId }: { sessionId: string }) {

  const [showDemo, setShowDemo] = useState(false);
  const [flashSlot, setFlashSlot] = useState<{ idx: number; type: "correct" | "wrong" } | null>(null);

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
  } = useChainReactionGame(sessionId, (idx, isCorrect) => {
    // Desktop-only: flash the slot green or red for a beat.
    setFlashSlot({ idx, type: isCorrect ? "correct" : "wrong" });
    setTimeout(() => setFlashSlot((cur) => (cur?.idx === idx ? null : cur)), 600);
  });

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
  // submissionSlots / viewingSlots are view shapes, kept next to the markup
  const submissionSlots = submissionWords.map((word, index) => ({ id: `submission-slot-${index}`, word, index }));
  const viewingSlots = viewingChain.map((slot, index) => ({ id: `${viewingId}-chain-slot-${index}`, slot, index }));

  const activateOnKeyboard = (event: KeyboardEvent<HTMLElement>, action: () => void) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      action();
    }
  };

  return (
    <div className="game-page" data-game-theme="chain">
      <PasswordHeader
        title="Chain Reaction"
        code={game.code}
        phase={game.phase}
        {...(game.phase !== "lobby" ? { currentRound: game.settings.currentRound } : {})}
        endsAt={game.settings.phaseEndsAt}
        isHost={isHost}
        category={game.settings.category ?? null}
        isSpectator={isSpectator}
      />

      {/* ─── VS Scoreboard with clickable cards ─── */}
      {game.phase !== "lobby" && game.players.length === 2 && (
        <div className="cr-versus">
          <div
            className={`cr-vs-player cr-vs-player--clickable${isViewingMine && game.phase === "playing" ? " cr-vs-player--active" : ""}${myDone ? " cr-vs-player--done" : ""}${flashSlot?.type === "correct" ? " cr-vs-player--flash-green" : ""}${flashSlot?.type === "wrong" ? " cr-vs-player--flash-red" : ""}`}
            onClick={() => { setViewingTarget("self"); setEditingIndex(null); setGuess(""); }}
            onKeyDown={(event) => activateOnKeyboard(event, () => { setViewingTarget("self"); setEditingIndex(null); setGuess(""); })}
            role="button"
            tabIndex={0}
          >
            <div className="cr-vs-avatar">
              <PlayerAvatar
                seed={sessionId}
              />
            </div>
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
            onClick={() => { setViewingTarget("opponent"); setEditingIndex(null); setGuess(""); }}
            onKeyDown={(event) => activateOnKeyboard(event, () => { setViewingTarget("opponent"); setEditingIndex(null); setGuess(""); })}
            role="button"
            tabIndex={0}
          >
            <div className="cr-vs-info">
              <span className="cr-vs-name">{oppName}</span>
              <span className="cr-vs-score" data-tooltip="Total score" data-tooltip-variant="game">{opponentScore}</span>
              {game.phase === "playing" && <span className="cr-vs-progress" data-tooltip="Words solved this round" data-tooltip-variant="info">{oppProgress}/{oppTotal}</span>}
            </div>
            <div className="cr-vs-avatar cr-vs-avatar--opp">
              <PlayerAvatar
                seed={opponentId ?? ""}
              />
            </div>
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
                  <div className="cr-lobby-avatar">
                    <PlayerAvatar
                      seed={p.sessionId}
                    />
                  </div>
                  <span className="cr-lobby-name">{name}</span>
                  {isMe && <span className="cr-lobby-you">you</span>}
                  {p.sessionId === game.host_id && <span className="badge" style={{ fontSize: "0.75rem" }}>host</span>}
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
                  <div className="cr-lobby-avatar cr-lobby-avatar--opp">
                    <PlayerAvatar
                      seed={p.sessionId}
                    />
                  </div>
                  <span className="cr-lobby-name">{name}</span>
                  {isMe && <span className="cr-lobby-you">you</span>}
                  {p.sessionId === game.host_id && <span className="badge" style={{ fontSize: "0.75rem" }}>host</span>}
                  {isHost && !isMe && (
                    <button className="btn-icon btn-icon--danger cr-lobby-kick" data-tooltip="Remove from game" data-tooltip-variant="danger"
                      onClick={() => void zero.mutate(mutators.chainReaction.kick({ gameId, hostId: sessionId, targetId: p.sessionId }))}>
                      <FiX size={12} />
                    </button>
                  )}
                </div>
              );
            })() : !inGame ? (
              <div
                className="cr-lobby-slot cr-lobby-slot--join"
                onClick={handleJoinClick}
                onKeyDown={(event) => activateOnKeyboard(event, handleJoinClick)}
                role="button"
                tabIndex={0}
              >
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
              {isHost && <LobbyVisibilityToggle gameType="chain_reaction" gameId={gameId} sessionId={sessionId} isPublic={game.is_public} />}
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

      {isSpectator && game.phase !== "lobby" && (
        <SpectatorOverlay
          playerCount={game.players.length}
          phase={game.phase}
          onLeave={() => void zero.mutate(mutators.chainReaction.leaveSpectator({ gameId, sessionId })).client.then(() => navigate("/"))}
        />
      )}

      {/* ─── Submitting: chain input form (not submitted yet) ─── */}
      {!isSpectator && game.phase === "submitting" && inGame && !hasSubmitted && (
        <div className="game-section">
          <div className="cr-submit-banner">
            <FiSend size={18} />
            <span>Write your chain - {game.settings.chainLength} connected words</span>
          </div>
          {game.settings.category && (
            <p style={{ textAlign: "center", margin: "0.25rem 0 0.5rem", fontSize: "0.85rem", color: "var(--secondary)" }}>
              Category: <strong style={{ color: "var(--primary)" }}>{chainCategoryLabels[game.settings.category] ?? game.settings.category}</strong>
            </p>
          )}

          <form onSubmit={submitChain}>
            <div className="cr-chain">
              {submissionSlots.map(({ id, word, index: i }) => {
                const isEdge = i === 0 || i === submissionWords.length - 1;
                return (
                  <div key={id} className="cr-submit-slot">
                    <span className="cr-slot-num">{i + 1}</span>
                    <input
                      ref={i === 0 ? submissionFirstInputRef : undefined}
                      className="cr-submit-input"
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
      {!isSpectator && game.phase === "submitting" && inGame && hasSubmitted && (
        <div className="game-section">
          <div className="cr-submit-done-banner">✅ Chain locked in!</div>
          {game.submitted_chains[sessionId] && (
            <div className="cr-chain-preview">
              <h4 className="cr-preview-label">Your Chain</h4>
              <div className="cr-preview-words">
                {submittedChainEntries.map(({ id, word, index: i }) => {
                  const isEdge = i === 0 || i === submittedChainEntries.length - 1;
                  return (
                    <div key={id} className={`cr-preview-word${isEdge ? " cr-preview-word--edge" : ""}`}>
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
              <p className="cr-status-text cr-status-text--done">✅ {oppName} has submitted - starting soon!</p>
            ) : (
              <div className="cr-status-writing">
                <div className="game-waiting-pulse" />
                <p className="cr-status-text">{oppName} is writing their chain…</p>
              </div>
            )}
          </div>
        </div>
      )}

      {!isSpectator && game.phase === "submitting" && !inGame && (
        <div className="game-section">
          <div className="game-waiting">
            <div className="game-waiting-pulse" />
            <p>Players are writing their chains…</p>
          </div>
        </div>
      )}

      {/* ─── Playing: simultaneous chain solving ─── */}
      {!isSpectator && game.phase === "playing" && inGame && (
        <div className="game-section">
          {/* View indicator */}
          <div className="cr-view-indicator">
            {isViewingMine ? (
              myDone ? (
                <span className="cr-view-label cr-view-label--done">✅ You finished! Click {oppName}'s card to spectate</span>
              ) : (
                <span className="cr-view-label">Solve the chain - tap a word to guess!</span>
              )
            ) : (
              <span className="cr-view-label cr-view-label--spectate">
                <FiEye size={14} /> Watching {oppName}'s progress
              </span>
            )}
          </div>

          {/* Chain display */}
          <div className="cr-chain">
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
                "cr-word-slot",
                slot.revealed ? "cr-word-slot--revealed" : "cr-word-slot--hidden",
                isEditing ? "cr-word-slot--editing" : "",
                canClick ? "cr-word-slot--clickable" : "",
                isLiveDrafting ? "cr-word-slot--live" : "",
                slot.solvedBy === sessionId ? "cr-word-slot--mine" : "",
                slot.solvedBy && slot.solvedBy !== sessionId ? "cr-word-slot--theirs" : "",
                slot.revealed && !slot.solvedBy && !isEdge ? "cr-word-slot--givenup" : "",
                flashSlot?.idx === i && flashSlot.type === "correct" ? "cr-word-slot--flash-green" : "",
                flashSlot?.idx === i && flashSlot.type === "wrong" ? "cr-word-slot--flash-red" : "",
              ].filter(Boolean).join(" ");
              const slotContent = (
                <>
                  <span className="cr-slot-idx">{i + 1}</span>

                  <div className="cr-slot-body">
                    {isEditing ? (
                      <ChainGuessField
                        word={slot.word}
                        lettersShown={slot.lettersShown}
                        value={guess}
                        inputRef={inlineInputRef}
                        onChange={setGuess}
                        onSubmit={() => void handleInlineGuess()}
                        onNavigate={handleNavigate}
                        onCancel={() => { setEditingIndex(null); setGuess(""); }}
                      />
                    ) : slot.revealed ? (
                      <span className="cr-word-text">{slot.word}</span>
                    ) : (
                      /* Same masked field, read-only: the letters line up whether or not
                         this is the word being typed in. */
                      <ChainGuessField
                        word={slot.word}
                        lettersShown={slot.lettersShown}
                        value={isLiveDrafting ? (viewingLiveDraft?.text ?? "") : ""}
                        readOnly
                        live={isLiveDrafting}
                      />
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
                </>
              );

              return (
                <div key={id} className="cr-slot-outer">
                  <div className="cr-slot-wrapper">
                    {/* Hint button - left side */}
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

                    {canClick ? (
                      <button type="button" className={slotClassName} onClick={() => handleSlotClick(i)}>
                        {slotContent}
                      </button>
                    ) : (
                      <div className={slotClassName}>{slotContent}</div>
                    )}

                    {/* Give-up button - right side */}
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

      {!isSpectator && game.phase === "playing" && !inGame && (
        <div className="game-section">
          <div className="game-waiting">
            <div className="game-waiting-pulse" />
            <p>Duel in progress - watching!</p>
          </div>
        </div>
      )}

      {/* ─── Finished ─── */}
      {!isSpectator && game.phase === "finished" && (
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
                  const myRoundWords = myRoundChain.map((word, index) => ({ id: `you-${r.round}-${index}`, word }));
                  const oppRoundWords = oppRoundChain.map((word, index) => ({ id: `opponent-${r.round}-${index}`, word }));
                  return (
                    <div key={r.round} className="cr-round-row">
                      <span className="cr-round-num">R{r.round}</span>
                      <div className="cr-round-chains">
                        <div className="cr-round-chain">
                          <span className="cr-round-chain-label">You</span>
                          {myRoundWords.map((entry) => (
                            <span key={entry.id} className="cr-round-word cr-round-word--me">{entry.word.word}</span>
                          ))}
                        </div>
                        <div className="cr-round-chain">
                          <span className="cr-round-chain-label">{oppName}</span>
                          {oppRoundWords.map((entry) => (
                            <span key={entry.id} className="cr-round-word cr-round-word--opp">{entry.word.word}</span>
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
                    void zero.mutate(mutators.chainReaction.endGame({ gameId, hostId: sessionId }))
                      .client.then(() => navigate("/"))
                      .catch(() => showToast("Couldn't end game", "error"));
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
      {showDemo && <ChainDemo onClose={() => setShowDemo(false)} />}

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

export function ChainReactionPage({ sessionId }: { sessionId: string }) {
  const isMobile = useIsMobile();
  if (isMobile) return <MobileChainReactionPage sessionId={sessionId} />;
  return <ChainReactionPageDesktop sessionId={sessionId} />;
}
