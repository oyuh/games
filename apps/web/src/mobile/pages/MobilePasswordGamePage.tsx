import { mutators } from "@games/shared";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { FiSend, FiClock, FiSkipForward } from "react-icons/fi";
import { showToast } from "../../lib/toast";
import { useMobileHostRegister } from "../../lib/mobile-host-context";
import { MobileGameHeader } from "../components/MobileGameHeader";
import { MobileGameNotFound } from "../components/MobileGameNotFound";
import { MobileSpectatorBadge, MobileHostBadge } from "../../components/shared/SpectatorBadge";
import { MobileSpectatorOverlay } from "../../components/shared/SpectatorOverlay";
import { getPasswordPlayerName } from "../../lib/password-names";
import { usePasswordGame } from "../../hooks/usePasswordGame";

const teamColors = ["#7ecbff", "#a78bfa", "#4ade80", "#f59e0b", "#f87171", "#ec4899"];

export function MobilePasswordGamePage({ sessionId }: { sessionId: string }) {
  const {
    zero, gameId, game, isHost, names,
    myTeamIndex, myActiveRound, activeRoundId, isSpectator, liveEntries,
    clue, guess, handleClueChange, handleGuessChange,
    submitClue, submitGuess, skipWord, retryWordLoad,
    decryptedActiveWord, myTeamMembers, myTeamSkips, gameProgress,
    activeRoundView, roundsForView, navigate,
  } = usePasswordGame(sessionId);

  const clueInputRef = useRef<HTMLInputElement>(null);
  const guessInputRef = useRef<HTMLInputElement>(null);

  /* Mobile-only: leaving as a spectator drops the spectator slot. The ref
     keeps the unmount cleanup from closing over a stale value. */
  const isSpectatorRef = useRef(false);
  useEffect(() => { isSpectatorRef.current = isSpectator; }, [isSpectator]);

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

  useEffect(() => {
    if (game?.phase !== "playing" || !myActiveRound) return;
    const isGuesser = myActiveRound.guesserId === sessionId;
    const input = isGuesser ? guessInputRef.current : clueInputRef.current;
    if (!input) return;
    const timer = window.setTimeout(() => {
      input.focus();
      if (!input.value) input.select();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [
    game?.phase,
    activeRoundId,
    myActiveRound?.guesserId,
    myActiveRound?.clues?.length,
    myActiveRound?.guesses?.length,
    decryptedActiveWord,
    sessionId,
  ]);

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

  /* Presentation helpers, mobile-only: the desktop layout renders these
     details through PasswordActiveRound instead. */
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
                <span className="m-score-chip-name" style={{ color }}>{team.name}</span>
                <span className="m-score-chip-value">{score} / {game.settings.targetScore}</span>
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
                        <input ref={clueInputRef} className="m-input" onFocus={(e) => e.currentTarget.select()} style={{ flex: 1 }} value={clue} onChange={(e) => handleClueChange(e.target.value)} placeholder={ar.clues.length > 0 ? "Another clue..." : "Enter clue..."} maxLength={80} />
                        <button type="submit" className="m-btn m-btn-primary" disabled={!clue.trim()} onMouseDown={(e) => e.preventDefault()}><FiSend size={14} /></button>
                      </form>
                    </>
                  ) : isClueGiver ? (
                    <div className="m-waiting">
                      <div className="m-waiting-pulse" />
                      <p>Loading secret word…</p>
                      <button className="m-btn m-btn-muted" style={{ width: "100%", marginTop: "0.5rem" }} onClick={retryWordLoad}>
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
                        <input ref={guessInputRef} className="m-input" onFocus={(e) => e.currentTarget.select()} style={{ flex: 1 }} value={guess} onChange={(e) => handleGuessChange(e.target.value)} placeholder="Type your guess..." maxLength={80} />
                        <button type="submit" className="m-btn m-btn-primary" disabled={!guess.trim() || duplicateGuess} onMouseDown={(e) => e.preventDefault()}><FiSend size={14} /> Guess</button>
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

            <details className="m-card m-pw-timeline" open={timeline.length <= 2}>
              <summary>Round Timeline</summary>
              <div className="m-pw-timeline-body">
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
            </details>
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
        <div className="m-card m-bottom-safe">
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
        <div className="m-card m-bottom-safe">
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
