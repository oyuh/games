import { DEFAULT_IMPOSTER_CLUE_VISIBILITY, imposterCategoryLabels, isEncrypted, mutators, queries } from "@games/shared";
import { useQuery, useZero } from "../../lib/zero";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { FiLogIn, FiEye, FiEyeOff, FiSend, FiCheck, FiArrowRight, FiClock } from "react-icons/fi";
import { addRecentGame, ensureName, getDisplayName, leaveCurrentGame, SessionGameType } from "../../lib/session";
import { showToast } from "../../lib/toast";
import { useMobileHostRegister } from "../../lib/mobile-host-context";
import { BorringAvatar } from "../../components/shared/BorringAvatar";
import { InSessionModal } from "../../components/shared/InSessionModal";
import { LobbyVisibilityToggle } from "../../components/shared/LobbyVisibilityToggle";
import { MobileGameHeader } from "../components/MobileGameHeader";
import { MobileSpectatorBadge, MobileHostBadge } from "../../components/shared/SpectatorBadge";
import { MobileSpectatorOverlay } from "../../components/shared/SpectatorOverlay";
import { RoundCountdown } from "../../components/shared/RoundCountdown";
import { MobileGameNotFound } from "../components/MobileGameNotFound";
import { callGameSecretInit, useGameSecret } from "../../lib/game-secrets";
import { useGameSounds, playSoundSubmit } from "../../hooks/useGameSounds";
import { playVote } from "../../lib/sounds";

/** Redact a clue by showing one contiguous chunk of each word. */
function redactClue(text: string, visibility = DEFAULT_IMPOSTER_CLUE_VISIBILITY): string {
  const clampedVisibility = Number.isFinite(visibility)
    ? Math.min(1, Math.max(0, visibility))
    : DEFAULT_IMPOSTER_CLUE_VISIBILITY;

  if (clampedVisibility >= 1) return text;

  return text.split(" ").map((word) => {
    const len = word.length;
    if (clampedVisibility <= 0) return "_".repeat(len);
    if (len <= 2) return "_".repeat(len);
    const showCount = Math.max(1, Math.floor(len * clampedVisibility));
    const start = Math.min(Math.floor(len * 0.2), len - showCount);
    return word.split("").map((ch, i) =>
      i >= start && i < start + showCount ? ch : "_"
    ).join("");
  }).join(" ");
}

export function MobileImposterPage({ sessionId }: { sessionId: string }) {
  const zero = useZero();
  const navigate = useNavigate();
  const params = useParams();
  const gameId = params.id ?? "";
  const [games] = useQuery(queries.imposter.byId({ id: gameId }));
  const [sessions] = useQuery(queries.sessions.byGame({ gameType: "imposter", gameId }));
  const [mySessionRows] = useQuery(queries.sessions.byId({ id: sessionId }));
  const game = games[0];
  const [clue, setClue] = useState("");
  const [voteTarget, setVoteTarget] = useState("");
  const [visibleSecretWord, setVisibleSecretWord] = useState<string | null>(null);
  const [decryptedRoundWords, setDecryptedRoundWords] = useState<Record<number, string | null>>({});
  const [showInSessionModal, setShowInSessionModal] = useState(false);
  const [joiningFromOtherGame, setJoiningFromOtherGame] = useState(false);
  const clueInputRef = useRef<HTMLInputElement>(null);
  const prevAnnouncementRef = useRef<{ text: string; ts: number } | null>(null);

  const isHost = game?.host_id === sessionId;
  const me = useMemo(() => game?.players.find((p) => p.sessionId === sessionId), [game, sessionId]);

  useGameSounds({
    phase: game?.phase,
    sessionId,
    isMyTurn: Boolean(me && !me.eliminated && (game?.phase === "playing" || game?.phase === "voting")),
    phaseEndsAt: game?.settings.phaseEndsAt,
  });
  const inGame = Boolean(me);
  const isSpectator = useMemo(() => game?.spectators?.some((s) => s.sessionId === sessionId) ?? false, [game, sessionId]);
  const mySession = mySessionRows[0];
  const activeGameType = (mySession?.game_type ?? null) as SessionGameType | null;
  const activeGameId = mySession?.game_id ?? null;
  const inAnotherGame = Boolean(activeGameType && activeGameId && (activeGameType !== "imposter" || activeGameId !== gameId));

  const sessionById = useMemo(() => {
    return sessions.reduce<Record<string, string>>((acc, s) => {
      acc[s.id] = getDisplayName(s.name, s.id);
      return acc;
    }, {});
  }, [sessions]);

  useMobileHostRegister(
    isHost && game
      ? { type: "imposter", gameId, hostId: game.host_id, players: game.players.map((p) => ({ sessionId: p.sessionId, name: sessionById[p.sessionId] ?? getDisplayName(p.name, p.sessionId) })), spectators: game.spectators ?? [] }
      : null
  );

  const inGameRef = useRef(inGame);
  const phaseRef = useRef(game?.phase);
  const isSpectatorRef = useRef(isSpectator);
  inGameRef.current = inGame;
  phaseRef.current = game?.phase;
  isSpectatorRef.current = isSpectator;

  useEffect(() => {
    if (isSpectator) {
      showToast("You are a spectator", "info");
    }
  }, [isSpectator]);

  useEffect(() => {
    let active = false;
    const timer = setTimeout(() => { active = true; }, 500);
    return () => {
      clearTimeout(timer);
      if (active && isSpectatorRef.current) {
        void zero.mutate(mutators.imposter.leaveSpectator({ gameId, sessionId }));
      } else if (active && inGameRef.current && phaseRef.current !== "ended") {
        void zero.mutate(mutators.imposter.leave({ gameId, sessionId }));
      }
    };
  }, [gameId, sessionId, zero]);

  const tally = useMemo(() => {
    if (!game) return {} as Record<string, number>;
    return game.votes.reduce<Record<string, number>>((acc, v) => {
      acc[v.targetId] = (acc[v.targetId] ?? 0) + 1;
      return acc;
    }, {});
  }, [game]);

  const { decryptValue } = useGameSecret({
    gameType: "imposter",
    gameId,
    sessionId,
    enabled: Boolean(game && game.phase !== "lobby")
  });

  useEffect(() => {
    let cancelled = false;
    if (!game?.secret_word) {
      setVisibleSecretWord(null);
      return;
    }
    void decryptValue(game.secret_word).then((value) => {
      if (!cancelled) {
        setVisibleSecretWord(value);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [game?.secret_word, decryptValue]);

  useEffect(() => {
    let cancelled = false;
    const roundHistory = game?.round_history ?? [];
    if (roundHistory.length === 0) {
      setDecryptedRoundWords({});
      return;
    }

    void Promise.all(
      roundHistory.map(async (round) => ({
        round: round.round,
        value: round.secretWord ? await decryptValue(round.secretWord) : null
      }))
    ).then((rows) => {
      if (cancelled) return;
      setDecryptedRoundWords(
        rows.reduce<Record<number, string | null>>((acc, row) => {
          acc[row.round] = row.value;
          return acc;
        }, {})
      );
    });

    return () => {
      cancelled = true;
    };
  }, [game?.round_history, decryptValue]);

  useEffect(() => {
    if (!game || !isHost || game.phase !== "playing" || !game.secret_word) return;
    if (isEncrypted(game.secret_word)) return;
    void callGameSecretInit("imposter", gameId, sessionId);
  }, [game, game?.phase, game?.secret_word, isHost, gameId, sessionId]);

  // Countdown timer for timed phases
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  useEffect(() => {
    const endsAt = game?.settings.phaseEndsAt;
    if (!endsAt) { setTimeLeft(null); return; }
    const tick = () => setTimeLeft(Math.max(0, Math.floor((endsAt - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [game?.settings.phaseEndsAt]);

  useEffect(() => {
    if (!game) return;
    addRecentGame({ id: game.id, code: game.code, gameType: "imposter" });
  }, [game]);

  useEffect(() => {
    if (!game) return;
    if (game.phase === "ended") { showToast("The host ended the game", "info"); navigate("/"); return; }
    if (game.kicked.includes(sessionId)) { showToast("You were kicked from the game", "error"); navigate("/"); }
  }, [game?.phase, game?.kicked, sessionId, navigate]);

  useEffect(() => {
    if (!game) return;
    const phaseEnd = game.settings.phaseEndsAt;
    if (!phaseEnd || (game.phase !== "playing" && game.phase !== "voting" && game.phase !== "results")) return;
    const remaining = phaseEnd - Date.now();
    if (remaining <= 0) { void zero.mutate(mutators.imposter.advanceTimer({ gameId })); return; }
    const timer = setTimeout(() => { void zero.mutate(mutators.imposter.advanceTimer({ gameId })); }, remaining + 500);
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
    const hasSubmitted = Boolean(game?.clues.some((c) => c.sessionId === sessionId));
    if (game?.phase !== "playing" || isSpectator || !inGame || me?.eliminated || hasSubmitted) return;
    const input = clueInputRef.current;
    if (!input) return;
    const timer = window.setTimeout(() => {
      input.focus();
      input.select();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [game?.phase, game?.settings.currentRound, isSpectator, inGame, me?.eliminated, sessionId]);

  if (!game) return <MobileGameNotFound theme="imposter" />;

  const submitClue = async (event: FormEvent) => {
    event.preventDefault();
    if (!clue.trim()) return;
    await zero.mutate(mutators.imposter.submitClue({ gameId, sessionId, text: clue.trim() })).server;
    setClue("");
    playSoundSubmit();
  };

  const submitVote = async () => {
    if (!voteTarget) return;
    await zero.mutate(mutators.imposter.submitVote({ gameId, voterId: sessionId, targetId: voteTarget })).server;
    playVote();
  };

  const joinGame = async () => {
    await ensureName(zero, sessionId);
    if (isSpectator) {
      void zero.mutate(mutators.imposter.leaveSpectator({ gameId, sessionId }))
        .client.then(() => zero.mutate(mutators.imposter.join({ gameId, sessionId })))
        .catch(() => showToast("Couldn't join game", "error"));
      return;
    }
    void zero.mutate(mutators.imposter.join({ gameId, sessionId }))
      .client.catch(() => showToast("Couldn't join game", "error"));
  };

  const handleJoinClick = () => {
    if (inAnotherGame && activeGameType && activeGameId) {
      setJoiningFromOtherGame(true);
      void leaveCurrentGame(zero, sessionId, activeGameType, activeGameId)
        .catch(() => showToast("Couldn't leave current game", "error"))
        .finally(() => {
          setJoiningFromOtherGame(false);
          void joinGame();
        });
      return;
    }
    void joinGame();
  };

  const confirmLeaveAndJoin = () => {
    if (!activeGameType || !activeGameId) {
      setShowInSessionModal(false);
      void joinGame();
      return;
    }
    setJoiningFromOtherGame(true);
    void leaveCurrentGame(zero, sessionId, activeGameType, activeGameId)
      .then(() => {
        setShowInSessionModal(false);
        void joinGame();
      })
      .catch(() => showToast("Couldn't leave current game", "error"))
      .finally(() => setJoiningFromOtherGame(false));
  };

  const revealRoles = game.phase === "finished";
  // During results, only reveal the voted-out player's role
  const mobileVotedOutId = game.phase === "results" ? (() => {
    const t = game.votes.reduce<Record<string, number>>((acc, v) => { acc[v.targetId] = (acc[v.targetId] ?? 0) + 1; return acc; }, {});
    const max = Math.max(...Object.values(t), 0);
    return Object.entries(t).find(([, count]) => count === max && max > 0)?.[0] ?? null;
  })() : null;

  return (
    <div className="m-page" data-game-theme="imposter">
      <MobileGameHeader
        code={game.code}
        gameLabel="Imposter"
        phase={game.phase}
        round={game.settings.currentRound}
        totalRounds={game.settings.rounds}
        accent="var(--game-accent)"
        category={game.category}
      >
        {isSpectator && <MobileSpectatorBadge />}
        {isHost && <MobileHostBadge />}
        {timeLeft != null && (
          <span className={`m-timer${timeLeft <= 10 ? " m-timer--danger" : " m-timer--warn"}`}>
            <FiClock size={14} /> {String(Math.floor(timeLeft / 60)).padStart(2, "0")}:{String(timeLeft % 60).padStart(2, "0")}
          </span>
        )}
      </MobileGameHeader>

      {/* Players */}
      <div className="m-card">
        <h3 className="m-card-title">Players <span style={{ opacity: 0.5, fontWeight: 400 }}>{game.players.filter((p) => !p.eliminated).length}/{game.players.length}</span></h3>
        <div className="m-player-chips m-players-row--strip">
          {game.players.map((p, playerIndex) => {
            const name = sessionById[p.sessionId] ?? getDisplayName(p.name, p.sessionId);
            const showRole = revealRoles || p.sessionId === mobileVotedOutId;
            const isImposter = showRole && p.role === "imposter";
            const isMe = p.sessionId === sessionId;
            const isEliminated = Boolean(p.eliminated);
            return (
              <div
                key={p.sessionId}
                className={`m-player-chip${isImposter ? " m-player-chip--danger" : ""}${isMe ? " m-player-chip--me" : ""}${isEliminated ? " m-player-chip--eliminated" : ""}`}
                style={isEliminated ? { opacity: 0.45, textDecoration: "line-through" } : undefined}
              >
                <span className="m-player-avatar">{isEliminated ? "☠" : (
                  <BorringAvatar
                    seed={p.sessionId}
                    playerIndex={playerIndex}
                  />
                )}</span>
                <span className="m-player-name">{name}</span>
                {isEliminated && <span className="m-badge m-badge--muted" style={{ fontSize: "0.75rem" }}>OUT</span>}
                {!isEliminated && isImposter && <span className="m-badge m-badge--danger" style={{ fontSize: "0.75rem" }}>IMP</span>}
                {!isEliminated && showRole && !isImposter && p.role && <span className="m-badge m-badge--success" style={{ fontSize: "0.75rem" }}>OK</span>}
              </div>
            );
          })}
        </div>
      </div>

      {/* Lobby: Join prompt */}
      {game.phase === "lobby" && !inGame && (
        <div className="m-card" style={{ textAlign: "center" }}>
          <p style={{ marginBottom: "0.75rem", opacity: 0.7 }}>{isSpectator ? "You're spectating. Join to play!" : "You're not in this lobby yet."}</p>
          <button
            className="m-btn m-btn-primary"
            style={{ width: "100%" }}
            onClick={handleJoinClick}
          >
            <FiLogIn size={16} /> Join Game
          </button>
        </div>
      )}

      {/* Lobby: Actions */}
      {game.phase === "lobby" && inGame && (
        <div className="m-card m-bottom-safe">
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {isHost && (
              <div style={{ display: "flex", justifyContent: "center" }}>
                <LobbyVisibilityToggle gameType="imposter" gameId={gameId} sessionId={sessionId} isPublic={game.is_public} />
              </div>
            )}
            {isHost && game.players.length >= 3 && (
              <button
                className="m-btn m-btn-primary"
                style={{ width: "100%" }}
                onClick={() => void zero.mutate(mutators.imposter.start({ gameId, hostId: sessionId }))}
              >
                Start Game
              </button>
            )}
            {isHost && game.players.length < 3 && (
              <p style={{ textAlign: "center", opacity: 0.6, fontSize: "0.85rem" }}>Need at least 3 players to start</p>
            )}
            {isHost && game.players.length === 3 && (
              <p style={{ textAlign: "center", opacity: 0.5, fontSize: "0.8rem" }}>4+ players recommended</p>
            )}
            <button
              className="m-btn m-btn-muted"
              style={{ width: "100%" }}
              onClick={() => void zero.mutate(mutators.imposter.leave({ gameId, sessionId }))}
            >
              Leave Game
            </button>
          </div>
        </div>
      )}

      {isSpectator && game.phase !== "lobby" && (
        <MobileSpectatorOverlay
          playerCount={game.players.filter((p) => !p.eliminated).length}
          phase={game.phase}
          onLeave={() => void zero.mutate(mutators.imposter.leaveSpectator({ gameId, sessionId })).client.then(() => navigate("/"))}
        />
      )}

      {/* Playing: Clue section */}
      {!isSpectator && game.phase === "playing" && inGame && !me?.eliminated && (() => {
        const isImposter = me?.role === "imposter";
        const hasSubmitted = game.clues.some((c) => c.sessionId === sessionId);
        const othersClues = game.clues.filter((c) => c.sessionId !== sessionId);
        const clueVisibility = game.settings.clueVisibility ?? DEFAULT_IMPOSTER_CLUE_VISIBILITY;

        return (
          <div className="m-card">
            {game.category && (
              <p style={{ fontSize: "0.75rem", color: "var(--secondary)", textAlign: "center", marginBottom: "0.4rem" }}>
                Category: <strong style={{ color: "var(--foreground)" }}>{imposterCategoryLabels[game.category] ?? game.category}</strong>
              </p>
            )}
            <div className={`m-role-card${isImposter ? " m-role-card--danger" : ""}`}>
              <div className="m-role-icon">
                {isImposter ? <FiEyeOff size={22} /> : <FiEye size={22} />}
              </div>
              <div>
                <p className="m-role-title">
                  {isImposter ? "You are the Imposter" : "You are a Player"}
                </p>
                {!isImposter && visibleSecretWord && (
                  <p className="m-role-word">Secret word: <strong>{visibleSecretWord}</strong></p>
                )}
                {isImposter && (
                  <p className="m-role-hint">Blend in! Give a believable clue.</p>
                )}
              </div>
            </div>

            {isImposter && clueVisibility !== 0 && othersClues.length > 0 && (
              <div style={{ marginTop: "0.5rem" }}>
                <p style={{ fontSize: "0.75rem", opacity: 0.6, marginBottom: "0.25rem" }}>Hints from other clues</p>
                <div className="m-clue-recap">
                  {othersClues.map((c) => {
                    const name = sessionById[c.sessionId] ?? getDisplayName(null, c.sessionId);
                    return (
                      <div key={c.sessionId} className="m-clue-item">
                        <span className="m-clue-name">{name}</span>
                        <span className="m-clue-text" style={{ fontFamily: "monospace", letterSpacing: "0.04em" }}>
                          {redactClue(c.text, clueVisibility)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {hasSubmitted ? (
              <div className="m-card m-card--success" style={{ marginTop: "0.75rem", padding: "0.75rem", textAlign: "center" }}>
                <p style={{ fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", gap: "0.4rem" }}>
                  <FiCheck size={16} /> Clue Submitted!
                </p>
                <p style={{ fontSize: "0.8rem", opacity: 0.7 }}>Waiting for other players…</p>
              </div>
            ) : (
              <form className="m-input-row" onSubmit={submitClue} style={{ marginTop: "0.75rem" }}>
                <input
                  ref={clueInputRef}
                  className="m-input"
                  onFocus={(e) => e.currentTarget.select()}
                  style={{ flex: 1 }}
                  value={clue}
                  onChange={(e) => setClue(e.target.value)}
                  placeholder={isImposter ? "Give a vague clue…" : "Clue about the word…"}
                  maxLength={80}
                />
                <button type="submit" className="m-btn m-btn-primary" disabled={!clue.trim()} onMouseDown={(e) => e.preventDefault()}>
                  <FiSend size={14} />
                </button>
              </form>
            )}

            <p className="m-progress-text">Clues: {game.clues.length} / {game.players.filter((p) => !p.eliminated).length}</p>
          </div>
        );
      })()}

      {/* Playing: Waiting (spectator) */}
      {!isSpectator && game.phase === "playing" && (!inGame || me?.eliminated) && (
        <div className="m-card">
          <div className="m-waiting">
            <div className="m-waiting-pulse" />
            <p>{me?.eliminated && isHost ? "You've been eliminated. Still hosting!" : me?.eliminated ? "You've been eliminated. Spectating!" : "Players are submitting clues!"} ({game.clues.length}/{game.players.filter((p) => !p.eliminated).length})</p>
          </div>
        </div>
      )}

      {/* Voting */}
      {!isSpectator && game.phase === "voting" && inGame && !me?.eliminated && (() => {
        const hasVoted = game.votes.some((v) => v.voterId === sessionId);
        const votedName = voteTarget ? (sessionById[voteTarget] ?? getDisplayName(null, voteTarget)) : null;
        const activePlayers = game.players.filter((p) => !p.eliminated);
        const votablePlayers = activePlayers.reduce<typeof activePlayers>((players, player) => {
          if (player.sessionId !== sessionId) {
            players.push(player);
          }
          return players;
        }, []);

        return (
          <div className="m-card">
            <h3 className="m-card-title">Who is the imposter?</h3>

            {/* Clue recap */}
            <div className="m-clue-recap">
              {activePlayers.map((p) => {
                const name = sessionById[p.sessionId] ?? getDisplayName(p.name, p.sessionId);
                const clueText = game.clues.find(c => c.sessionId === p.sessionId)?.text;
                return (
                  <div key={p.sessionId} className="m-clue-item">
                    <span className="m-clue-name">{name}</span>
                    <span className="m-clue-text">{clueText ?? "-"}</span>
                  </div>
                );
              })}
            </div>

            {hasVoted ? (
              <div className="m-card m-card--success" style={{ marginTop: "0.75rem", padding: "0.75rem", textAlign: "center" }}>
                <p style={{ fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", gap: "0.4rem" }}>
                  <FiCheck size={16} /> Vote Submitted!
                </p>
                <p style={{ fontSize: "0.8rem", opacity: 0.7 }}>You voted for <strong>{votedName}</strong>. Waiting for others…</p>
              </div>
            ) : (
              <>
                {/* Vote grid */}
                <div className="m-vote-grid">
                  {votablePlayers.map((p) => {
                      const name = sessionById[p.sessionId] ?? getDisplayName(p.name, p.sessionId);
                      const selected = voteTarget === p.sessionId;
                      return (
                        <button
                          key={p.sessionId}
                          className={`m-vote-card${selected ? " m-vote-card--selected" : ""}`}
                          onClick={() => setVoteTarget(p.sessionId)}
                        >
                          <span className="m-player-avatar">
                            <BorringAvatar
                              seed={p.sessionId}
                              playerIndex={game.players.findIndex(pl => pl.sessionId === p.sessionId)}
                            />
                          </span>
                          <span>{name}</span>
                          {selected && <FiCheck size={14} />}
                        </button>
                      );
                    })}
                </div>

                <button
                  className="m-btn m-btn-primary"
                  style={{ width: "100%", marginTop: "0.75rem" }}
                  onClick={() => void submitVote()}
                  disabled={!voteTarget}
                >
                  Submit Vote
                </button>
              </>
            )}

            <p className="m-progress-text">Votes: {game.votes.length} / {activePlayers.length}</p>
          </div>
        );
      })()}

      {/* Voting: Waiting (spectator) */}
      {!isSpectator && game.phase === "voting" && (!inGame || me?.eliminated) && (
        <div className="m-card">
          <div className="m-waiting">
            <div className="m-waiting-pulse" />
            <p>{me?.eliminated && isHost ? "You've been eliminated. Still hosting!" : me?.eliminated ? "You've been eliminated. Spectating!" : "Players are voting!"} ({game.votes.length}/{game.players.filter((p) => !p.eliminated).length})</p>
          </div>
        </div>
      )}

      {/* Results */}
      {!isSpectator && game.phase === "results" && (() => {
        const activePlayers = game.players.filter((p) => !p.eliminated);
        const maxVotes = Math.max(...Object.values(tally), 1);
        const topVoteCount = Math.max(...Object.values(tally), 0);
        const votedOutId = Object.entries(tally).find(([, count]) => count === topVoteCount && topVoteCount > 0)?.[0] ?? null;
        const votedOutPlayer = votedOutId ? activePlayers.find((p) => p.sessionId === votedOutId) : null;
        const votedOutName = votedOutPlayer ? (sessionById[votedOutPlayer.sessionId] ?? getDisplayName(votedOutPlayer.name, votedOutPlayer.sessionId)) : null;
        const wasImposter = votedOutPlayer?.role === "imposter";
        const voteLines = game.votes.map((vote) => {
          const voter = sessionById[vote.voterId] ?? getDisplayName(null, vote.voterId);
          const target = sessionById[vote.targetId] ?? getDisplayName(null, vote.targetId);
          return { id: `${vote.voterId}->${vote.targetId}`, text: `${voter} → ${target}` };
        });

        return (
          <>
            <div className={`m-card ${wasImposter ? "m-card--success" : "m-card--danger"}`}>
              {votedOutName ? (
                <>
                  <h3 className="m-reveal-title">{votedOutName} was voted out!</h3>
                  <p className="m-reveal-sub">
                    They were {wasImposter
                      ? <strong style={{ color: "#f87171" }}>the Imposter!</strong>
                      : <strong style={{ color: "#4ade80" }}>innocent.</strong>}
                  </p>
                </>
              ) : (
                <>
                  <h3 className="m-reveal-title">No one was voted out!</h3>
                  <p className="m-reveal-sub">Not enough votes were cast.</p>
                </>
              )}
              {game.secret_word && (
                <p className="m-reveal-word">The word was: <strong>{visibleSecretWord ?? "••••"}</strong></p>
              )}
            </div>

            <div className="m-card">
              <h3 className="m-card-title">Vote Breakdown</h3>
              {voteLines.length > 0 ? (
                <details className="m-imposter-ballots">
                  <summary>Ballots</summary>
                  <div>
                  {voteLines.map((line) => (
                    <p key={line.id} style={{ margin: 0, fontSize: "0.85rem", opacity: 0.9 }}>{line.text}</p>
                  ))}
                  </div>
                </details>
              ) : (
                <p style={{ margin: "0 0 0.65rem", opacity: 0.7 }}>No votes recorded.</p>
              )}

              <h4 style={{ margin: "0 0 0.5rem", fontSize: "0.9rem" }}>Vote Totals</h4>
              <div className="m-imposter-vote-lines">
                {activePlayers.map((p) => {
                  const name = sessionById[p.sessionId] ?? getDisplayName(p.name, p.sessionId);
                  const voteCount = tally[p.sessionId] ?? 0;
                  const pct = maxVotes > 0 ? (voteCount / maxVotes) * 100 : 0;
                  const isVotedOut = p.sessionId === votedOutId;
                  const voterNames = game.votes.reduce<string[]>((names, vote) => {
                    if (vote.targetId === p.sessionId) {
                      names.push(sessionById[vote.voterId] ?? getDisplayName(null, vote.voterId));
                    }
                    return names;
                  }, []);
                  return (
                    <div key={p.sessionId} className={`m-vote-total-card${isVotedOut ? " m-vote-total-card--danger" : ""}`}>
                      <div className="m-vote-total-head">
                        <div className="m-vote-total-player">
                          <span className="m-player-avatar">
                            <BorringAvatar
                              seed={p.sessionId}
                              playerIndex={game.players.findIndex((pl) => pl.sessionId === p.sessionId)}
                            />
                          </span>
                          <span className={`m-vote-total-name${isVotedOut ? " m-result-name--danger" : ""}`}>{name}</span>
                        </div>
                        <span className="m-vote-total-badge">
                          {voteCount} {voteCount === 1 ? "vote" : "votes"}{isVotedOut ? " - Out" : ""}
                        </span>
                      </div>
                      <div className="m-vote-total-track">
                        <div className={`m-vote-total-fill${isVotedOut ? " m-result-bar--danger" : ""}`} style={{ width: `${pct}%` }} />
                      </div>
                      {voterNames.length > 0 && (
                        <p className="m-vote-total-voters">
                          Voted by: {voterNames.join(", ")}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="m-card m-bottom-safe" style={{ textAlign: "center" }}>
              <RoundCountdown endsAt={game.settings.phaseEndsAt} label="Next round" />
              <button
                className={`m-btn ${(game.settings.skipVotes ?? []).includes(sessionId) ? "m-btn-muted" : "m-btn-primary"}`}
                style={{ width: "100%", marginTop: "0.5rem" }}
                onClick={() => void zero.mutate(mutators.imposter.voteSkipResults({ gameId, sessionId }))}
                disabled={(game.settings.skipVotes ?? []).includes(sessionId)}
              >
                {(game.settings.skipVotes ?? []).includes(sessionId)
                  ? `Voted to Skip (${(game.settings.skipVotes ?? []).length}/${activePlayers.length})`
                  : `Skip (${(game.settings.skipVotes ?? []).length}/${activePlayers.length})`}
              </button>
            </div>
          </>
        );
      })()}

      {/* Finished */}
      {!isSpectator && game.phase === "finished" && (() => {
        const impostersLeft = game.players.filter((p) => p.role === "imposter" && !p.eliminated).length;
        const playersWin = impostersLeft === 0;
        const imposters = game.players.filter((p) => p.role === "imposter");
        const imposterNames = imposters.map((p) => sessionById[p.sessionId] ?? getDisplayName(p.name, p.sessionId));

        return (
          <>
            <div className={`m-card ${playersWin ? "m-card--success" : "m-card--danger"}`}>
              <h3 className="m-reveal-title">{playersWin ? "Players Win!" : "Imposters Win!"}</h3>
              <p className="m-reveal-sub">
                {playersWin ? "All imposters have been found!" : "The imposters survived!"}
              </p>
              <p className="m-reveal-sub">
                {imposters.length > 1 ? "The imposters were " : "The imposter was "}
                <strong>{imposterNames.join(", ")}</strong>
              </p>
              {game.secret_word && (
                <p className="m-reveal-word">The word was: <strong>{visibleSecretWord ?? "••••"}</strong></p>
              )}
            </div>

            {(game.round_history ?? []).length > 0 && (
              <div className="m-card">
                <h3 className="m-card-title">Round Summary</h3>
                <div className="m-data-table-wrap">
                  <table className="m-data-table">
                    <thead>
                      <tr><th>#</th><th>Word</th><th>Voted Out</th><th>Role</th></tr>
                    </thead>
                    <tbody>
                      {(game.round_history ?? []).map((rh) => (
                        <tr key={rh.round}>
                          <td>{rh.round}</td>
                          <td style={{ color: "var(--primary)", fontWeight: 600 }}>{rh.secretWord ? (decryptedRoundWords[rh.round] ?? "••••") : "-"}</td>
                          <td style={{ fontWeight: 600 }}>{rh.votedOutName ?? "No one"}</td>
                          <td style={{ color: rh.wasImposter ? "#f87171" : "#4ade80", fontWeight: 600 }}>
                            {rh.votedOutName ? (rh.wasImposter ? "Imposter" : "Innocent") : "-"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

          <div className="m-card m-bottom-safe">
            {isHost ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                <button
                  className="m-btn m-btn-primary"
                  style={{ width: "100%" }}
                  onClick={() => void zero.mutate(mutators.imposter.resetToLobby({ gameId, hostId: sessionId }))}
                >
                  Play Again
                </button>
                <button
                  className="m-btn m-btn-muted"
                  style={{ width: "100%" }}
                  onClick={() => {
                    void zero.mutate(mutators.imposter.endGame({ gameId, hostId: sessionId }))
                      .client.then(() => navigate("/"))
                      .catch(() => showToast("Couldn't end game", "error"));
                  }}
                >
                  End Game
                </button>
              </div>
            ) : (
              <button className="m-btn m-btn-muted" style={{ width: "100%" }} onClick={() => navigate("/")}>
                Back to Home
              </button>
            )}
          </div>
          </>
        );
      })()}

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
