import { mutators, queries } from "@games/shared";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { FiLogIn, FiLogOut, FiPlay, FiPlus, FiSend, FiX, FiMinus } from "react-icons/fi";
import { usePresenceSocket } from "../hooks/usePresenceSocket";
import { addRecentGame } from "../lib/session";
import { showToast } from "../lib/toast";
import { RoundCountdown } from "../components/shared/RoundCountdown";

export function ChainReactionPage({ sessionId }: { sessionId: string }) {
  const zero = useZero();
  const navigate = useNavigate();
  const params = useParams();
  const gameId = params.id ?? "";
  const [games] = useQuery(queries.chainReaction.byId({ id: gameId }));
  const [sessions] = useQuery(queries.sessions.byGame({ gameType: "chain_reaction", gameId }));
  useQuery(queries.sessions.byId({ id: sessionId }));
  const game = games[0];

  const [selectedWord, setSelectedWord] = useState<number | null>(null);
  const [guess, setGuess] = useState("");
  const prevAnnouncementTs = useRef<number | null>(null);

  // Chain builder state
  const [chainMode, setChainMode] = useState<"premade" | "custom">("premade");
  const [customWords, setCustomWords] = useState<string[]>(["", "", "", "", ""]);

  usePresenceSocket({ sessionId, gameId, gameType: "chain_reaction" });

  const isHost = game?.host_id === sessionId;
  const me = useMemo(() => game?.players.find((p) => p.sessionId === sessionId), [game, sessionId]);
  const inGame = Boolean(me);
  const isMyTurn = game?.current_turn === sessionId;

  const inGameRef = useRef(inGame);
  const phaseRef = useRef(game?.phase);
  inGameRef.current = inGame;
  phaseRef.current = game?.phase;

  // Unmount cleanup — leave game when navigating away
  useEffect(() => {
    let active = false;
    const timer = setTimeout(() => { active = true; }, 500);
    return () => {
      clearTimeout(timer);
      if (active && inGameRef.current && phaseRef.current !== "ended") {
        void zero.mutate(mutators.chainReaction.leave({ gameId, sessionId }));
      }
    };
  }, [gameId, sessionId, zero]);

  const sessionById = useMemo(() => {
    return sessions.reduce<Record<string, string>>((acc, s) => {
      acc[s.id] = s.name ?? s.id.slice(0, 6);
      return acc;
    }, {});
  }, [sessions]);

  const playerName = (id: string) => sessionById[id] ?? id.slice(0, 6);

  useEffect(() => {
    if (!game) return;
    addRecentGame({ id: game.id, code: game.code, gameType: "chain_reaction" });
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

  // Announcement watcher
  useEffect(() => {
    if (!game?.announcement) return;
    if (prevAnnouncementTs.current !== game.announcement.ts) {
      prevAnnouncementTs.current = game.announcement.ts;
      if (!isHost) showToast(`📢 ${game.announcement.text}`, "info");
    }
  }, [game?.announcement, isHost]);

  // Reset selection between rounds
  useEffect(() => {
    setSelectedWord(null);
    setGuess("");
  }, [game?.settings.currentRound]);

  if (!game) {
    return (
      <div className="game-page">
        <div className="game-empty"><p>Game not found</p></div>
      </div>
    );
  }

  const revealAndGuess = async (event: FormEvent) => {
    event.preventDefault();
    if (selectedWord === null || !guess.trim()) return;

    try {
      // Reveal a letter first
      await zero.mutate(mutators.chainReaction.revealLetter({ gameId, sessionId, wordIndex: selectedWord })).server;
    } catch {
      // Might fail if all revealable letters are shown — that's ok, proceed to guess
    }

    try {
      await zero.mutate(mutators.chainReaction.guess({
        gameId,
        sessionId,
        wordIndex: selectedWord,
        guess: guess.trim()
      })).server;
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Guess failed", "error");
    }

    setGuess("");
    setSelectedWord(null);
  };

  const opponent = game.players.find((p) => p.sessionId !== sessionId);

  return (
    <div className="game-page">
      {/* Header */}
      <div className="game-header">
        <div className="game-header-top">
          <span className="game-code">Code: <strong>{game.code}</strong></span>
          <span className="game-phase-badge game-phase-badge--chain">{game.phase}</span>
        </div>
        {game.phase === "playing" && (
          <div className="game-header-meta">
            <span>Round {game.settings.currentRound}/{game.settings.rounds}</span>
            {game.settings.phaseEndsAt && (
              <RoundCountdown endsAt={game.settings.phaseEndsAt} label="Turn" />
            )}
          </div>
        )}
      </div>

      {/* Scoreboard */}
      {game.phase !== "lobby" && (
        <div className="game-section">
          <div className="cr-scoreboard">
            {game.players.map((p) => (
              <div
                key={p.sessionId}
                className={`cr-score-card ${game.current_turn === p.sessionId ? "cr-score-card--active" : ""}`}
              >
                <span className="cr-score-name">
                  {playerName(p.sessionId)}
                  {p.sessionId === sessionId && " (you)"}
                </span>
                <span className="cr-score-value">{game.scores[p.sessionId] ?? 0}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Players list (lobby) */}
      {game.phase === "lobby" && (
        <div className="game-section">
          <h3 className="game-section-label">Players ({game.players.length}/2)</h3>
          <div className="game-players">
            {game.players.map((p) => (
              <div key={p.sessionId} className="game-player">
                <span className="game-player-name">
                  {playerName(p.sessionId)}
                  {p.sessionId === game.host_id && " 👑"}
                  {p.sessionId === sessionId && " (you)"}
                </span>
                {isHost && p.sessionId !== sessionId && (
                  <button
                    className="btn-icon btn-icon--danger"
                    title="Kick"
                    onClick={() => void zero.mutate(mutators.chainReaction.kick({ gameId, hostId: sessionId, targetId: p.sessionId }))}
                  >
                    <FiX size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Join prompt */}
      {game.phase === "lobby" && !inGame && (
        <div className="game-section game-join-prompt">
          <p className="game-join-text">You're not in this lobby yet.</p>
          <button
            className="btn btn-primary game-action-btn"
            onClick={() =>
              void zero.mutate(mutators.chainReaction.join({ gameId, sessionId }))
                .client.catch(() => showToast("Couldn't join game", "error"))
            }
          >
            <FiLogIn size={16} /> Join Game
          </button>
        </div>
      )}

      {/* Lobby actions */}
      {game.phase === "lobby" && inGame && (
        <div className="game-section">
          {game.players.length < 2 && (
            <p className="game-hint">Need 2 players to start (waiting for 1 more)</p>
          )}

          {/* Chain mode picker (host only) */}
          {isHost && (
            <div className="cr-chain-builder">
              <h3 className="game-section-label">Word Chain</h3>
              <div className="cr-mode-toggle">
                <button
                  className={`btn btn-sm ${chainMode === "premade" ? "btn-primary" : "btn-muted"}`}
                  onClick={() => setChainMode("premade")}
                >
                  Random
                </button>
                <button
                  className={`btn btn-sm ${chainMode === "custom" ? "btn-primary" : "btn-muted"}`}
                  onClick={() => setChainMode("custom")}
                >
                  Custom
                </button>
              </div>

              {chainMode === "premade" ? (
                <p className="cr-mode-desc">A random word chain will be picked each round.</p>
              ) : (
                <div className="cr-custom-chain">
                  <p className="cr-mode-desc">Enter your own chain of connected words (first &amp; last are revealed as hints).</p>
                  <div className="cr-custom-words">
                    {customWords.map((word, i) => (
                      <div key={i} className="cr-custom-word-row">
                        <span className="cr-custom-word-num">{i + 1}</span>
                        <input
                          className="input cr-custom-word-input"
                          value={word}
                          onChange={(e) => {
                            const next = [...customWords];
                            next[i] = e.target.value;
                            setCustomWords(next);
                          }}
                          placeholder={i === 0 ? "First word (shown)" : i === customWords.length - 1 ? "Last word (shown)" : `Hidden word ${i}`}
                          maxLength={20}
                        />
                        {customWords.length > 3 && (
                          <button
                            className="btn-icon btn-icon--danger"
                            title="Remove"
                            onClick={() => setCustomWords(customWords.filter((_, j) => j !== i))}
                          >
                            <FiMinus size={14} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                  {customWords.length < 10 && (
                    <button
                      className="btn btn-sm btn-muted cr-add-word-btn"
                      onClick={() => setCustomWords([...customWords, ""])}
                    >
                      <FiPlus size={14} /> Add Word
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="game-actions">
            {isHost ? (
              <button
                className="btn btn-primary game-action-btn"
                disabled={game.players.length !== 2 || (chainMode === "custom" && customWords.some((w) => !w.trim()))}
                onClick={() => {
                  const opts: { gameId: string; hostId: string; customChain?: string[] } = { gameId, hostId: sessionId };
                  if (chainMode === "custom") opts.customChain = customWords.map((w) => w.trim());
                  void zero.mutate(mutators.chainReaction.start(opts));
                }}
              >
                <FiPlay size={16} /> Start Game
              </button>
            ) : (
              <p className="game-waiting-text">Waiting for host to start…</p>
            )}
            <button
              className="btn btn-muted game-action-btn"
              onClick={() => void zero.mutate(mutators.chainReaction.leave({ gameId, sessionId }))}
            >
              <FiLogOut size={14} /> Leave
            </button>
          </div>
        </div>
      )}

      {/* Chain display */}
      {game.phase === "playing" && (
        <div className="game-section">
          <div className="cr-turn-indicator">
            {isMyTurn ? (
              <span className="cr-turn-you">Your turn — pick a word and guess!</span>
            ) : (
              <span className="cr-turn-waiting">{playerName(game.current_turn ?? "")}'s turn…</span>
            )}
          </div>

          <div className="cr-chain">
            {game.chain.map((slot, i) => (
              <div
                key={i}
                className={`cr-word-slot ${slot.revealed ? "cr-word-slot--revealed" : "cr-word-slot--hidden"} ${selectedWord === i && !slot.revealed ? "cr-word-slot--selected" : ""}`}
                onClick={() => {
                  if (!slot.revealed && isMyTurn) setSelectedWord(i);
                }}
              >
                {slot.revealed ? (
                  <span className="cr-word-text">{slot.word}</span>
                ) : (
                  <span className="cr-word-text">
                    {renderPartialWord(slot.word, slot.lettersShown)}
                  </span>
                )}
                {!slot.revealed && (
                  <span className="cr-word-hint">
                    {i > 0 && game.chain[i - 1]?.revealed ? `${game.chain[i - 1]!.word} + ?` : ""}
                    {i < game.chain.length - 1 && game.chain[i + 1]?.revealed ? ` → ? + ${game.chain[i + 1]!.word}` : ""}
                  </span>
                )}
              </div>
            ))}
          </div>

          {/* Guess input */}
          {isMyTurn && selectedWord !== null && (
            <form className="cr-guess-form" onSubmit={revealAndGuess}>
              <input
                className="input cr-guess-input"
                value={guess}
                onChange={(e) => setGuess(e.target.value)}
                placeholder={`Guess word #${selectedWord + 1}…`}
                maxLength={40}
                autoFocus
              />
              <button className="btn btn-primary" type="submit" disabled={!guess.trim()}>
                <FiSend size={14} /> Guess
              </button>
            </form>
          )}
        </div>
      )}

      {/* Spectator view */}
      {game.phase === "playing" && !inGame && (
        <div className="game-section">
          <div className="game-waiting">
            <div className="game-waiting-pulse" />
            <p>Game in progress — watching!</p>
          </div>
        </div>
      )}

      {/* Finished */}
      {game.phase === "finished" && (
        <div className="game-section">
          <div className="game-reveal-card game-reveal-card--success">
            <p className="game-reveal-title">Game Complete!</p>
            <p className="game-reveal-sub">
              {game.settings.rounds} round{game.settings.rounds !== 1 ? "s" : ""} played
            </p>
          </div>

          {/* Final scores */}
          <div className="cr-final-scores">
            {Object.entries(game.scores)
              .sort(([, a], [, b]) => b - a)
              .map(([id, score], rank) => (
                <div key={id} className={`cr-final-score ${rank === 0 ? "cr-final-score--winner" : ""}`}>
                  <span className="cr-final-rank">{rank === 0 ? "🏆" : "🥈"}</span>
                  <span className="cr-final-name">{playerName(id)}</span>
                  <span className="cr-final-pts">{score} pts</span>
                </div>
              ))}
          </div>

          {/* Round history */}
          {game.round_history.length > 0 && (
            <>
              <h3 className="game-section-label">Round History</h3>
              {game.round_history.map((r, ri) => (
                <div key={ri} className="cr-round-history-card">
                  <div className="cr-round-header">Round {r.round}</div>
                  <div className="cr-round-chain">
                    {r.chain.map((w, wi) => (
                      <span key={wi} className="cr-round-word">
                        {w.word}
                        {w.solvedBy && <span className="cr-round-solver"> ({playerName(w.solvedBy)})</span>}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </>
          )}

          <div className="game-actions" style={{ marginTop: "1rem" }}>
            {isHost && (
              <button
                className="btn btn-primary game-action-btn"
                onClick={() => void zero.mutate(mutators.chainReaction.endGame({ gameId, hostId: sessionId }))}
              >
                End Game
              </button>
            )}
            <button className="btn btn-muted game-action-btn" onClick={() => navigate("/")}>
              Back to Home
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function renderPartialWord(word: string, lettersShown: number): string {
  return word
    .split("")
    .map((ch, i) => (i < lettersShown ? ch : "_"))
    .join(" ");
}
