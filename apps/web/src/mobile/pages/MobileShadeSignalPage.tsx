import { mutators, queries } from "@games/shared";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { FiClock, FiLogIn, FiSend } from "react-icons/fi";
import { ColorGrid, generateGridColor } from "../../components/shade/ColorGrid";
import { MobileGameHeader } from "../components/MobileGameHeader";
import { MobileGameNotFound } from "../components/MobileGameNotFound";
import { RoundCountdown } from "../../components/shared/RoundCountdown";
import { usePresenceSocket } from "../../hooks/usePresenceSocket";
import { addRecentGame } from "../../lib/session";
import { showToast } from "../../lib/toast";
import { useMobileHostRegister } from "../../lib/mobile-host-context";

type ShadePhase = "lobby" | "clue1" | "guess1" | "clue2" | "guess2" | "reveal" | "finished" | "ended";

const phaseLabels: Record<ShadePhase, string> = {
  lobby: "Lobby", clue1: "Clue 1", guess1: "Guess 1", clue2: "Clue 2",
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

function chebyshevDist(a: { row: number; col: number }, b: { row: number; col: number }): number {
  return Math.max(Math.abs(a.row - b.row), Math.abs(a.col - b.col));
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

function MobileScoringLegend() {
  return (
    <div className="m-shade-legend">
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
  const [lobbyPreviewTarget, setLobbyPreviewTarget] = useState<{ row: number; col: number } | null>(null);
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

  useMobileHostRegister(
    isHost && game
      ? { type: "shade_signal", gameId, hostId: game.host_id, players: game.players.map((p) => ({ sessionId: p.sessionId, name: sessionById[p.sessionId] ?? null })) }
      : null
  );

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
    const activePhases: ShadePhase[] = ["clue1", "guess1", "clue2", "guess2", "reveal"];
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

  useEffect(() => {
    if (!game?.announcement || isHost) return;
    const prev = prevAnnouncementRef.current;
    const cur = game.announcement;
    if (prev && prev.text === cur.text && Math.abs(cur.ts - prev.ts) < 3000) return;
    prevAnnouncementRef.current = cur;
    showToast(`📢 ${cur.text}`, "info");
  }, [game?.announcement, isHost]);

  useEffect(() => {
    if (game?.phase === "guess2") {
      const g1 = game.guesses.find((g) => g.sessionId === sessionId && g.round === 1);
      setSelectedCell(g1 ? { row: g1.row, col: g1.col } : null);
    } else {
      setSelectedCell(null);
    }
    setGuessLocked(false);
  }, [game?.phase]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!game || game.phase !== "reveal") return;
    if (game.host_id !== sessionId) return;
    const latest = game.round_history[game.round_history.length - 1];
    if (latest) return;
    const timer = setTimeout(() => {
      void zero.mutate(mutators.shadeSignal.reveal({ gameId }));
    }, 600);
    return () => clearTimeout(timer);
  }, [game?.phase, game?.round_history.length, gameId, sessionId, zero]);

  const phase = (game?.phase ?? "lobby") as ShadePhase;

  // Inline countdown for active phases
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
      const dist = target ? chebyshevDist({ row: g.row, col: g.col }, target) : null;
      const pts = latest?.scores[g.sessionId] ?? null;
      const roundLabel = g.round === 1 ? "Clue 1" : "Clue 2";
      const tooltip = [name, roundLabel, dist != null ? (dist === 0 ? "Exact! 🎯" : `${dist} away`) : null, pts != null ? `+${pts} pts` : null].filter(Boolean).join(" · ");
      return { sessionId: g.sessionId, name, row: g.row, col: g.col, isOwn: g.sessionId === sessionId, tooltip };
    });
  }, [game, phase, sessionById, sessionId, target]);

  const myCurrentGuess = useMemo(() => {
    if (!game || (phase !== "guess1" && phase !== "guess2")) return null;
    const round = phase === "guess1" ? 1 : 2;
    return game.guesses.find((g) => g.sessionId === sessionId && g.round === round) ?? null;
  }, [game, phase, sessionId]);

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

  const lockedInIds = useMemo(() => {
    if (!game || (phase !== "guess1" && phase !== "guess2")) return new Set<string>();
    const round = phase === "guess1" ? 1 : 2;
    return new Set(game.guesses.filter((g) => g.round === round).map((g) => g.sessionId));
  }, [game, phase]);

  if (!game) return <MobileGameNotFound theme="shade" />;

  const isGameActive = phase !== "lobby" && phase !== "ended" && phase !== "finished";
  const leaderName = game.leader_id ? (sessionById[game.leader_id] ?? "???") : "";
  const totalRounds = game.leader_order.length * game.settings.roundsPerPlayer;

  const submitClue = async (e: FormEvent) => {
    e.preventDefault();
    if (!clue.trim()) return;
    try {
      const result = await zero.mutate(mutators.shadeSignal.submitClue({ gameId, sessionId, text: clue.trim() })).server;
      if (result.type === "error") { showToast(result.error.message, "error"); return; }
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
      if (result.type === "error") { showToast(result.error.message, "error"); }
      else { setGuessLocked(true); }
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : "Failed to submit guess", "error");
    }
  };

  const guessersCount = game.players.filter((p) => p.sessionId !== game.leader_id).length;
  const latestRound = game.round_history[game.round_history.length - 1];

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
        {timeLeft != null && (() => {
          const mm = String(Math.floor(timeLeft / 60)).padStart(2, "0");
          const ss = String(timeLeft % 60).padStart(2, "0");
          return (
            <span className={`m-badge ${timeLeft <= 10 ? "m-badge--danger" : "m-badge--warn"}`}>
              <FiClock size={12} /> {mm}:{ss}
            </span>
          );
        })()}
      </MobileGameHeader>

      {/* ── Players bar ── */}
      <div className="m-section">
        <h3 className="m-label">Players <span className="m-badge-small">{game.players.length}</span></h3>
        <div className="m-players-row">
          {game.players.map((player) => {
            const name = sessionById[player.sessionId] ?? player.sessionId.slice(0, 6);
            const initial = (name[0] ?? "?").toUpperCase();
            const isMe = player.sessionId === sessionId;
            const isCurrentLeader = player.sessionId === game.leader_id;
            const isGuessPhase = phase === "guess1" || phase === "guess2";
            const isLockedIn = isGuessPhase && !isCurrentLeader && lockedInIds.has(player.sessionId);
            return (
              <div key={player.sessionId}
                className={`m-player-chip${isMe ? " m-player-chip--me" : ""}${isCurrentLeader ? " m-player-chip--leader" : ""}${isLockedIn ? " m-player-chip--locked" : ""}`}>
                <div className={`m-player-avatar${isCurrentLeader ? " m-player-avatar--leader" : ""}`}>
                  {isCurrentLeader ? "🎨" : isLockedIn ? "✅" : initial}
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
          <p className="m-text-muted m-text-center">You're not in this lobby yet.</p>
          <button className="m-btn m-btn-primary"
            onClick={() => void zero.mutate(mutators.shadeSignal.join({ gameId, sessionId })).client.catch(() => showToast("Couldn't join game", "error"))}>
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

          <div className="m-actions">
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

      {/* ── CLUE PHASE (Leader) ── */}
      {(phase === "clue1" || phase === "clue2") && isLeader && (
        <div className="m-section">
          <div className="m-shade-leader-banner">
            <h3>You are the Leader! 🎨</h3>
            <p>
              {phase === "clue1"
                ? <>Give a <strong>one-word</strong> clue to help guessers find your target color.</>
                : <>Give a <strong>second clue</strong> (up to 2 words).</>}
            </p>
            {game.settings.hardMode && (
              <p className="m-shade-hard-warn">🚫 No Color Names — you can't use words like red, blue, green, etc.</p>
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
              className="m-input"
              value={clue}
              onChange={(e) => setClue(e.target.value)}
              placeholder={phase === "clue1" ? "One word clue…" : "Second clue (1-2 words)…"}
              maxLength={60}
              autoFocus
            />
            <button className="m-btn m-btn-primary" type="submit" disabled={!clue.trim()}>
              <FiSend size={14} /> Send
            </button>
          </form>
        </div>
      )}

      {/* ── CLUE PHASE (Guessers waiting) ── */}
      {(phase === "clue1" || phase === "clue2") && !isLeader && inGame && (
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
      {(phase === "guess1" || phase === "guess2") && !isLeader && inGame && (
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
      {(phase === "guess1" || phase === "guess2") && (isLeader || !inGame) && (
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
      {phase === "reveal" && (
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
            compact
          />
          <MobileScoringLegend />

          {latestRound && (
            <div className="m-shade-score-table">
              <h4 className="m-label">Round Scores</h4>
              {game.players
                .filter((p) => p.sessionId !== game.leader_id)
                .map((p) => {
                  const pts = latestRound.scores[p.sessionId] ?? 0;
                  const g2 = latestRound.guesses.find((g) => g.sessionId === p.sessionId && g.round === 2);
                  const g1 = latestRound.guesses.find((g) => g.sessionId === p.sessionId && g.round === 1);
                  const gFinal = g2 ?? g1;
                  const dist = gFinal && target ? chebyshevDist({ row: gFinal.row, col: gFinal.col }, target) : null;
                  return (
                    <div key={p.sessionId} className="m-shade-score-row">
                      <span className="m-shade-score-name">
                        {sessionById[p.sessionId] ?? p.sessionId.slice(0, 6)}
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
      {phase === "finished" && (
        <div className="m-section">
          <h3 className="m-label" style={{ textAlign: "center" }}>🏆 Game Over!</h3>

          <div className="m-shade-final-scores">
            {[...game.players]
              .sort((a, b) => b.totalScore - a.totalScore)
              .map((p, i) => {
                const name = sessionById[p.sessionId] ?? p.sessionId.slice(0, 6);
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

          <div className="m-actions">
            {isHost ? (
              <>
                <button className="m-btn m-btn-primary"
                  onClick={() => void zero.mutate(mutators.shadeSignal.resetToLobby({ gameId, hostId: sessionId }))}>
                  Play Again
                </button>
                <button className="m-btn m-btn-muted"
                  onClick={() => { void zero.mutate(mutators.shadeSignal.endGame({ gameId, hostId: sessionId })); navigate("/"); }}>
                  End Game
                </button>
              </>
            ) : (
              <button className="m-btn m-btn-muted" onClick={() => navigate("/")}>Back to Home</button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
