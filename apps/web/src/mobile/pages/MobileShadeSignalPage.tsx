import { mutators, queries } from "@games/shared";
import { optimistic, useQuery, useZero } from "../../lib/zero";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { FiClock, FiLogIn, FiSend } from "react-icons/fi";
import { ColorGrid, generateGridColor } from "../../components/shade/ColorGrid";
import { MobileGameHeader } from "../components/MobileGameHeader";
import { MobileGameNotFound } from "../components/MobileGameNotFound";
import { InSessionModal } from "../../components/shared/InSessionModal";
import { LobbyVisibilityToggle } from "../../components/shared/LobbyVisibilityToggle";
import { BorringAvatar } from "../../components/shared/BorringAvatar";
import { RoundCountdown } from "../../components/shared/RoundCountdown";
import { MobileSpectatorBadge, MobileHostBadge } from "../../components/shared/SpectatorBadge";
import { MobileSpectatorOverlay } from "../../components/shared/SpectatorOverlay";
import { addRecentGame, ensureName, getDisplayName, leaveCurrentGame, SessionGameType } from "../../lib/session";
import { showToast } from "../../lib/toast";
import { callGameSecretInit, callGameSecretPreReveal } from "../../lib/game-secrets";

import { useMobileHostRegister } from "../../lib/mobile-host-context";
import { useShadeSignalGame, chebyshevDist, type ShadePhase } from "../../hooks/useShadeSignalGame";


const phaseLabels: Record<ShadePhase, string> = {
  lobby: "Lobby", picking: "Pick Color", clue1: "Clue 1", guess1: "Guess 1", clue2: "Clue 2",
  guess2: "Guess 2", reveal: "Reveal", finished: "Finished", ended: "Ended",
};

function scoreGuess(guess: { row: number; col: number }, target: { row: number; col: number }): number {
  const dist = Math.max(Math.abs(guess.row - target.row), Math.abs(guess.col - target.col));
  if (dist === 0) return 5;
  if (dist === 1) return 3;
  if (dist === 2) return 2;
  if (dist <= 3) return 1;
  return 0;
}

function distLabel(dist: number): string {
  if (dist === 0) return "Exact!";
  return `${dist} away`;
}

const ZONE_LEGEND = [
  { pts: 5, label: "Exact", cls: "shade-scoring-swatch--5" },
  { pts: 3, label: "1 away", cls: "shade-scoring-swatch--4" },
  { pts: 2, label: "2 away", cls: "shade-scoring-swatch--3" },
  { pts: 1, label: "3 away", cls: "shade-scoring-swatch--2" },
];

function MobileScoringLegend({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`m-shade-legend${compact ? " m-shade-legend--compact" : ""}`}>
      {ZONE_LEGEND.map((z) => (
        <span key={z.pts} className="m-shade-legend-item">
          <span className={`shade-scoring-swatch ${z.cls}`} />
          {z.label} = {z.pts}pt{z.pts > 1 ? "s" : ""}
        </span>
      ))}
    </div>
  );
}

export function MobileShadeSignalPage({ sessionId }: { sessionId: string }) {
  const {
    zero, navigate, gameId, game, me, isHost, isLeader, inGame, isSpectator,
    sessionById, playerIndexMap, phase, target, targetColor,
    clue, setClue, selectedCell, setSelectedCell,
    guessLocked, setGuessLocked, lobbyPreviewTarget, setLobbyPreviewTarget,
    clueInputRef, activeGameType, activeGameId, inAnotherGame,
    showInSessionModal, setShowInSessionModal,
    joiningFromOtherGame, setJoiningFromOtherGame,
    guessMarkerData, myCurrentGuess, lockedInIds, currentRoundGuesses,
    leaderName, totalRounds, guessersCount, latestRound,
    submitClue, submitGuess, handleJoinClick, confirmLeaveAndJoin,
  } = useShadeSignalGame(sessionId);

  // Mobile wording: one terse line.
  const guessMarkers = guessMarkerData.map((m) => ({
    sessionId: m.sessionId, name: m.name, row: m.row, col: m.col, isOwn: m.isOwn,
    tooltip: [m.name, m.roundLabel,
      m.dist != null ? (m.dist === 0 ? "Exact! 🎯" : `${m.dist} away`) : null,
      m.pts != null ? `+${m.pts} pts` : null].filter(Boolean).join(" · "),
  }));

  useMobileHostRegister(
    isHost && game
      ? { type: "shade_signal", gameId, hostId: game.host_id, players: game.players.map((p) => ({ sessionId: p.sessionId, name: sessionById[p.sessionId] ?? null })), spectators: game.spectators ?? [] }
      : null
  );

  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  useEffect(() => {
    const endsAt = game?.settings.phaseEndsAt;
    if (!endsAt) { setTimeLeft(null); return; }
    const activePhases: ShadePhase[] = ["clue1", "guess1", "clue2", "guess2"];
    if (!activePhases.includes(phase)) { setTimeLeft(null); return; }
    const tick = () => setTimeLeft(Math.max(0, Math.floor((endsAt - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [game?.settings.phaseEndsAt, phase]);

  if (!game) return <MobileGameNotFound theme="shade" />;

  /* Deliberately not the hook's isGameActive. That one gates score display and
     excludes "picking"; this one gates the round number in the header, which
     should show while the leader is picking. Same name, different question. */
  const isGameActive = phase !== "lobby" && phase !== "ended" && phase !== "finished";

  /* latestRound comes from the hook now. Mobile used to take the last history
     entry unguarded, so it could show the previous round's results during a
     new one. The hook's version checks it against currentRound. */

  return (
    <div className="m-page" data-game-theme="shade">
      <MobileGameHeader
        gameLabel="Shade Signal"
        code={game.code}
        phase={phaseLabels[phase]}
        {...(isGameActive ? { round: game.settings.currentRound } : {})}
        totalRounds={totalRounds}
        accent="var(--game-accent)"
      >
        {isSpectator && <MobileSpectatorBadge />}
        {isHost && <MobileHostBadge />}
        {timeLeft != null && (() => {
          const mm = String(Math.floor(timeLeft / 60)).padStart(2, "0");
          const ss = String(timeLeft % 60).padStart(2, "0");
          return (
            <span className={`m-timer ${timeLeft <= 10 ? "m-timer--danger" : "m-timer--warn"}`}>
              <FiClock size={14} /> {mm}:{ss}
            </span>
          );
        })()}
      </MobileGameHeader>

      {/* ── Players bar ── */}
      <div className="m-section">
        <h3 className="m-label">Players <span className="m-badge-small">{game.players.length}</span></h3>
        <div className="m-players-row m-players-row--strip">
          {game.players.map((player, playerIndex) => {
            const name = sessionById[player.sessionId] ?? getDisplayName(player.name, player.sessionId);
            const isMe = player.sessionId === sessionId;
            const isCurrentLeader = player.sessionId === game.leader_id;
            const isGuessPhase = phase === "guess1" || phase === "guess2";
            const isLockedIn = isGuessPhase && !isCurrentLeader && lockedInIds.has(player.sessionId);
            return (
              <div key={player.sessionId}
                className={`m-player-chip${isMe ? " m-player-chip--me" : ""}${isCurrentLeader ? " m-player-chip--leader" : ""}${isLockedIn ? " m-player-chip--locked" : ""}`}>
                <div className={`m-player-avatar${isCurrentLeader ? " m-player-avatar--leader" : ""}`}>
                  {isCurrentLeader ? "🎨" : isLockedIn ? "✅" : (
                    <BorringAvatar
                      seed={player.sessionId}
                      playerIndex={playerIndex}
                    />
                  )}
                </div>
                <span className="m-player-name">{name}</span>
                {isGameActive && <span className="m-badge-small">{player.totalScore}</span>}
                {isMe && <span className="m-badge-small m-badge-small--you">you</span>}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── LOBBY - not in game ── */}
      {phase === "lobby" && !inGame && (
        <div className="m-section">
          <p className="m-text-muted m-text-center">{isSpectator ? "You're spectating. Join to play!" : "You're not in this lobby yet."}</p>
          <button className="m-btn m-btn-primary" onClick={handleJoinClick}>
            <FiLogIn size={16} /> Join Game
          </button>
        </div>
      )}

      {/* ── LOBBY - in game ── */}
      {phase === "lobby" && inGame && (
        <div className="m-section">
          <p className="m-text-muted m-text-center" style={{ fontSize: "0.8rem", marginBottom: "0.5rem" }}>
            Tap any cell to set a target, then tap others to see scores
          </p>
          <ColorGrid
            rows={game.grid_rows}
            cols={game.grid_cols}
            seed={game.grid_seed}
            target={lobbyPreviewTarget}
            onSelect={(r, c) => setLobbyPreviewTarget({ row: r, col: c })}
            interactive
            showTarget={!!lobbyPreviewTarget}
            showZones={!!lobbyPreviewTarget}
            showScoreTooltips={!!lobbyPreviewTarget}
          />
          {lobbyPreviewTarget && <MobileScoringLegend />}

          <div className="m-actions m-bottom-safe">
            {isHost && (
              <div style={{ display: "flex", justifyContent: "center", width: "100%" }}>
                <LobbyVisibilityToggle gameType="shade_signal" gameId={gameId} sessionId={sessionId} isPublic={game.is_public} />
              </div>
            )}
            {isHost && (
              <button className="m-btn m-btn-primary" disabled={game.players.length < 3}
                onClick={() => void zero.mutate(mutators.shadeSignal.start({ gameId, hostId: sessionId }))}>
                {game.players.length < 3
                  ? `Need ${3 - game.players.length} more player${3 - game.players.length > 1 ? "s" : ""}`
                  : "Start Game"}
              </button>
            )}
            <button className="m-btn m-btn-muted"
              onClick={() => void zero.mutate(mutators.shadeSignal.leave({ gameId, sessionId }))}>
              Leave
            </button>
          </div>
        </div>
      )}

      {isSpectator && phase !== "lobby" && (
        <MobileSpectatorOverlay playerCount={game.players.length} phase={phaseLabels[phase]} onLeave={() => void zero.mutate(mutators.shadeSignal.leaveSpectator({ gameId, sessionId }))} />
      )}

      {/* ── CLUE PHASE (Leader) ── */}
      {!isSpectator && (phase === "clue1" || phase === "clue2") && isLeader && (
        <div className="m-section">
          <div className="m-shade-leader-banner">
            <h3>You are the Leader! 🎨</h3>
            <p>
              {phase === "clue1"
                ? <>Give a <strong>one-word</strong> clue to help guessers find your target color.</>
                : <>Give a <strong>second clue</strong> (up to 2 words).</>}
            </p>
            {game.settings.hardMode && (
              <p className="m-shade-hard-warn">🚫 No Color Names - you can't use words like red, blue, green, etc.</p>
            )}
          </div>

          {target && targetColor && (
            <div className="m-shade-target">
              <div className="m-shade-target-swatch" style={{ background: targetColor }} />
              <span className="m-shade-target-label">Your target ↑</span>
            </div>
          )}

          <ColorGrid
            rows={game.grid_rows}
            cols={game.grid_cols}
            seed={game.grid_seed}
            target={target}
            showTarget
            compact
          />

          <form className="m-shade-clue-form" onSubmit={submitClue}>
            <input
              ref={clueInputRef}
              className="m-input"
              value={clue}
              onChange={(e) => setClue(e.target.value)}
              onFocus={(e) => e.currentTarget.select()}
              placeholder={phase === "clue1" ? "One word clue…" : "Second clue (1-2 words)…"}
              maxLength={60}
            />
            <button className="m-btn m-btn-primary" type="submit" disabled={!clue.trim()} onMouseDown={(event) => event.preventDefault()}>
              <FiSend size={14} /> Send
            </button>
          </form>
        </div>
      )}

      {/* ── CLUE PHASE (Guessers waiting) ── */}
      {!isSpectator && (phase === "clue1" || phase === "clue2") && !isLeader && inGame && (
        <div className="m-section">
          <div className="m-waiting">
            <div className="m-pulse" />
            <p><strong>{leaderName}</strong> is thinking of {phase === "clue1" ? "a first" : "a second"} clue…</p>
          </div>
          {game.clue1 && phase === "clue2" && (
            <div className="m-shade-clue-display">
              <span className="m-shade-clue-tag">Clue 1</span>
              <span className="m-shade-clue-word">{game.clue1}</span>
            </div>
          )}
          <ColorGrid rows={game.grid_rows} cols={game.grid_cols} seed={game.grid_seed} compact />
        </div>
      )}

      {/* ── GUESS PHASE (Guessers) ── */}
      {!isSpectator && (phase === "guess1" || phase === "guess2") && !isLeader && inGame && (
        <div className="m-section">
          <div className="m-shade-clues-row">
            {game.clue1 && (
              <div className="m-shade-clue-display">
                <span className="m-shade-clue-tag">Clue 1</span>
                <span className="m-shade-clue-word">{game.clue1}</span>
              </div>
            )}
            {game.clue2 && (
              <div className="m-shade-clue-display">
                <span className="m-shade-clue-tag">Clue 2</span>
                <span className="m-shade-clue-word">{game.clue2}</span>
              </div>
            )}
          </div>

          <p className="m-text-center" style={{ margin: "0.25rem 0" }}>
            {guessLocked ? "Your guess is locked in! ✅" : "Tap the color you think the leader means!"}
          </p>

          <ColorGrid
            rows={game.grid_rows}
            cols={game.grid_cols}
            seed={game.grid_seed}
            selected={selectedCell ?? (myCurrentGuess ? { row: myCurrentGuess.row, col: myCurrentGuess.col } : null)}
            onSelect={(r, c) => setSelectedCell({ row: r, col: c })}
            interactive={!guessLocked}
          />

          <div className="m-shade-guess-actions">
            {(selectedCell || (guessLocked && myCurrentGuess)) && (() => {
              const cell = selectedCell ?? (myCurrentGuess ? { row: myCurrentGuess.row, col: myCurrentGuess.col } : null);
              if (!cell) return null;
              return (
                <div className="m-shade-selected-preview">
                  <div className="m-shade-preview-swatch"
                    style={{ background: generateGridColor(cell.row, cell.col, game.grid_rows, game.grid_cols, game.grid_seed) }} />
                  <span>{guessLocked ? "Locked in" : "Your pick"}</span>
                </div>
              );
            })()}
            {guessLocked ? (
              <button className="m-btn m-btn-muted"
                onClick={() => { setGuessLocked(false); setSelectedCell(myCurrentGuess ? { row: myCurrentGuess.row, col: myCurrentGuess.col } : null); }}>
                Change Guess
              </button>
            ) : (
              <div className="m-shade-guess-btns">
                <button className="m-btn m-btn-primary" disabled={!selectedCell} onClick={() => void submitGuess()}>
                  Lock In Guess
                </button>
                {phase === "guess2" && (() => {
                  const g1 = game.guesses.find((g) => g.sessionId === sessionId && g.round === 1);
                  return g1 ? (
                    <button className="m-btn m-btn-muted"
                      onClick={() => {
                        setSelectedCell({ row: g1.row, col: g1.col });
                        void zero.mutate(mutators.shadeSignal.submitGuess({ gameId, sessionId, row: g1.row, col: g1.col }))
                          .server.then(() => setGuessLocked(true));
                      }}>
                      Skip (keep guess 1)
                    </button>
                  ) : null;
                })()}
              </div>
            )}
          </div>

          <p className="m-text-center m-text-muted">{currentRoundGuesses}/{guessersCount} guessers locked in</p>
        </div>
      )}

      {/* ── GUESS PHASE (Leader / spectator) ── */}
      {!isSpectator && (phase === "guess1" || phase === "guess2") && (isLeader || !inGame) && (
        <div className="m-section">
          <div className="m-shade-clues-row">
            {game.clue1 && (
              <div className="m-shade-clue-display">
                <span className="m-shade-clue-tag">Clue 1</span>
                <span className="m-shade-clue-word">{game.clue1}</span>
              </div>
            )}
            {game.clue2 && (
              <div className="m-shade-clue-display">
                <span className="m-shade-clue-tag">Clue 2</span>
                <span className="m-shade-clue-word">{game.clue2}</span>
              </div>
            )}
          </div>
          <div className="m-waiting">
            <div className="m-pulse" />
            <p>Guessers are choosing… ({currentRoundGuesses}/{guessersCount})</p>
          </div>
          <ColorGrid
            rows={game.grid_rows}
            cols={game.grid_cols}
            seed={game.grid_seed}
            target={isLeader ? target : null}
            showTarget={isLeader}
            compact
          />
        </div>
      )}

      {/* ── REVEAL ── */}
      {!isSpectator && phase === "reveal" && (
        <div className="m-section">
          <h3 className="m-label" style={{ textAlign: "center" }}>🎯 Reveal!</h3>

          {targetColor && (
            <div className="m-shade-reveal-target">
              <div className="m-shade-reveal-swatch" style={{ background: targetColor }} />
              <div className="m-shade-reveal-info">
                <span>Target Color</span>
                <span className="m-shade-reveal-clues">
                  {game.clue1 && <em>"{game.clue1}"</em>}
                  {game.clue2 && <> → <em>"{game.clue2}"</em></>}
                </span>
              </div>
            </div>
          )}

          <ColorGrid
            rows={game.grid_rows}
            cols={game.grid_cols}
            seed={game.grid_seed}
            target={target}
            showTarget
            showZones
            markers={guessMarkers}
            playerIndexMap={playerIndexMap}
            compact
          />
          <details className="m-shade-legend-details">
            <summary>Scoring zones</summary>
            <MobileScoringLegend compact />
          </details>

          {latestRound && (
            <div className="m-shade-score-table m-shade-score-table--compact">
              <h4 className="m-label">Round Scores</h4>
              {game.players.reduce<typeof game.players>((players, player) => {
                if (player.sessionId !== game.leader_id) {
                  players.push(player);
                }
                return players;
              }, []).map((p) => {
                  const pts = latestRound.scores[p.sessionId] ?? 0;
                  const g2 = latestRound.guesses.find((g) => g.sessionId === p.sessionId && g.round === 2);
                  const g1 = latestRound.guesses.find((g) => g.sessionId === p.sessionId && g.round === 1);
                  const gFinal = g2 ?? g1;
                  const dist = gFinal && target ? chebyshevDist({ row: gFinal.row, col: gFinal.col }, target) : null;
                  return (
                    <div key={p.sessionId} className="m-shade-score-row">
                      <span className="m-shade-score-name">
                        {sessionById[p.sessionId] ?? getDisplayName(p.name, p.sessionId)}
                        {p.sessionId === sessionId && <span className="m-badge-small m-badge-small--you">you</span>}
                      </span>
                      {dist != null && <span className="m-shade-score-dist">{distLabel(dist)}</span>}
                      <span className={`m-shade-score-pts${pts >= 3 ? " m-shade-score-pts--great" : pts > 0 ? " m-shade-score-pts--ok" : ""}`}>
                        +{pts}
                      </span>
                    </div>
                  );
                })}
              <div className="m-shade-score-row m-shade-score-row--leader">
                <span className="m-shade-score-name">🎨 {leaderName} (Leader)</span>
                <span className="m-shade-score-pts m-shade-score-pts--ok">+{latestRound.leaderScore}</span>
              </div>
            </div>
          )}

          {latestRound && game.settings.phaseEndsAt && (
            <div className="m-shade-auto-advance">
              <RoundCountdown
                endsAt={game.settings.phaseEndsAt}
                label={game.settings.currentRound >= totalRounds ? "Finishing game" : "Next round"}
              />
            </div>
          )}
          {!latestRound && (
            <div className="m-waiting">
              <div className="m-pulse" />
              <p>Calculating scores…</p>
            </div>
          )}
        </div>
      )}

      {/* ── FINISHED ── */}
      {!isSpectator && phase === "finished" && (
        <div className="m-section">
          <h3 className="m-label" style={{ textAlign: "center" }}>🏆 Game Over!</h3>

          <div className="m-shade-final-scores">
            {game.players
              .toSorted((a, b) => b.totalScore - a.totalScore)
              .map((p, i) => {
                const name = sessionById[p.sessionId] ?? getDisplayName(p.name, p.sessionId);
                const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : "";
                return (
                  <div key={p.sessionId} className={`m-shade-final-row${i === 0 ? " m-shade-final-row--winner" : ""}`}>
                    <span className="m-shade-final-rank">{medal || `#${i + 1}`}</span>
                    <span className="m-shade-final-name">
                      {name}
                      {p.sessionId === sessionId && <span className="m-badge-small m-badge-small--you">you</span>}
                    </span>
                    <span className="m-shade-final-pts">{p.totalScore} pts</span>
                  </div>
                );
              })}
          </div>

          <div className="m-actions m-bottom-safe">
            {isHost ? (
              <>
                <button className="m-btn m-btn-primary"
                  onClick={() => void zero.mutate(mutators.shadeSignal.resetToLobby({ gameId, hostId: sessionId }))}>
                  Play Again
                </button>
                <button className="m-btn m-btn-muted"
                  onClick={() => {
                    void zero.mutate(mutators.shadeSignal.endGame({ gameId, hostId: sessionId }))
                      .client.then(() => navigate("/"))
                      .catch(() => showToast("Couldn't end game", "error"));
                  }}>
                  End Game
                </button>
              </>
            ) : (
              <button className="m-btn m-btn-muted" onClick={() => navigate("/")}>Back to Home</button>
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
