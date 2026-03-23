import { decryptSecret, isEncrypted, mutators, queries } from "@games/shared";
import { useQuery, useZero } from "../../lib/zero";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { FiSend, FiClock, FiSkipForward } from "react-icons/fi";
import { usePresenceSocket } from "../../hooks/usePresenceSocket";
import { showToast } from "../../lib/toast";
import { useMobileHostRegister } from "../../lib/mobile-host-context";
import { MobileGameHeader } from "../components/MobileGameHeader";
import { MobileGameNotFound } from "../components/MobileGameNotFound";
import { MobileSpectatorBadge, MobileHostBadge } from "../../components/shared/SpectatorBadge";
import { MobileSpectatorOverlay } from "../../components/shared/SpectatorOverlay";
import { useGameSecret } from "../../lib/game-secrets";

const teamColors = ["#7ecbff", "#a78bfa", "#4ade80", "#f59e0b", "#f87171", "#ec4899"];

export function MobilePasswordGamePage({ sessionId }: { sessionId: string }) {
  const zero = useZero();
  const params = useParams();
  const navigate = useNavigate();
  const gameId = params.id ?? "";
  const [games] = useQuery(queries.password.byId({ id: gameId }));
  const [sessions] = useQuery(queries.sessions.byGame({ gameType: "password", gameId }));
  const game = games[0];
  const isHost = game?.host_id === sessionId;
  const [clue, setClue] = useState("");
  const [guess, setGuess] = useState("");
  const [decryptedActiveWord, setDecryptedActiveWord] = useState<string | null>(null);
  const [decryptedRoundWords, setDecryptedRoundWords] = useState<Record<number, string | null>>({});
  const [fallbackKey, setFallbackKey] = useState<string | null>(null);
  const [fallbackRetryNonce, setFallbackRetryNonce] = useState(0);
  const prevAnnouncementRef = useRef<{ text: string; ts: number } | null>(null);
  const isSpectatorRef = useRef(false);
  const navHandledRef = useRef(false);
  const isHostRef = useRef(Boolean(isHost));
  const phaseRef = useRef(game?.phase);

  isHostRef.current = Boolean(isHost);
  phaseRef.current = game?.phase;

  usePresenceSocket({ sessionId, gameId, gameType: "password" });
  const names = useMemo(() => sessions.reduce<Record<string, string>>((acc, s) => { acc[s.id] = s.name ?? s.id.slice(0, 6); return acc; }, {}), [sessions]);

  useEffect(() => {
    const spectating = game?.spectators?.some((s) => s.sessionId === sessionId) ?? false;
    isSpectatorRef.current = spectating;
  }, [game?.spectators, sessionId]);

  useEffect(() => {
    let active = false;
    const timer = setTimeout(() => { active = true; }, 500);
    return () => {
      clearTimeout(timer);
      if (active && isSpectatorRef.current) {
        void zero.mutate(mutators.password.leaveSpectator({ gameId, sessionId }));
      }
    };
  }, [gameId, sessionId, zero]);

  useMobileHostRegister(
    isHost && game
      ? { type: "password", gameId, hostId: game.host_id, players: game.teams.flatMap((t) => t.members.map((id) => ({ id, name: names[id] ?? id.slice(0, 6) }))), spectators: game.spectators ?? [] }
      : null
  );

  const myTeamIndex = useMemo(() => {
    if (!game) return -1;
    return game.teams.findIndex((t) => t.members.includes(sessionId));
  }, [game?.teams, sessionId]);

  const myActiveRound = useMemo(() => {
    if (!game || !game.active_rounds.length || myTeamIndex === -1) return undefined;
    return game.active_rounds.find((r) => r.teamIndex === myTeamIndex);
  }, [game?.active_rounds, myTeamIndex]);

  const { decryptValue } = useGameSecret({
    gameType: "password",
    gameId,
    sessionId,
    enabled: Boolean(game && game.phase !== "lobby")
  });

  const encryptedActiveWord = myActiveRound?.encryptedWord
    ?? (myActiveRound?.word && isEncrypted(myActiveRound.word) ? myActiveRound.word : null);

  useEffect(() => {
    if (!game || game.phase !== "playing" || !encryptedActiveWord || fallbackKey) return;
    if (myActiveRound?.guesserId === sessionId) return;
    const apiBase = import.meta.env.VITE_API_URL ?? "http://localhost:3001";
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    void fetch(`${apiBase}/api/game-secret/key`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-zero-user-id": sessionId
      },
      body: JSON.stringify({ gameType: "password", gameId, sessionId })
    })
      .then(async (res) => {
        if (!res.ok) return null;
        const data = await res.json() as { key?: string };
        return data.key ?? null;
      })
      .then((key) => {
        if (!cancelled && key) {
          setFallbackKey(key);
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled && !fallbackKey) {
          retryTimer = setTimeout(() => setFallbackRetryNonce((n) => n + 1), 1500);
        }
      });

    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [game?.phase, encryptedActiveWord, fallbackKey, myActiveRound?.guesserId, sessionId, gameId, fallbackRetryNonce]);

  useEffect(() => {
    let active = false;
    const timer = setTimeout(() => {
      active = true;
    }, 500);

    return () => {
      clearTimeout(timer);
      if (!active) return;
      if (!isHostRef.current) return;
      if (phaseRef.current === "results" || phaseRef.current === "ended") return;
      void zero.mutate(mutators.password.leave({ gameId, sessionId }));
    };
  }, [gameId, sessionId, zero]);

  useEffect(() => {
    let cancelled = false;
    const encryptedOrPlain = myActiveRound?.word ?? myActiveRound?.encryptedWord ?? null;
    if (!encryptedOrPlain) {
      setDecryptedActiveWord(null);
      return;
    }
    void decryptValue(encryptedOrPlain).then(async (value) => {
      if (cancelled) return;
      if (value !== null) {
        setDecryptedActiveWord(value);
        return;
      }
      if (!fallbackKey || !isEncrypted(encryptedOrPlain)) {
        setDecryptedActiveWord(null);
        return;
      }
      const fallbackValue = await decryptSecret(encryptedOrPlain, fallbackKey).catch(() => null);
      if (!cancelled) {
        setDecryptedActiveWord(fallbackValue);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [myActiveRound?.word, myActiveRound?.encryptedWord, decryptValue, fallbackKey]);

  useEffect(() => {
    let cancelled = false;
    const rounds = game?.rounds ?? [];
    if (rounds.length === 0) {
      setDecryptedRoundWords({});
      return;
    }
    void Promise.all(
      rounds.map(async (round, index) => ({
        index,
        value: await decryptValue(round.word)
      }))
    ).then((rows) => {
      if (cancelled) return;
      setDecryptedRoundWords(
        rows.reduce<Record<number, string | null>>((acc, row) => {
          acc[row.index] = row.value;
          return acc;
        }, {})
      );
    });
    return () => {
      cancelled = true;
    };
  }, [game?.rounds, decryptValue]);

  useEffect(() => {
    if (!game || game.phase !== "playing" || !game.settings.roundEndsAt) return;
    const remaining = game.settings.roundEndsAt - Date.now();
    if (remaining <= 0) { void zero.mutate(mutators.password.advanceTimer({ gameId })); return; }
    const timer = setTimeout(() => { void zero.mutate(mutators.password.advanceTimer({ gameId })); }, remaining + 500);
    return () => clearTimeout(timer);
  }, [game?.settings.roundEndsAt, game?.phase, gameId, zero]);

  useEffect(() => { if (game?.phase === "results") navigate(`/password/${game.id}/results`); }, [game?.phase, game?.id, navigate]);
  useEffect(() => {
    if (!game) return;
    if (navHandledRef.current) return;
    if (game.phase === "ended") { navHandledRef.current = true; showToast("The host ended the game", "info"); navigate("/"); return; }
    if (game.kicked.includes(sessionId)) { navHandledRef.current = true; showToast("You were kicked from the game", "error"); navigate("/"); }
  }, [game?.phase, game?.kicked, sessionId, navigate]);

  useEffect(() => {
    if (!game?.announcement || isHost) return;
    const prev = prevAnnouncementRef.current;
    const cur = game.announcement;
    if (prev && prev.text === cur.text && Math.abs(cur.ts - prev.ts) < 3000) return;
    prevAnnouncementRef.current = cur;
    showToast(`📢 ${cur.text}`, "info");
  }, [game?.announcement, isHost]);

  // Countdown timer
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  useEffect(() => {
    const endsAt = game?.settings.roundEndsAt;
    if (!endsAt) { setTimeLeft(null); return; }
    const tick = () => setTimeLeft(Math.max(0, Math.floor((endsAt - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [game?.settings.roundEndsAt]);

  if (!game) return <MobileGameNotFound theme="password" />;

  const isSpectator = game.spectators?.some((s) => s.sessionId === sessionId) ?? false;
  const myTeam = myTeamIndex >= 0 ? game.teams[myTeamIndex] : undefined;
  const myTeamMembers = myTeam?.members ?? [];

  const submitClue = async (event: FormEvent) => {
    event.preventDefault();
    if (!clue.trim()) return;
    try { await zero.mutate(mutators.password.submitClue({ gameId, sessionId, clue: clue.trim() })).server; setClue(""); }
    catch (e) { showToast(e instanceof Error ? e.message : "Couldn't submit clue", "error"); }
  };

  const submitGuess = async (event: FormEvent) => {
    event.preventDefault();
    if (!guess.trim()) return;
    try { await zero.mutate(mutators.password.submitGuess({ gameId, sessionId, guess: guess.trim() })).server; setGuess(""); }
    catch (e) { showToast(e instanceof Error ? e.message : "Couldn't submit guess", "error"); }
  };

  const skipWord = async () => {
    try { await zero.mutate(mutators.password.skipWord({ gameId, sessionId })).server; }
    catch (e) { showToast(e instanceof Error ? e.message : "Couldn't skip word", "error"); }
  };

  const myTeamSkips = myTeam ? (game.settings.skipsRemaining?.[myTeam.name] ?? 0) : 0;

  return (
    <div className="m-page" data-game-theme="password">
      <MobileGameHeader code={game.code} gameLabel="Password" phase={game.phase} round={game.current_round} accent="var(--game-accent)" category={game.settings.category ?? null}>
        {isSpectator && <MobileSpectatorBadge />}
        {isHost && <MobileHostBadge />}
        {timeLeft != null && (
          <span className={`m-timer${timeLeft <= 10 ? " m-timer--danger" : " m-timer--warn"}`}>
            <FiClock size={14} /> {String(Math.floor(timeLeft / 60)).padStart(2, "0")}:{String(timeLeft % 60).padStart(2, "0")}
          </span>
        )}
      </MobileGameHeader>

      {/* Scores */}
      <div className="m-card">
        <h3 className="m-card-title">Scores</h3>
        <div className="m-scoreboard-mini">
          {game.teams.map((team, i) => {
            const color = teamColors[i % teamColors.length]!;
            const score = game.scores[team.name] ?? 0;
            const isMyTeam = myTeamIndex === i;
            return (
              <div key={team.name} className={`m-score-chip${isMyTeam ? " m-score-chip--mine" : ""}`} style={{ borderColor: color }}>
                <span style={{ color, fontWeight: 600, fontSize: "0.8rem" }}>{team.name}</span>
                <span style={{ fontWeight: 700, fontSize: "1.1rem" }}>{score} / {game.settings.targetScore}</span>
              </div>
            );
          })}
        </div>
      </div>

      {isSpectator && (
        <MobileSpectatorOverlay playerCount={game.teams.reduce((n, t) => n + t.members.length, 0)} phase={game.phase} onLeave={() => void zero.mutate(mutators.password.leaveSpectator({ gameId, sessionId }))} />
      )}

      {/* Active Round */}
      {!isSpectator && game.phase === "playing" && myActiveRound && (() => {
        const ar = myActiveRound;
        const activeRoundWord = decryptedActiveWord ?? (ar.word && !isEncrypted(ar.word) ? ar.word : null);
        const guesserName = names[ar.guesserId] ?? ar.guesserId.slice(0, 6);
        const isGuesser = ar.guesserId === sessionId;
        const isOnTeam = myTeamMembers.includes(sessionId);
        const isClueGiver = isOnTeam && !isGuesser;
        const alreadyClued = ar.clues.some((c) => c.sessionId === sessionId);
        const clueGiverCount = myTeamMembers.filter((m) => m !== ar.guesserId).length;
        const allCluesIn = ar.clues.length >= clueGiverCount;
        const hasWrongGuess = ar.guess !== null && ar.clues.length === 0;

        return (
          <div className="m-card">
            <div className="m-round-role">
              <span style={{ opacity: 0.6, fontSize: "0.8rem" }}>Guesser:</span>
              <span style={{ fontWeight: 600, color: isGuesser ? "var(--primary)" : "inherit" }}>
                {guesserName}{isGuesser ? " (you)" : ""}
              </span>
            </div>

            {hasWrongGuess && (
              <div className="m-alert m-alert--danger" style={{ marginBottom: "0.75rem" }}>
                <strong>Incorrect!</strong> "{ar.guess}" was wrong — new clues needed!
              </div>
            )}

            {/* Clue giver: submit clue */}
            {activeRoundWord && !allCluesIn && isClueGiver && !alreadyClued && (
              <>
                <div className="m-secret-word">
                  <span style={{ opacity: 0.6, fontSize: "0.75rem" }}>Secret Word</span>
                  <span style={{ fontSize: "1.3rem", fontWeight: 700, color: "var(--primary)" }}>{activeRoundWord}</span>
                </div>
                <form className="m-input-row" onSubmit={submitClue}>
                  <input className="m-input" autoFocus onFocus={(e) => e.currentTarget.select()} style={{ flex: 1 }} value={clue} onChange={(e) => setClue(e.target.value)} placeholder="Enter clue…" maxLength={80} />
                  <button type="submit" className="m-btn m-btn-primary" disabled={!clue.trim()}><FiSend size={14} /></button>
                </form>
                <p className="m-progress-text">Clues: {ar.clues.length} / {clueGiverCount}</p>
              </>
            )}

            {!activeRoundWord && !allCluesIn && isClueGiver && !alreadyClued && (
              <div className="m-waiting">
                <div className="m-waiting-pulse" />
                <p>Loading secret word…</p>
                <button
                  className="m-btn m-btn-muted"
                  style={{ width: "100%", marginTop: "0.5rem" }}
                  onClick={() => setFallbackRetryNonce((n) => n + 1)}
                >
                  Retry Sync
                </button>
              </div>
            )}

            {/* Waiting states */}
            {activeRoundWord && !allCluesIn && isClueGiver && alreadyClued && (
              <div className="m-waiting"><div className="m-waiting-pulse" /><p>Waiting for teammates… ({ar.clues.length}/{clueGiverCount})</p></div>
            )}
            {activeRoundWord && !allCluesIn && isGuesser && (
              <div className="m-waiting"><div className="m-waiting-pulse" /><p>Teammates are writing clues… ({ar.clues.length}/{clueGiverCount})</p></div>
            )}
            {activeRoundWord && !allCluesIn && !isOnTeam && (
              <div className="m-waiting"><div className="m-waiting-pulse" /><p>Clue givers submitting… ({ar.clues.length}/{clueGiverCount})</p></div>
            )}

            {/* All clues in — guesser guesses */}
            {activeRoundWord && allCluesIn && (
              <>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", marginBottom: "0.75rem" }}>
                  {ar.clues.map((c) => (
                    <span key={c.sessionId} className="m-badge m-badge--primary" style={{ fontSize: "0.95rem", padding: "0.3rem 0.6rem" }}>{c.text}</span>
                  ))}
                </div>
                {isGuesser ? (
                  <form className="m-input-row" onSubmit={submitGuess}>
                    <input className="m-input" autoFocus onFocus={(e) => e.currentTarget.select()} style={{ flex: 1 }} value={guess} onChange={(e) => setGuess(e.target.value)} placeholder="Your guess…" maxLength={80} />
                    <button type="submit" className="m-btn m-btn-primary" disabled={!guess.trim()}><FiSend size={14} /> Guess</button>
                  </form>
                ) : (
                  <div className="m-waiting"><div className="m-waiting-pulse" /><p>Waiting for {guesserName} to guess…</p></div>
                )}
              </>
            )}

            {isOnTeam && myTeamSkips > 0 && (
              <div style={{ marginTop: "0.5rem", textAlign: "center" }}>
                <button className="m-btn m-btn-muted" style={{ width: "100%" }} onClick={() => void skipWord()}>
                  <FiSkipForward size={14} /> Skip Word ({myTeamSkips} left)
                </button>
              </div>
            )}
          </div>
        );
      })()}

      {/* Spectator/no active round */}
      {!isSpectator && game.phase === "playing" && !myActiveRound && (
        <div className="m-card">
          <div className="m-waiting"><div className="m-waiting-pulse" /><p>Teams are racing! Watch scores update live.</p></div>
        </div>
      )}

      {/* Results redirect */}
      {!isSpectator && game.phase === "results" && (
        <div className="m-card" style={{ textAlign: "center" }}>
          <h3 className="m-reveal-title">Game Over!</h3>
          <Link to={`/password/${game.id}/results`} className="m-btn m-btn-primary" style={{ width: "100%", marginTop: "0.75rem", display: "block", textAlign: "center" }}>
            View Results
          </Link>
        </div>
      )}

      {/* Rounds history */}
      {game.rounds.length > 0 && (
        <div className="m-card">
          <h3 className="m-card-title">Rounds</h3>
          <div className="m-data-table-wrap">
            <table className="m-data-table">
              <thead><tr><th>#</th><th>Team</th><th>Word</th><th>Result</th></tr></thead>
              <tbody>
                {game.rounds.map((r, i) => (
                  <tr key={i}>
                    <td>{r.round}</td>
                    <td>{game.teams[r.teamIndex]?.name ?? `Team ${r.teamIndex + 1}`}</td>
                    <td style={{ color: "var(--primary)", fontWeight: 600 }}>{decryptedRoundWords[i] ?? (isEncrypted(r.word) ? "••••" : r.word)}</td>
                    <td style={{ color: r.correct ? "#4ade80" : "#f87171" }}>{r.correct ? "✓" : "✗"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Host: reset */}
      {!isSpectator && isHost && game.phase === "results" && (
        <div className="m-card">
          <button
            className="m-btn m-btn-muted"
            style={{ width: "100%" }}
            onClick={() => { void zero.mutate(mutators.password.resetToLobby({ gameId, hostId: sessionId })); void navigate(`/password/${game.id}/begin`); }}
          >
            Reset to Lobby
          </button>
        </div>
      )}
    </div>
  );
}
