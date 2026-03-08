import { mutators, queries } from "@games/shared";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { FiLogIn, FiCopy, FiCheck, FiSend } from "react-icons/fi";
import { PiCrownSimpleFill } from "react-icons/pi";
import { ColorGrid, generateGridColor } from "../components/shade/ColorGrid";
import { RoundCountdown } from "../components/shared/RoundCountdown";
import { usePresenceSocket } from "../hooks/usePresenceSocket";
import { addRecentGame } from "../lib/session";
import { showToast } from "../lib/toast";

type ShadePhase = "lobby" | "clue1" | "guess1" | "clue2" | "guess2" | "reveal" | "finished" | "ended";

const phaseLabels: Record<ShadePhase, string> = {
  lobby: "Lobby",
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
  if (dist === 1) return 4;
  if (dist === 2) return 3;
  if (dist <= 4) return 2;
  if (dist <= 6) return 1;
  return 0;
}

function chebyshevDist(a: { row: number; col: number }, b: { row: number; col: number }): number {
  return Math.max(Math.abs(a.row - b.row), Math.abs(a.col - b.col));
}

function distLabel(dist: number): string {
  if (dist === 0) return "Exact!";
  return `${dist} away`;
}

const ZONE_LEGEND = [
  { pts: 5, label: "Exact", cls: "shade-scoring-swatch--5" },
  { pts: 4, label: "1 away", cls: "shade-scoring-swatch--4" },
  { pts: 3, label: "2 away", cls: "shade-scoring-swatch--3" },
  { pts: 2, label: "3-4 away", cls: "shade-scoring-swatch--2" },
  { pts: 1, label: "5-6 away", cls: "shade-scoring-swatch--1" },
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

export function ShadeSignalPage({ sessionId }: { sessionId: string }) {
  const zero = useZero();
  const navigate = useNavigate();
  const params = useParams();
  const gameId = params.id ?? "";
  const [games] = useQuery(queries.shadeSignal.byId({ id: gameId }));
  const [sessions] = useQuery(queries.sessions.byGame({ gameType: "shade_signal", gameId }));
  const game = games[0];
  const [clue, setClue] = useState("");
  const [selectedCell, setSelectedCell] = useState<{ row: number; col: number } | null>(null);
  const [guessLocked, setGuessLocked] = useState(false);
  const [copied, setCopied] = useState(false);
  const prevAnnouncementRef = useRef<{ text: string; ts: number } | null>(null);

  usePresenceSocket({ sessionId, gameId, gameType: "shade_signal" });

  const isHost = game?.host_id === sessionId;
  const isLeader = game?.leader_id === sessionId;
  const me = useMemo(() => game?.players.find((p) => p.sessionId === sessionId), [game, sessionId]);
  const inGame = Boolean(me);

  const inGameRef = useRef(inGame);
  const phaseRef = useRef(game?.phase);
  inGameRef.current = inGame;
  phaseRef.current = game?.phase;

  // Cleanup on unmount
  useEffect(() => {
    let active = false;
    const timer = setTimeout(() => { active = true; }, 500);
    return () => {
      clearTimeout(timer);
      if (active && inGameRef.current && phaseRef.current !== "ended") {
        void zero.mutate(mutators.shadeSignal.leave({ gameId, sessionId }));
      }
    };
  }, [gameId, sessionId, zero]);

  const sessionById = useMemo(() => {
    return sessions.reduce<Record<string, string>>((acc, s) => {
      acc[s.id] = s.name ?? s.id.slice(0, 6);
      return acc;
    }, {});
  }, [sessions]);

  useEffect(() => {
    if (!game) return;
    addRecentGame({ id: game.id, code: game.code, gameType: "shade_signal" });
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
    if (!phaseEnd) return;
    const activePhases: ShadePhase[] = ["clue1", "guess1", "clue2", "guess2"];
    if (!activePhases.includes(game.phase as ShadePhase)) return;
    const remaining = phaseEnd - Date.now();
    if (remaining <= 0) {
      void zero.mutate(mutators.shadeSignal.advanceTimer({ gameId }));
      return;
    }
    const timer = setTimeout(() => {
      void zero.mutate(mutators.shadeSignal.advanceTimer({ gameId }));
    }, remaining + 500);
    return () => clearTimeout(timer);
  }, [game?.settings.phaseEndsAt, game?.phase, gameId, zero]);

  // Announcement watcher
  useEffect(() => {
    if (!game?.announcement || isHost) return;
    const prev = prevAnnouncementRef.current;
    const cur = game.announcement;
    if (prev && prev.text === cur.text && Math.abs(cur.ts - prev.ts) < 3000) return;
    prevAnnouncementRef.current = cur;
    showToast(`📢 ${cur.text}`, "info");
  }, [game?.announcement, isHost]);

  // Reset selected cell on phase change
  useEffect(() => {
    setSelectedCell(null);
    setGuessLocked(false);
  }, [game?.phase]);

  // Auto-reveal: when entering reveal phase, auto-calculate scores
  useEffect(() => {
    if (!game || game.phase !== "reveal") return;
    // Only the host triggers the reveal mutator to avoid duplicates
    if (game.host_id !== sessionId) return;
    const latest = game.round_history[game.round_history.length - 1];
    if (latest) return; // already revealed
    const timer = setTimeout(() => {
      void zero.mutate(mutators.shadeSignal.reveal({ gameId }));
    }, 600);
    return () => clearTimeout(timer);
  }, [game?.phase, game?.round_history.length, gameId, sessionId, zero]);

  // Auto-next-round: after scores are shown, auto-advance after 8 seconds
  const [nextRoundCountdown, setNextRoundCountdown] = useState<number | null>(null);
  const nextRoundTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!game || game.phase !== "reveal") {
      setNextRoundCountdown(null);
      if (nextRoundTimerRef.current) clearInterval(nextRoundTimerRef.current);
      return;
    }
    const latest = game.round_history[game.round_history.length - 1];
    if (!latest) return; // scores not calculated yet
    if (game.host_id !== sessionId) {
      // Non-host: show countdown but don't trigger advance
      setNextRoundCountdown(8);
      nextRoundTimerRef.current = setInterval(() => {
        setNextRoundCountdown((prev) => (prev != null && prev > 0 ? prev - 1 : null));
      }, 1000);
      return () => { if (nextRoundTimerRef.current) clearInterval(nextRoundTimerRef.current); };
    }
    // Host: countdown then auto-advance
    setNextRoundCountdown(8);
    nextRoundTimerRef.current = setInterval(() => {
      setNextRoundCountdown((prev) => (prev != null && prev > 0 ? prev - 1 : null));
    }, 1000);
    const advanceTimer = setTimeout(() => {
      void zero.mutate(mutators.shadeSignal.nextRound({ gameId, hostId: sessionId }));
    }, 8500);
    return () => {
      clearTimeout(advanceTimer);
      if (nextRoundTimerRef.current) clearInterval(nextRoundTimerRef.current);
    };
  }, [game?.phase, game?.round_history.length, gameId, sessionId, zero]);

  // ── All hooks MUST be above the early-return guard ──
  const phase = (game?.phase ?? "lobby") as ShadePhase;

  const target = game?.target_row != null && game?.target_col != null
    ? { row: game.target_row, col: game.target_col }
    : null;

  const targetColor = target && game
    ? generateGridColor(target.row, target.col, game.grid_rows, game.grid_cols, game.grid_seed)
    : null;

  const guessMarkers = useMemo(() => {
    if (!game || (phase !== "reveal" && phase !== "finished")) return [];
    const latest = game.round_history[game.round_history.length - 1];
    return game.guesses.map((g) => {
      const name = sessionById[g.sessionId] ?? g.sessionId.slice(0, 6);
      const dist = target
        ? chebyshevDist({ row: g.row, col: g.col }, target)
        : null;
      const pts = latest?.scores[g.sessionId] ?? null;
      const roundLabel = g.round === 1 ? "Clue 1" : "Clue 2";
      const tooltip = [
        name,
        roundLabel,
        dist != null ? (dist === 0 ? "Exact! 🎯" : `${dist} away`) : null,
        pts != null ? `+${pts} pts` : null,
      ].filter(Boolean).join(" · ");
      return {
        sessionId: g.sessionId,
        name,
        row: g.row,
        col: g.col,
        isOwn: g.sessionId === sessionId,
        tooltip,
      };
    });
  }, [game, phase, sessionById, sessionId, target]);

  const myCurrentGuess = useMemo(() => {
    if (!game || (phase !== "guess1" && phase !== "guess2")) return null;
    const round = phase === "guess1" ? 1 : 2;
    return game.guesses.find((g) => g.sessionId === sessionId && g.round === round) ?? null;
  }, [game, phase, sessionId]);

  // Auto-lock if user already submitted a guess (e.g. page reload)
  useEffect(() => {
    if (myCurrentGuess && !guessLocked) {
      setGuessLocked(true);
    }
  }, [myCurrentGuess]); // eslint-disable-line react-hooks/exhaustive-deps

  const currentRoundGuesses = useMemo(() => {
    if (!game || (phase !== "guess1" && phase !== "guess2")) return 0;
    const round = phase === "guess1" ? 1 : 2;
    return new Set(game.guesses.filter((g) => g.round === round).map((g) => g.sessionId)).size;
  }, [game, phase]);

  // Set of player IDs who have locked in for the current guess round
  const lockedInIds = useMemo(() => {
    if (!game || (phase !== "guess1" && phase !== "guess2")) return new Set<string>();
    const round = phase === "guess1" ? 1 : 2;
    return new Set(game.guesses.filter((g) => g.round === round).map((g) => g.sessionId));
  }, [game, phase]);

  if (!game) {
    return (
      <div className="game-page">
        <div className="game-empty"><p>Game not found</p></div>
      </div>
    );
  }

  const isGameActive = phase !== "lobby" && phase !== "ended" && phase !== "finished";
  const leaderName = game.leader_id ? (sessionById[game.leader_id] ?? "???") : "";
  const totalRounds = game.leader_order.length * game.settings.roundsPerPlayer;

  const copyCode = () => {
    void navigator.clipboard.writeText(game.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const submitClue = async (e: FormEvent) => {
    e.preventDefault();
    if (!clue.trim()) return;
    try {
      const result = await zero.mutate(mutators.shadeSignal.submitClue({ gameId, sessionId, text: clue.trim() })).server;
      if (result.type === "error") {
        showToast(result.error.message, "error");
        return;
      }
      setClue("");
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : "Failed to submit clue", "error");
    }
  };

  const submitGuess = async () => {
    if (!selectedCell) return;
    try {
      const result = await zero.mutate(
        mutators.shadeSignal.submitGuess({ gameId, sessionId, row: selectedCell.row, col: selectedCell.col })
      ).server;
      if (result.type === "error") {
        showToast(result.error.message, "error");
      } else {
        setGuessLocked(true);
      }
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : "Failed to submit guess", "error");
    }
  };

  const guessersCount = game.players.filter((p) => p.sessionId !== game.leader_id).length;
  const latestRound = game.round_history[game.round_history.length - 1];

  return (
    <div className="game-page shade-page">
      {/* ── Header ──────────────────────────────────── */}
      <div className="game-header">
        <div className="game-header-left">
          <h1 className="game-title">Shade Signal</h1>
          {isHost && (
            <span className="badge host-badge" data-tooltip="You created this game" data-tooltip-variant="info">
              <PiCrownSimpleFill size={12} /> Host
            </span>
          )}
          <span className={`badge ${phaseVariants[phase]}`}>
            {phaseLabels[phase]}
          </span>
          {isGameActive && (
            <span className="badge">
              Rd {game.settings.currentRound}/{totalRounds}
            </span>
          )}
          {(phase === "guess1" || phase === "guess2") && (
            <RoundCountdown endsAt={game.settings.phaseEndsAt} label="Time" />
          )}
        </div>
        <button className="game-code-btn" onClick={copyCode} data-tooltip={copied ? "Copied!" : "Click to copy room code"} data-tooltip-variant="info">
          {copied ? <FiCheck size={14} /> : <FiCopy size={14} />}
          <span>{game.code}</span>
        </button>
      </div>

      {/* ── Players bar ─────────────────────────────── */}
      <div className="game-section">
        <h3 className="game-section-label">
          Players <span className="game-section-count">{game.players.length}</span>
        </h3>
        <div className="game-players-grid">
          {game.players.map((player) => {
            const name = sessionById[player.sessionId] ?? player.sessionId.slice(0, 6);
            const initial = (name[0] ?? "?").toUpperCase();
            const isMe = player.sessionId === sessionId;
            const isCurrentLeader = player.sessionId === game.leader_id;
            const isGuessPhase = phase === "guess1" || phase === "guess2";
            const isLockedIn = isGuessPhase && !isCurrentLeader && lockedInIds.has(player.sessionId);
            return (
              <div
                key={player.sessionId}
                className={`game-player-chip${isMe ? " game-player-chip--me" : ""}${isCurrentLeader ? " game-player-chip--leader" : ""}${isLockedIn ? " game-player-chip--locked" : ""}`}
                data-tooltip={`${name}${isCurrentLeader ? " — Leader 🎨" : ""}${isLockedIn ? " — Locked in ✅" : ""}${isMe ? " (you)" : ""}${isGameActive ? ` — ${player.totalScore} pts` : ""}`}
                data-tooltip-variant={isCurrentLeader ? "warn" : isLockedIn ? "success" : "info"}
              >
                <div className={`game-player-avatar${isCurrentLeader ? " game-player-avatar--leader" : ""}`}>
                  {isCurrentLeader ? "🎨" : isLockedIn ? "✅" : initial}
                </div>
                <span className="game-player-name">{name}</span>
                {isGameActive && (
                  <span className="badge" style={{ fontSize: "0.55rem" }}>{player.totalScore}</span>
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
          <p className="game-join-text">You're not in this lobby yet.</p>
          <button
            className="btn btn-primary game-action-btn"
            onClick={() =>
              void zero
                .mutate(mutators.shadeSignal.join({ gameId, sessionId }))
                .client.catch(() => showToast("Couldn't join game", "error"))
            }
          >
            <FiLogIn size={16} /> Join Game
          </button>
        </div>
      )}

      {phase === "lobby" && inGame && (
        <div className="game-section shade-lobby">
          <div className="shade-lobby-top">
            <div className="shade-lobby-info">
              <h3 className="shade-lobby-heading">How to play</h3>
              <div className="shade-rules-cards">
                <div className="shade-rule-card">
                  <span className="shade-rule-icon">🎨</span>
                  <div className="shade-rule-text">
                    <strong>Leader</strong> sees a target color and gives <strong>1-word</strong> clue
                  </div>
                </div>
                <div className="shade-rule-card">
                  <span className="shade-rule-icon">🔍</span>
                  <div className="shade-rule-text">
                    <strong>Guessers</strong> pick the color they think the leader means
                  </div>
                </div>
                <div className="shade-rule-card">
                  <span className="shade-rule-icon">💡</span>
                  <div className="shade-rule-text">
                    Leader gives a <strong>2nd clue</strong>, guessers can adjust their pick
                  </div>
                </div>
                <div className="shade-rule-card">
                  <span className="shade-rule-icon">🎯</span>
                  <div className="shade-rule-text">
                    Closer = more pts! The colored zones show scoring ranges
                  </div>
                </div>
              </div>
              <ScoringLegend />
            </div>

            {/* Preview grid */}
            <div className="shade-lobby-preview">
              <ColorGrid
                rows={game.grid_rows}
                cols={game.grid_cols}
                seed={game.grid_seed}
                target={{ row: Math.floor(game.grid_rows / 2), col: Math.floor(game.grid_cols / 2) }}
                showTarget
                showZones
                compact
              />
            </div>
          </div>

          <div className="game-actions">
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

      {/* ── CLUE PHASE (Leader) ─────────────────────── */}
      {(phase === "clue1" || phase === "clue2") && isLeader && (
        <div className="game-section shade-clue-section">
          <div className="shade-clue-leader-info">
            <h3>You are the Leader! 🎨</h3>
            <p>
              {phase === "clue1"
                ? <>Give a <strong>one-word</strong> clue to help guessers find your target color.</>
                : <>Give a <strong>second clue</strong> (up to 2 words) to help guessers find your target color.</>}
            </p>
            {game.settings.hardMode && (
              <p className="shade-hard-mode-warning">🚫 No Color Names — you can't use words like red, blue, green, etc.</p>
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
          />

          <form className="shade-clue-form" onSubmit={submitClue}>
            <input
              className="input shade-clue-input"
              value={clue}
              onChange={(e) => setClue(e.target.value)}
              placeholder={phase === "clue1" ? "One word clue…" : "Second clue (1-2 words)…"}
              maxLength={60}
              autoFocus
            />
            <button className="btn btn-primary" type="submit" disabled={!clue.trim()}>
              <FiSend size={14} /> Send
            </button>
          </form>
          {game.settings.hardMode && (
            <p className="shade-hard-mode-warn">🚫 Hard mode: no color-family names (red, blue, green…)</p>
          )}
        </div>
      )}

      {/* ── CLUE PHASE (Guessers) ───────────────────── */}
      {(phase === "clue1" || phase === "clue2") && !isLeader && inGame && (
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
      {(phase === "guess1" || phase === "guess2") && !isLeader && inGame && (
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
              <button
                className="btn btn-primary game-action-btn"
                disabled={!selectedCell}
                onClick={() => void submitGuess()}
              >
                Lock In Guess
              </button>
            )}
          </div>

          <p className="shade-guess-counter">
            {currentRoundGuesses}/{guessersCount} guessers locked in
          </p>
        </div>
      )}

      {/* ── GUESS PHASE (Leader / spectator) ────────── */}
      {(phase === "guess1" || phase === "guess2") && (isLeader || !inGame) && (
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
      {phase === "reveal" && (
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
          />
          <ScoringLegend />

          {/* Score table */}
          {latestRound && (
            <div className="shade-score-table">
              <h4>Round Scores</h4>
              <div className="shade-score-rows">
                {game.players
                  .filter((p) => p.sessionId !== game.leader_id)
                  .map((p) => {
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
                          {sessionById[p.sessionId] ?? p.sessionId.slice(0, 6)}
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
          {latestRound && nextRoundCountdown != null && (
            <div className="shade-auto-advance">
              <span className="shade-auto-advance-text">
                {game.settings.currentRound >= totalRounds ? "Finishing game" : "Next round"} in {nextRoundCountdown}s…
              </span>
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
      {phase === "finished" && (
        <div className="game-section shade-finished-section">
          <h3 className="shade-finished-title">🏆 Game Over!</h3>

          <div className="shade-final-scores">
            {[...game.players]
              .sort((a, b) => b.totalScore - a.totalScore)
              .map((p, i) => {
                const name = sessionById[p.sessionId] ?? p.sessionId.slice(0, 6);
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
                    void zero.mutate(mutators.shadeSignal.endGame({ gameId, hostId: sessionId }));
                    navigate("/");
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
    </div>
  );
}
