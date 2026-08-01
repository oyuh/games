import { mutators, queries } from "@games/shared";
import { optimistic, useQuery, useZero } from "../lib/zero";
import "../styles/game-shared.css";
import "../styles/shade-signal.css";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { FiLogIn, FiCopy, FiCheck, FiSend, FiHelpCircle } from "react-icons/fi";

import { ColorGrid, generateGridColor } from "../components/shade/ColorGrid";
import { InSessionModal } from "../components/shared/InSessionModal";
import { LobbyVisibilityToggle } from "../components/shared/LobbyVisibilityToggle";
import { RoundCountdown } from "../components/shared/RoundCountdown";
import { SpectatorBadge, HostBadge } from "../components/shared/SpectatorBadge";
import { SpectatorOverlay } from "../components/shared/SpectatorOverlay";
import { BorringAvatar } from "../components/shared/BorringAvatar";
import { addRecentGame, ensureName, getDisplayName, leaveCurrentGame, SessionGameType } from "../lib/session";
import { showToast } from "../lib/toast";
import { useIsMobile } from "../hooks/useIsMobile";
import { callGameSecretInit, callGameSecretPreReveal } from "../lib/game-secrets";

import { MobileShadeSignalPage } from "../mobile/pages/MobileShadeSignalPage";
import { ShadeDemo } from "../components/demos/ShadeDemo";
import { useShadeSignalGame, chebyshevDist, type ShadePhase } from "../hooks/useShadeSignalGame";
import { GameIcon } from "../components/shared/GameIcon";


const phaseLabels: Record<ShadePhase, string> = {
  lobby: "Lobby",
  picking: "Pick Color",
  clue1: "Clue 1",
  guess1: "Guess 1",
  clue2: "Clue 2",
  guess2: "Guess 2",
  reveal: "Reveal",
  finished: "Finished",
  ended: "Ended",
};

const phaseVariants: Record<ShadePhase, string> = {
  lobby: "",
  picking: "badge-warn",
  clue1: "badge-warn",
  guess1: "badge-primary",
  clue2: "badge-warn",
  guess2: "badge-primary",
  reveal: "badge-success",
  finished: "badge-success",
  ended: "",
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

function ScoringLegend() {
  return (
    <div className="shade-scoring-legend">
      {ZONE_LEGEND.map((z) => (
        <span key={z.pts} className="shade-scoring-legend-item">
          <span className={`shade-scoring-swatch ${z.cls}`} />
          {z.label} = {z.pts}pt{z.pts > 1 ? "s" : ""}
        </span>
      ))}
    </div>
  );
}

function ShadeSignalPageDesktop({ sessionId }: { sessionId: string }) {

  const [pickingCell, setPickingCell] = useState<{ row: number; col: number } | null>(null);
  const [copied, setCopied] = useState(false);
  const [showDemo, setShowDemo] = useState(false);

  const {
    zero, navigate, gameId, game, me, isHost, isLeader, inGame, isSpectator,
    sessionById, playerIndexMap, phase, target, targetColor,
    clue, setClue, selectedCell, setSelectedCell,
    guessLocked, setGuessLocked, lobbyPreviewTarget, setLobbyPreviewTarget,
    clueInputRef, activeGameType, activeGameId, inAnotherGame,
    showInSessionModal, setShowInSessionModal,
    joiningFromOtherGame, setJoiningFromOtherGame,
    guessMarkerData, myCurrentGuess, lockedInIds, currentRoundGuesses,
    isGameActive, leaderName, totalRounds, guessersCount, latestRound,
    submitClue, submitGuess, handleJoinClick, confirmLeaveAndJoin,
  } = useShadeSignalGame(sessionId);

  // Desktop wording: one line per fact.
  const guessMarkers = guessMarkerData.map((m) => ({
    sessionId: m.sessionId, name: m.name, row: m.row, col: m.col, isOwn: m.isOwn,
    tooltip: [
      `${m.name}${m.isOwn ? " (you)" : ""}`,
      `Guess: ${m.roundLabel}`,
      m.dist != null ? (m.dist === 0 ? "Distance: Exact! 🎯" : `Distance: ${m.dist} away`) : null,
      m.pts != null ? `Points: +${m.pts}` : null,
    ].filter(Boolean).join("\n"),
  }));

  // Leader sees guess1 markers while writing clue2
  const leaderGuess1Markers = (phase === "clue2" && isLeader && game)
    ? game.guesses.filter((g) => g.round === 1).map((g) => {
        const name = sessionById[g.sessionId] ?? g.sessionId;
        return { sessionId: g.sessionId, name, row: g.row, col: g.col, isOwn: false, tooltip: `${name}'s guess 1` };
      })
    : [];

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

  const copyCode = () => {
    void navigator.clipboard.writeText(game.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };


  return (
    <div className="game-page shade-page" data-game-theme="shade">
      {/* ── Header ──────────────────────────────────── */}
      <div className="game-header">
        <div className="game-header-left">
          <div className="game-header-icon">
            <GameIcon game="shade" size={20} />
          </div>
          <h1 className="game-title">Shade Signal</h1>
          <span className={`badge ${phaseVariants[phase]}`} data-tooltip={phase === "lobby" ? "Waiting for host to start" : phase === "clue1" ? "Leader gives their 1st clue" : phase === "guess1" ? "Guessers pick a cell (1st guess)" : phase === "clue2" ? "Leader gives a 2nd clue" : phase === "guess2" ? "Guessers pick again (2nd guess)" : phase === "reveal" ? "Showing the target & scores" : phase === "finished" ? "All rounds complete" : "Game ended"} data-tooltip-variant="info">
            {phaseLabels[phase]}
          </span>
          {isGameActive && (
            <span className="badge" data-tooltip={`Round ${game.settings.currentRound} of ${totalRounds} total`} data-tooltip-variant="info">
              Rd {game.settings.currentRound}/{totalRounds}
            </span>
          )}
          {(phase === "guess1" || phase === "guess2") && (
            <span data-tooltip="Time left to lock in a guess" data-tooltip-variant="info">
              <RoundCountdown endsAt={game.settings.phaseEndsAt} label="Time" />
            </span>
          )}
        </div>
        <div className="game-header-right">
          {isSpectator && <SpectatorBadge />}
          {isHost && <HostBadge />}
          <button className="game-code-btn" onClick={copyCode} data-tooltip={copied ? "Copied!" : "Click to copy room code"} data-tooltip-variant="info">
            {copied ? <FiCheck size={14} /> : <FiCopy size={14} />}
            <span>{game.code}</span>
          </button>
        </div>
      </div>

      {/* ── Players bar ─────────────────────────────── */}
      <div className="game-section">
        <h3 className="game-section-label">
          Players <span className="game-section-count">{game.players.length}</span>
        </h3>
        <div className="game-players-grid">
          {game.players.map((player, playerIndex) => {
            const name = sessionById[player.sessionId] ?? getDisplayName(player.name, player.sessionId);
            const isMe = player.sessionId === sessionId;
            const isCurrentLeader = player.sessionId === game.leader_id;
            const isGuessPhase = phase === "guess1" || phase === "guess2";
            const isLockedIn = isGuessPhase && !isCurrentLeader && lockedInIds.has(player.sessionId);
            return (
              <div
                key={player.sessionId}
                className={`game-player-chip${isMe ? " game-player-chip--me" : ""}${isCurrentLeader ? " game-player-chip--leader" : ""}${isLockedIn ? " game-player-chip--locked" : ""}`}
                data-tooltip={`${name}${isCurrentLeader ? " - Leader 🎨" : ""}${isLockedIn ? " - Locked in ✅" : ""}${isMe ? " (you)" : ""}${isGameActive ? ` - ${player.totalScore} pts` : ""}`}
                data-tooltip-variant={isCurrentLeader ? "warn" : isLockedIn ? "success" : "info"}
              >
                <div className={`game-player-avatar${isCurrentLeader ? " game-player-avatar--leader" : ""}`}>
                  {isCurrentLeader ? "🎨" : isLockedIn ? "✅" : (
                    <BorringAvatar
                      seed={player.sessionId}
                      playerIndex={playerIndex}
                    />
                  )}
                </div>
                <span className="game-player-name">{name}</span>
                {isGameActive && (
                  <span className="badge" style={{ fontSize: "0.75rem" }}>{player.totalScore}</span>
                )}
                {isMe && <span className="game-player-you">you</span>}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── LOBBY ───────────────────────────────────── */}
      {phase === "lobby" && !inGame && (
        <div className="game-section game-join-prompt">
          <p className="game-join-text">{isSpectator ? "You're spectating. Join to play!" : "You're not in this lobby yet."}</p>
          <button
            className="btn btn-primary game-action-btn"
            onClick={handleJoinClick}
          >
            <FiLogIn size={16} /> Join Game
          </button>
        </div>
      )}

      {phase === "lobby" && inGame && (
        <div className="game-section shade-lobby">
          <div className="shade-lobby-grid-explorer">
            <p className="shade-lobby-grid-hint">Click any cell to set a target, then hover to see scores</p>
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
            {lobbyPreviewTarget && <ScoringLegend />}
          </div>

          <div className="game-actions">
            {isHost && <LobbyVisibilityToggle gameType="shade_signal" gameId={gameId} sessionId={sessionId} isPublic={game.is_public} />}
            {isHost && (
              <button
                className="btn btn-primary game-action-btn"
                disabled={game.players.length < 3}
                onClick={() => void zero.mutate(mutators.shadeSignal.start({ gameId, hostId: sessionId }))}
              >
                {game.players.length < 3
                  ? `Need ${3 - game.players.length} more player${3 - game.players.length > 1 ? "s" : ""}`
                  : "Start Game"}
              </button>
            )}
            <button
              className="btn btn-muted"
              onClick={() => void zero.mutate(mutators.shadeSignal.leave({ gameId, sessionId }))}
            >
              Leave
            </button>
          </div>
        </div>
      )}


      {isSpectator && phase !== "lobby" && (
        <SpectatorOverlay
          playerCount={game.players.length}
          phase={phase}
          onLeave={() => void zero.mutate(mutators.shadeSignal.leaveSpectator({ gameId, sessionId })).client.then(() => navigate("/"))}
        />
      )}

      {/* ── PICKING PHASE (Leader chooses target color) ── */}
      {!isSpectator && phase === "picking" && isLeader && (
        <div className="game-section shade-clue-section">
          <div className="shade-clue-leader-info">
            <h3>Pick your target color! 🎨</h3>
            <p>Tap the color you want to give clues about.</p>
          </div>

          <ColorGrid
            rows={game.grid_rows}
            cols={game.grid_cols}
            seed={game.grid_seed}
            selected={pickingCell}
            onSelect={(r, c) => setPickingCell({ row: r, col: c })}
            interactive
          />

          {pickingCell && (
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", justifyContent: "center", marginTop: "0.5rem" }}>
              <div style={{
                width: "32px", height: "32px", borderRadius: "6px",
                background: generateGridColor(pickingCell.row, pickingCell.col, game.grid_rows, game.grid_cols, game.grid_seed),
                border: "2px solid rgba(255,255,255,0.3)"
              }} />
              <button
                className="btn btn-primary game-action-btn"
                onClick={() => {
                  void zero.mutate(mutators.shadeSignal.setTarget({
                    gameId, sessionId,
                    row: pickingCell.row, col: pickingCell.col
                  })).server.then(() => callGameSecretInit("shade_signal", gameId, sessionId));
                  setPickingCell(null);
                }}
              >
                Confirm Color
              </button>
            </div>
          )}
        </div>
      )}

      {!isSpectator && phase === "picking" && !isLeader && inGame && (
        <div className="game-section shade-waiting-section">
          <div className="game-waiting">
            <div className="game-waiting-pulse" />
            <p><strong>{leaderName}</strong> is choosing their target color…</p>
          </div>
          <ColorGrid
            rows={game.grid_rows}
            cols={game.grid_cols}
            seed={game.grid_seed}
          />
        </div>
      )}

      {/* ── CLUE PHASE (Leader) ─────────────────────── */}
      {!isSpectator && (phase === "clue1" || phase === "clue2") && isLeader && (
        <div className="game-section shade-clue-section">
          <div className="shade-clue-leader-info">
            <h3>You are the Leader! 🎨</h3>
            <p>
              {phase === "clue1"
                ? <>Give a <strong>one-word</strong> clue to help guessers find your target color.</>
                : <>Give a <strong>second clue</strong> (up to 2 words) to help guessers find your target color.</>}
            </p>
            {game.settings.hardMode && (
              <p className="shade-hard-mode-warning">🚫 No Color Names - you can't use words like red, blue, green, etc.</p>
            )}
            {target && targetColor && (
              <div className="shade-target-preview">
                <div className="shade-target-swatch" style={{ background: targetColor }} />
                <span className="shade-target-label">Your target ↑</span>
              </div>
            )}
          </div>

          <ColorGrid
            rows={game.grid_rows}
            cols={game.grid_cols}
            seed={game.grid_seed}
            target={target}
            showTarget
            markers={phase === "clue2" ? leaderGuess1Markers : []}
            playerIndexMap={playerIndexMap}
          />

          {phase === "clue2" && leaderGuess1Markers.length > 0 && (
            <p style={{ fontSize: "0.75rem", color: "var(--secondary)", textAlign: "center", marginTop: "0.25rem" }}>
              Showing where guessers picked after your first clue
            </p>
          )}

          <form className="shade-clue-form" onSubmit={submitClue}>
            <input
              ref={clueInputRef}
              className="input shade-clue-input"
              value={clue}
              onChange={(e) => setClue(e.target.value)}
              onFocus={(e) => e.currentTarget.select()}
              placeholder={phase === "clue1" ? "One word clue…" : "Second clue (1-2 words)…"}
              maxLength={60}
            />
            <button className="btn btn-primary" type="submit" disabled={!clue.trim()} onMouseDown={(event) => event.preventDefault()}>
              <FiSend size={14} /> Send
            </button>
          </form>
          {game.settings.hardMode && (
            <p className="shade-hard-mode-warn">🚫 Hard mode: no color-family names (red, blue, green…)</p>
          )}
        </div>
      )}

      {/* ── CLUE PHASE (Guessers) ───────────────────── */}
      {!isSpectator && (phase === "clue1" || phase === "clue2") && !isLeader && inGame && (
        <div className="game-section shade-waiting-section">
          <div className="game-waiting">
            <div className="game-waiting-pulse" />
            <p>
              <strong>{leaderName}</strong> is thinking of {phase === "clue1" ? "a first" : "a second"} clue…
            </p>
          </div>
          {game.clue1 && phase === "clue2" && (
            <div className="shade-clue-display">
              <span className="shade-clue-tag">Clue 1</span>
              <span className="shade-clue-word">{game.clue1}</span>
            </div>
          )}
          <ColorGrid
            rows={game.grid_rows}
            cols={game.grid_cols}
            seed={game.grid_seed}
          />
        </div>
      )}

      {/* ── GUESS PHASE (Guessers) ──────────────────── */}
      {!isSpectator && (phase === "guess1" || phase === "guess2") && !isLeader && inGame && (
        <div className="game-section shade-guess-section">
          <div className="shade-clue-display-row">
            {game.clue1 && (
              <div className="shade-clue-display">
                <span className="shade-clue-tag">Clue 1</span>
                <span className="shade-clue-word">{game.clue1}</span>
              </div>
            )}
            {game.clue2 && (
              <div className="shade-clue-display">
                <span className="shade-clue-tag">Clue 2</span>
                <span className="shade-clue-word">{game.clue2}</span>
              </div>
            )}
          </div>

          <p className="shade-guess-prompt">
            {guessLocked
              ? "Your guess is locked in! ✅"
              : "Tap the color you think the leader means!"}
          </p>

          <ColorGrid
            rows={game.grid_rows}
            cols={game.grid_cols}
            seed={game.grid_seed}
            selected={selectedCell ?? (myCurrentGuess ? { row: myCurrentGuess.row, col: myCurrentGuess.col } : null)}
            onSelect={(r, c) => setSelectedCell({ row: r, col: c })}
            interactive={!guessLocked}
          />

          <div className="shade-guess-actions">
            {(selectedCell || (guessLocked && myCurrentGuess)) && (() => {
              const cell = selectedCell ?? (myCurrentGuess ? { row: myCurrentGuess.row, col: myCurrentGuess.col } : null);
              if (!cell) return null;
              return (
                <div className="shade-selected-preview">
                  <div
                    className="shade-preview-swatch"
                    style={{
                      background: generateGridColor(
                        cell.row,
                        cell.col,
                        game.grid_rows,
                        game.grid_cols,
                        game.grid_seed
                      ),
                    }}
                  />
                  <span>{guessLocked ? "Locked in" : "Your pick"}</span>
                </div>
              );
            })()}
            {guessLocked ? (
              <button
                className="btn btn-muted game-action-btn"
                onClick={() => {
                  setGuessLocked(false);
                  setSelectedCell(myCurrentGuess ? { row: myCurrentGuess.row, col: myCurrentGuess.col } : null);
                }}
              >
                Change Guess
              </button>
            ) : (
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <button
                  className="btn btn-primary game-action-btn"
                  disabled={!selectedCell}
                  onClick={() => void submitGuess()}
                >
                  Lock In Guess
                </button>
                {phase === "guess2" && (() => {
                  const g1 = game.guesses.find((g) => g.sessionId === sessionId && g.round === 1);
                  return g1 ? (
                    <button
                      className="btn btn-muted game-action-btn"
                      onClick={() => {
                        setSelectedCell({ row: g1.row, col: g1.col });
                        void optimistic(zero.mutate(
                          mutators.shadeSignal.submitGuess({ gameId, sessionId, row: g1.row, col: g1.col })
                        )).then(() => setGuessLocked(true));
                      }}
                    >
                      Skip (keep guess 1)
                    </button>
                  ) : null;
                })()}
              </div>
            )}
          </div>

          <p className="shade-guess-counter">
            {currentRoundGuesses}/{guessersCount} guessers locked in
          </p>
        </div>
      )}

      {/* ── GUESS PHASE (Leader / spectator) ────────── */}
      {!isSpectator && (phase === "guess1" || phase === "guess2") && (isLeader || !inGame) && (
        <div className="game-section shade-waiting-section">
          <div className="shade-clue-display-row">
            {game.clue1 && (
              <div className="shade-clue-display">
                <span className="shade-clue-tag">Clue 1</span>
                <span className="shade-clue-word">{game.clue1}</span>
              </div>
            )}
            {game.clue2 && (
              <div className="shade-clue-display">
                <span className="shade-clue-tag">Clue 2</span>
                <span className="shade-clue-word">{game.clue2}</span>
              </div>
            )}
          </div>
          <div className="game-waiting">
            <div className="game-waiting-pulse" />
            <p>Guessers are choosing… ({currentRoundGuesses}/{guessersCount})</p>
          </div>
          <ColorGrid
            rows={game.grid_rows}
            cols={game.grid_cols}
            seed={game.grid_seed}
            target={isLeader ? target : null}
            showTarget={isLeader}
          />
        </div>
      )}

      {/* ── REVEAL ──────────────────────────────────── */}
      {!isSpectator && phase === "reveal" && (
        <div className="game-section shade-reveal-section">
          <h3 className="shade-reveal-title">🎯 Reveal!</h3>

          {targetColor && (
            <div className="shade-reveal-target">
              <div className="shade-reveal-swatch" style={{ background: targetColor }} />
              <div className="shade-reveal-info">
                <span>Target Color</span>
                <span className="shade-reveal-clues">
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
          />
          <ScoringLegend />

          {/* Score table */}
          {latestRound && (
            <div className="shade-score-table">
              <h4>Round Scores</h4>
              <div className="shade-score-rows">
                {game.players.reduce<typeof game.players>((players, player) => {
                  if (player.sessionId !== game.leader_id) {
                    players.push(player);
                  }
                  return players;
                }, []).map((p) => {
                    const pts = latestRound.scores[p.sessionId] ?? 0;
                    const g2 = latestRound.guesses.find((g) => g.sessionId === p.sessionId && g.round === 2);
                    const g1 = latestRound.guesses.find((g) => g.sessionId === p.sessionId && g.round === 1);
                    const guess = g2 ?? g1;
                    const dist = guess && target
                      ? chebyshevDist({ row: guess.row, col: guess.col }, target)
                      : null;
                    return (
                      <div key={p.sessionId} className="shade-score-row">
                        <span className="shade-score-name">
                          {sessionById[p.sessionId] ?? getDisplayName(p.name, p.sessionId)}
                          {p.sessionId === sessionId && <span className="game-player-you">you</span>}
                        </span>
                        {dist != null && <span className="shade-score-dist">{distLabel(dist)}</span>}
                        <span className={`shade-score-pts${pts >= 3 ? " shade-score-pts--great" : pts > 0 ? " shade-score-pts--ok" : ""}`}>
                          +{pts}
                        </span>
                      </div>
                    );
                  })}
                {/* Leader score */}
                <div className="shade-score-row shade-score-row--leader">
                  <span className="shade-score-name">
                    🎨 {leaderName} (Leader)
                  </span>
                  <span className="shade-score-pts shade-score-pts--ok">
                    +{latestRound.leaderScore}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Auto-advance countdown */}
          {latestRound && game.settings.phaseEndsAt && (
            <div className="shade-auto-advance">
              <RoundCountdown
                endsAt={game.settings.phaseEndsAt}
                label={game.settings.currentRound >= totalRounds ? "Finishing game" : "Next round"}
              />
            </div>
          )}
          {!latestRound && (
            <div className="shade-auto-advance">
              <div className="game-waiting-pulse" />
              <span className="shade-auto-advance-text">Calculating scores…</span>
            </div>
          )}
        </div>
      )}

      {/* ── FINISHED ────────────────────────────────── */}
      {!isSpectator && phase === "finished" && (
        <div className="game-section shade-finished-section">
          <h3 className="shade-finished-title">🏆 Game Over!</h3>

          <div className="shade-final-scores">
            {game.players
              .toSorted((a, b) => b.totalScore - a.totalScore)
              .map((p, i) => {
                const name = sessionById[p.sessionId] ?? getDisplayName(p.name, p.sessionId);
                const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : "";
                return (
                  <div key={p.sessionId} className={`shade-final-row${i === 0 ? " shade-final-row--winner" : ""}`}>
                    <span className="shade-final-rank">{medal || `#${i + 1}`}</span>
                    <span className="shade-final-name">
                      {name}
                      {p.sessionId === sessionId && <span className="game-player-you">you</span>}
                    </span>
                    <span className="shade-final-pts">{p.totalScore} pts</span>
                  </div>
                );
              })}
          </div>

          <div className="game-actions">
            {isHost && (
              <>
                <button
                  className="btn btn-primary game-action-btn"
                  onClick={() => void zero.mutate(mutators.shadeSignal.resetToLobby({ gameId, hostId: sessionId }))}
                >
                  Play Again
                </button>
                <button
                  className="btn btn-muted"
                  onClick={() => {
                    void zero.mutate(mutators.shadeSignal.endGame({ gameId, hostId: sessionId }))
                      .client.then(() => navigate("/"))
                      .catch(() => showToast("Couldn't end game", "error"));
                  }}
                >
                  End Game
                </button>
              </>
            )}
            {!isHost && (
              <button className="btn btn-muted" onClick={() => navigate("/")}>
                Back to Home
              </button>
            )}
          </div>
        </div>
      )}

      {showDemo && <ShadeDemo onClose={() => setShowDemo(false)} />}

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

export function ShadeSignalPage({ sessionId }: { sessionId: string }) {
  const isMobile = useIsMobile();
  if (isMobile) return <MobileShadeSignalPage sessionId={sessionId} />;
  return <ShadeSignalPageDesktop sessionId={sessionId} />;
}
