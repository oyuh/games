import { decryptSecret, isEncrypted, mutators, queries } from "@games/shared";
import { useQuery, useZero } from "../../lib/zero";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { FiSend, FiClock, FiSkipForward } from "react-icons/fi";
import { usePresenceSocket } from "../../hooks/usePresenceSocket";
import { usePasswordLiveTyping } from "../../hooks/usePasswordLiveTyping";
import { showToast } from "../../lib/toast";
import { useMobileHostRegister } from "../../lib/mobile-host-context";
import { MobileGameHeader } from "../components/MobileGameHeader";
import { MobileGameNotFound } from "../components/MobileGameNotFound";
import { MobileSpectatorBadge, MobileHostBadge } from "../../components/shared/SpectatorBadge";
import { MobileSpectatorOverlay } from "../../components/shared/SpectatorOverlay";
import { useGameSecret } from "../../lib/game-secrets";
import { getSessionRequestHeaders } from "../../lib/session";
import { buildPasswordPlayerNames, getPasswordPlayerName } from "../../lib/password-names";
import { useGameSounds, playSoundSubmit } from "../../hooks/useGameSounds";

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
  const names = useMemo(() => buildPasswordPlayerNames(game, sessions), [game, sessions]);

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
      ? { type: "password", gameId, hostId: game.host_id, players: game.teams.flatMap((t) => t.members.map((id) => ({ id, name: getPasswordPlayerName(names, id) }))), spectators: game.spectators ?? [] }
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
  const activeRoundId = myActiveRound?.roundId ?? (myTeamIndex >= 0 && game ? `legacy-${game.current_round}-${myTeamIndex}` : null);
  const isSpectator = game?.spectators?.some((s) => s.sessionId === sessionId) ?? false;

  const { liveEntries, publishDraft, clearDraft } = usePasswordLiveTyping({
    enabled: Boolean(game?.phase === "playing" && myTeamIndex >= 0 && !isSpectator),
    gameId,
    teamIndex: myTeamIndex,
    sessionId,
    roundId: activeRoundId,
  });

  useGameSounds({
    phase: game?.phase,
    sessionId,
    isMyTurn: Boolean(myActiveRound),
    phaseEndsAt: game?.settings.roundEndsAt,
  });

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
      credentials: "include",
      headers: getSessionRequestHeaders(sessionId, {
        "Content-Type": "application/json"
      }),
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
    setClue("");
    setGuess("");
    clearDraft("clue");
    clearDraft("guess");
  }, [activeRoundId, clearDraft]);

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

  const myTeam = myTeamIndex >= 0 ? game.teams[myTeamIndex] : undefined;
  const myTeamMembers = myTeam?.members ?? [];

  const handleClueChange = (value: string) => {
    setClue(value);
    publishDraft("clue", value);
  };

  const handleGuessChange = (value: string) => {
    setGuess(value);
    publishDraft("guess", value);
  };

  const submitClue = async (event: FormEvent) => {
    event.preventDefault();
    if (!clue.trim()) return;
    try { await zero.mutate(mutators.password.submitClue({ gameId, sessionId, clue: clue.trim() })).server; setClue(""); clearDraft("clue"); playSoundSubmit(); }
    catch (e) { showToast(e instanceof Error ? e.message : "Couldn't submit clue", "error"); }
  };

  const submitGuess = async (event: FormEvent) => {
    event.preventDefault();
    if (!guess.trim()) return;
    try { await zero.mutate(mutators.password.submitGuess({ gameId, sessionId, guess: guess.trim() })).server; setGuess(""); clearDraft("guess"); playSoundSubmit(); }
    catch (e) { showToast(e instanceof Error ? e.message : "Couldn't submit guess", "error"); }
  };

  const skipWord = async () => {
    try { await zero.mutate(mutators.password.skipWord({ gameId, sessionId })).server; }
    catch (e) { showToast(e instanceof Error ? e.message : "Couldn't skip word", "error"); }
  };

  const myTeamSkips = myTeam ? (game.settings.skipsRemaining?.[myTeam.name] ?? 0) : 0;
  const activeRoundView = myActiveRound
    ? {
        ...myActiveRound,
        roundId: activeRoundId ?? myActiveRound.roundId,
        clues: myActiveRound.clues ?? [],
        guesses: myActiveRound.guesses ?? [],
        guessCount: myActiveRound.guessCount ?? myActiveRound.guesses?.length ?? 0,
        word: decryptedActiveWord ?? (myActiveRound.word && !isEncrypted(myActiveRound.word) ? myActiveRound.word : null),
      }
    : undefined;
  const roundsForView = game.rounds.map((round, index) => ({
    ...round,
    roundId: round.roundId ?? `legacy-${round.round}-${round.teamIndex}`,
    clues: round.clues ?? [],
    guesses: round.guesses ?? [],
    guessCount: round.guessCount ?? round.guesses?.length ?? 0,
    points: round.points ?? (round.correct ? 1 : 0),
    word: decryptedRoundWords[index] ?? (isEncrypted(round.word) ? "••••" : round.word),
  }));

  const formatEntryTime = (ts: number) => new Date(ts).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
  const scoreForNextGuess = (guessCount: number) => {
    const nextGuessNumber = guessCount + 1;
    if (nextGuessNumber <= 1) return 3;
    if (nextGuessNumber === 2) return 2;
    return 1;
  };
  const normalized = (value: string) => value.trim().toLowerCase();

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
      {!isSpectator && game.phase === "playing" && activeRoundView && (() => {
        const ar = activeRoundView;
        const guesserName = getPasswordPlayerName(names, ar.guesserId);
        const isGuesser = ar.guesserId === sessionId;
        const isClueGiver = myTeamMembers.includes(sessionId) && !isGuesser;
        const clueDrafts = liveEntries.filter((entry) => entry.role === "clue" && entry.text.trim());
        const guessDraft = liveEntries.find((entry) => entry.role === "guess" && entry.text.trim());
        const clueDraftText = clueDrafts[clueDrafts.length - 1]?.text ?? "";
        const guessDraftText = guessDraft?.text ?? "";
        const duplicateGuess = Boolean(guess.trim() && ar.guesses.some((entry) => normalized(entry.text) === normalized(guess)));
        const latestGuess = ar.guesses[ar.guesses.length - 1] ?? null;
        const timeline = [...ar.clues, ...ar.guesses]
          .map((entry) => {
            if ("correct" in entry) {
              return {
                ...entry,
                type: "guess" as const,
                playerName: getPasswordPlayerName(names, entry.sessionId),
              };
            }
            return {
              ...entry,
              type: "clue" as const,
              playerName: getPasswordPlayerName(names, entry.sessionId),
            };
          })
          .sort((a, b) => a.ts - b.ts);

        return (
          <>
            <div className="m-card">
              <div className="m-round-role" style={{ justifyContent: "space-between" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
                  <span style={{ opacity: 0.6, fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.06em" }}>Guesser</span>
                  <span style={{ fontWeight: 700, color: isGuesser ? "var(--primary)" : "inherit" }}>
                    {guesserName}{isGuesser ? " (you)" : ""}
                  </span>
                </div>
                <div style={{ textAlign: "right" }}>
                  <span style={{ opacity: 0.6, fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.06em", display: "block" }}>Next Solve</span>
                  <span style={{ fontWeight: 700 }}>{scoreForNextGuess(ar.guesses.length)} pts</span>
                </div>
              </div>

              <div style={{ display: "grid", gap: "0.75rem", marginTop: "0.75rem" }}>
                <div style={{ border: "1px solid color-mix(in srgb, var(--primary) 18%, transparent)", borderRadius: "0.9rem", padding: "0.9rem", background: "color-mix(in srgb, var(--primary) 6%, transparent)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.65rem" }}>
                    <div>
                      <p style={{ margin: 0, opacity: 0.65, fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.06em" }}>Clue Givers</p>
                      <h3 style={{ margin: "0.2rem 0 0", fontSize: "1rem" }}>Clues stay live the whole round</h3>
                    </div>
                    <span className="m-badge m-badge--primary">{ar.clues.length} clues</span>
                  </div>

                  {isClueGiver && ar.word ? (
                    <>
                      <div className="m-secret-word">
                        <span style={{ opacity: 0.6, fontSize: "0.75rem" }}>Secret Word</span>
                        <span style={{ fontSize: "1.3rem", fontWeight: 700, color: "var(--primary)" }}>{ar.word}</span>
                      </div>
                      <form className="m-input-row" onSubmit={submitClue}>
                        <input className="m-input" onFocus={(e) => e.currentTarget.select()} style={{ flex: 1 }} value={clue} onChange={(e) => handleClueChange(e.target.value)} placeholder={ar.clues.length > 0 ? "Another clue..." : "Enter clue..."} maxLength={80} />
                        <button type="submit" className="m-btn m-btn-primary" disabled={!clue.trim()}><FiSend size={14} /></button>
                      </form>
                    </>
                  ) : isClueGiver ? (
                    <div className="m-waiting">
                      <div className="m-waiting-pulse" />
                      <p>Loading secret word…</p>
                      <button className="m-btn m-btn-muted" style={{ width: "100%", marginTop: "0.5rem" }} onClick={() => setFallbackRetryNonce((n) => n + 1)}>
                        Retry Sync
                      </button>
                    </div>
                  ) : (
                    <div className={`m-input m-live-readonly-shell${clueDraftText ? " m-live-readonly-shell--active" : ""}`} aria-live="polite">
                      <span className={clueDraftText ? "" : "m-live-readonly-shell-placeholder"}>
                        {clueDraftText || "Clue givers type here"}
                      </span>
                      {clueDraftText ? <span className="m-live-readonly-shell-caret" aria-hidden="true" /> : null}
                    </div>
                  )}

                  <div style={{ display: "flex", flexWrap: "wrap", gap: "0.45rem", marginTop: "0.75rem" }}>
                    {ar.clues.length === 0 && clueDrafts.length === 0 && (
                      <span style={{ opacity: 0.6, fontSize: "0.88rem" }}>No clues locked in yet.</span>
                    )}
                    {ar.clues.map((entry) => {
                      const repeated = entry.clueNumber > 1 || entry.repeatedText;
                      return (
                        <span key={entry.id} className={`m-badge ${repeated ? "m-badge--warn" : "m-badge--primary"}`} style={{ padding: "0.35rem 0.65rem", display: "inline-flex", flexDirection: "column", alignItems: "flex-start", gap: "0.15rem" }}>
                          <strong>{entry.text}</strong>
                          <span style={{ fontSize: "0.7rem", opacity: 0.75 }}>
                            {getPasswordPlayerName(names, entry.sessionId)}{entry.clueNumber > 1 ? ` • clue ${entry.clueNumber}` : ""}
                          </span>
                        </span>
                      );
                    })}
                  </div>
                </div>

                <div style={{ border: "1px solid color-mix(in srgb, var(--accent-warning) 20%, transparent)", borderRadius: "0.9rem", padding: "0.9rem", background: "color-mix(in srgb, var(--accent-warning) 7%, transparent)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.65rem" }}>
                    <div>
                      <p style={{ margin: 0, opacity: 0.65, fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.06em" }}>Guesses</p>
                      <h3 style={{ margin: "0.2rem 0 0", fontSize: "1rem" }}>Guess whenever you want</h3>
                    </div>
                    <span className="m-badge">{ar.guesses.length} guesses</span>
                  </div>

                  {latestGuess && !latestGuess.correct && (
                    <div className="m-alert m-alert--danger" style={{ marginBottom: "0.75rem" }}>
                      <strong>Latest miss:</strong> "{latestGuess.text}"
                    </div>
                  )}

                  {isGuesser ? (
                    <>
                      <form className="m-input-row" onSubmit={submitGuess}>
                        <input className="m-input" onFocus={(e) => e.currentTarget.select()} style={{ flex: 1 }} value={guess} onChange={(e) => handleGuessChange(e.target.value)} placeholder="Type your guess..." maxLength={80} />
                        <button type="submit" className="m-btn m-btn-primary" disabled={!guess.trim() || duplicateGuess}><FiSend size={14} /> Guess</button>
                      </form>
                      {duplicateGuess && (
                        <p style={{ margin: "0.5rem 0 0", color: "#f59e0b", fontSize: "0.82rem" }}>You already guessed that one.</p>
                      )}
                    </>
                  ) : (
                    <div className={`m-input m-live-readonly-shell${guessDraftText ? " m-live-readonly-shell--active" : ""}`} aria-live="polite">
                      <span className={guessDraftText ? "" : "m-live-readonly-shell-placeholder"}>
                        {guessDraftText || `${guesserName} types here`}
                      </span>
                      {guessDraftText ? <span className="m-live-readonly-shell-caret" aria-hidden="true" /> : null}
                    </div>
                  )}

                  <div style={{ display: "flex", flexWrap: "wrap", gap: "0.45rem", marginTop: "0.75rem" }}>
                    {ar.guesses.length === 0 && !guessDraft && (
                      <span style={{ opacity: 0.6, fontSize: "0.88rem" }}>No guesses sent yet.</span>
                    )}
                    {ar.guesses.map((entry) => (
                      <span key={entry.id} className={`m-badge ${entry.correct ? "m-badge--success" : ""}`} style={{ padding: "0.35rem 0.65rem", display: "inline-flex", flexDirection: "column", alignItems: "flex-start", gap: "0.15rem" }}>
                        <strong>{entry.text}</strong>
                        <span style={{ fontSize: "0.7rem", opacity: 0.75 }}>Guess {entry.guessNumber}{entry.correct ? " • solved" : ""}</span>
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {myTeamSkips > 0 && (
                <div style={{ marginTop: "0.75rem" }}>
                  <button className="m-btn m-btn-muted" style={{ width: "100%" }} onClick={() => void skipWord()}>
                    <FiSkipForward size={14} /> Skip Word ({myTeamSkips} left)
                  </button>
                </div>
              )}
            </div>

            <div className="m-card">
              <h3 className="m-card-title">Round Timeline</h3>
              <div style={{ display: "grid", gap: "0.65rem" }}>
                {timeline.length === 0 && <p style={{ margin: 0, opacity: 0.65, fontSize: "0.9rem" }}>Waiting...</p>}
                {timeline.map((entry) => (
                  <div
                    key={entry.id}
                    style={{
                      border: `1px solid ${entry.type === "guess" && entry.correct ? "color-mix(in srgb, #4ade80 30%, transparent)" : entry.type === "clue" && (entry.clueNumber > 1 || entry.repeatedText) ? "color-mix(in srgb, #f59e0b 35%, transparent)" : "var(--border)"}`,
                      borderRadius: "0.85rem",
                      padding: "0.75rem",
                      background: entry.type === "guess" && entry.correct
                        ? "color-mix(in srgb, #4ade80 10%, var(--card))"
                        : entry.type === "clue" && (entry.clueNumber > 1 || entry.repeatedText)
                          ? "color-mix(in srgb, #f59e0b 10%, var(--card))"
                          : "var(--card)",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: "0.75rem", marginBottom: "0.35rem" }}>
                      <span style={{ fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", opacity: 0.7 }}>
                        {entry.type === "clue" ? "Clue" : "Guess"}
                      </span>
                      <span style={{ fontSize: "0.74rem", opacity: 0.65 }}>{formatEntryTime(entry.ts)}</span>
                    </div>
                    <p style={{ margin: 0, fontSize: "1rem", fontWeight: 700 }}>{entry.text}</p>
                    <p style={{ margin: "0.35rem 0 0", opacity: 0.7, fontSize: "0.78rem" }}>
                      {entry.playerName}
                      {entry.type === "clue" && entry.clueNumber > 1 ? ` • clue ${entry.clueNumber}` : ""}
                      {entry.type === "clue" && entry.repeatedText ? " • repeated word" : ""}
                      {entry.type === "guess" ? ` • guess ${entry.guessNumber}${entry.correct ? " • correct" : ""}` : ""}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </>
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
      {roundsForView.length > 0 && (
        <div className="m-card">
          <h3 className="m-card-title">Rounds</h3>
          <div className="m-data-table-wrap">
            <table className="m-data-table">
              <thead><tr><th>#</th><th>Team</th><th>Word</th><th>Pts</th></tr></thead>
              <tbody>
                {roundsForView.map((r) => (
                  <tr key={r.roundId}>
                    <td>{r.round}</td>
                    <td>{game.teams[r.teamIndex]?.name ?? `Team ${r.teamIndex + 1}`}</td>
                    <td style={{ color: "var(--primary)", fontWeight: 600 }}>{r.word}</td>
                    <td style={{ color: r.correct ? "#4ade80" : "#f87171" }}>{r.correct ? `+${r.points}` : "0"}</td>
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
