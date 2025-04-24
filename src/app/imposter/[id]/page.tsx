"use client";
import { useSessionInfo } from "../../_components/session-modal";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import React from "react";
import { Button } from "~/components/ui/button";
import shuffle from "lodash.shuffle";

export default function ImposterGamePage({ params }: { params: Promise<{ id: string }> }) {
  const actualParams = React.use(params);
  const { session } = useSessionInfo();
  const [game, setGame] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const router = useRouter();

  useEffect(() => {
    let firstLoad = true;
    let cancelled = false;
    async function fetchGame(isInitial = false) {
      if (isInitial) setLoading(true);
      setError("");
      try {
        const res = await fetch(`/api/imposter/${actualParams.id}`);
        if (res.ok) {
          const data = await res.json();
          if (!cancelled) setGame(data.game);
        } else {
          if (!cancelled) setError("Game not found");
        }
      } catch (e) {
        if (!cancelled) setError("Failed to load game");
      } finally {
        if (isInitial && !cancelled) setLoading(false);
      }
    }
    fetchGame(true); // initial load
    const interval = setInterval(() => fetchGame(false), 3000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [actualParams.id]);

  const [clue, setClue] = useState("");
  const [clueSubmitting, setClueSubmitting] = useState(false);
  const [vote, setVote] = useState("");
  const [voteSubmitting, setVoteSubmitting] = useState(false);
  const [actionError, setActionError] = useState("");
  const [clueRevealTimer, setClueRevealTimer] = useState(0);
  const [shouldShowClueAuthors, setShouldShowClueAuthors] = useState(false);
  const [shuffledClues, setShuffledClues] = useState<Array<[string, string]>>([]);

  function getPlayerName(id: string) {
    if (game.playerNames && game.playerNames[id]) return game.playerNames[id];
    return id;
  }

  // Update your getClueSubmissionOrder function for more accuracy
  function getClueSubmissionOrder() {
    if (!game?.player_ids || !game.imposter_ids) return [];

    // If the game has a predefined order in game_data.currentTurnPlayerId, respect that
    if (game.game_data?.currentTurnPlayerId) {
      const remainingPlayers = game.player_ids.filter((id: string) => !clues[id]);
      if (remainingPlayers.length > 0) {
        // Put the current turn player first, then the rest
        const otherPlayers = remainingPlayers.filter(id => id !== game.game_data.currentTurnPlayerId);
        return [game.game_data.currentTurnPlayerId, ...otherPlayers];
      }
    }

    // Fallback to our logic: non-imposters first, then imposters
    const nonImposters = game.player_ids.filter((id: string) => !game.imposter_ids.includes(id));
    const imposters = game.player_ids.filter((id: string) => game.imposter_ids.includes(id));

    return [...nonImposters, ...imposters];
  }

  const phase = game?.game_data?.phase;
  const clues = game?.game_data?.clues || {};
  const votes = game?.game_data?.votes || {};
  const allCluesSubmitted = Object.keys(clues).length === game?.player_ids?.length;
  const allVotesSubmitted = Object.keys(votes).length === game?.player_ids?.length;

  // Redirect to results page if the game is over (phase === 'reveal' and a win condition is met)
  useEffect(() => {
    if (phase === 'reveal' && ["imposter_win", "player_win"].includes(game?.game_data?.revealResult)) {
      router.replace(`/imposter/${actualParams.id}/results`);
    }
  }, [phase, game?.game_data?.revealResult, actualParams.id, router]);

  // Shuffle clues and handle reveal timer when all clues are submitted
  useEffect(() => {
    if (allCluesSubmitted) {
      // Separate imposter clues from others
      const entries = Object.entries(clues);
      const imposterIds = game.imposter_ids || [];
      const nonImposterClues = entries.filter(([pid]) => !imposterIds.includes(pid));
      const imposterClues = entries.filter(([pid]) => imposterIds.includes(pid));
      // Shuffle non-imposter clues, then append shuffled imposter clues at the end
      const shuffledNonImposter = shuffle(nonImposterClues);
      const shuffledImposter = shuffle(imposterClues);
      setShuffledClues([...shuffledNonImposter, ...shuffledImposter]);
      setShouldShowClueAuthors(false);
      setClueRevealTimer(5);
      const t = setTimeout(() => setShouldShowClueAuthors(true), 5000);
      return () => clearTimeout(t);
    } else {
      setShouldShowClueAuthors(false);
      setShuffledClues([]);
    }
  }, [allCluesSubmitted, phase, game?.game_data?.round]);

  async function submitClue() {
    setClueSubmitting(true);
    setActionError("");
    try {
      const res = await fetch(`/api/imposter/${actualParams.id}/clue`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clue }),
      });
      if (!res.ok) {
        setActionError("Failed to submit clue");
      } else {
        setClue("");
      }
    } finally {
      setClueSubmitting(false);
    }
  }

  async function submitVote() {
    setVoteSubmitting(true);
    setActionError("");
    try {
      const res = await fetch(`/api/imposter/${actualParams.id}/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vote }),
      });
      if (!res.ok) {
        setActionError("Failed to submit vote");
      } else {
        setVote("");
      }
    } finally {
      setVoteSubmitting(false);
    }
  }

  async function submitShouldVote(vote: 'yay' | 'nay') {
    setActionError("");
    try {
      await fetch(`/api/imposter/${actualParams.id}/should-vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shouldVote: vote }),
      });
    } catch {
      setActionError("Failed to submit vote");
    }
  }

  let phaseContent = null;
  if (phase === "clue" || phase === "shouldVote") {
    phaseContent = (
      <div className="w-full flex flex-col items-center gap-4 mt-4">
        <div className="text-lg font-semibold text-primary text-center">
          {phase === "clue" ? `Round ${game.game_data.round}: Give your clue` : "Review the clues"}
        </div>
        {phase === "clue" && session?.id && clues[session.id] ? (
          <div className="text-main bg-secondary/30 rounded px-4 py-2 text-center">Your clue: <span className="font-bold">{clues[session.id]}</span></div>
        ) : null}
        <div className="w-full flex flex-col gap-1 mt-2 items-center">
          <div className="text-secondary text-sm text-center">Clues submitted:</div>
          {/* Show all clues, but hide authors until 5s after all are submitted */}
          {(allCluesSubmitted ? shuffledClues : shuffle(Object.entries(clues))).map(([pid, clue], idx) => (
            <div key={pid} className="text-main bg-main/30 rounded px-2 py-1 text-sm text-center">
              {allCluesSubmitted && shouldShowClueAuthors ? (
                <>{getPlayerName(pid)}: <span className="font-semibold">{clue}</span></>
              ) : (
                <>Player ?: <span className="font-semibold">{clue}</span></>
              )}
            </div>
          ))}
          {allCluesSubmitted && !shouldShowClueAuthors && (
            <div className="text-secondary text-xs mt-2 text-center">Revealing clue authors in 5 seconds...</div>
          )}
        </div>
        {phase === "clue" && !allCluesSubmitted && (
          <div className="text-secondary text-xs mt-2 text-center">Waiting for all players to submit clues...</div>
        )}
        {phase === "clue" && actionError && <div className="text-destructive text-sm mt-2 text-center">{actionError}</div>}
        {phase === "clue" && session?.id && !clues[session?.id] && (
          <form onSubmit={e => {
            e.preventDefault();
            submitClue();
          }} className="flex flex-col items-center gap-2 w-full max-w-xs">
            <input
              type="text"
              value={clue}
              onChange={e => setClue(e.target.value)}
              className="w-full px-3 py-2 rounded border border-secondary bg-main text-main text-center"
              placeholder="Enter your clue"
              disabled={clueSubmitting}
              maxLength={64}
              required
            />
            {(() => {
              // Use the server's currentTurnPlayerId if available
              const currentTurnId = game.game_data?.currentTurnPlayerId;

              if (currentTurnId && currentTurnId !== session.id) {
                return <div className="text-amber-500 text-xs mt-1">
                  It's {getPlayerName(currentTurnId)}'s turn to submit. Please wait.
                </div>;
              }

              if (currentTurnId && currentTurnId === session.id) {
                return <div className="text-green-500 text-xs mt-1">It's your turn to submit!</div>;
              }

              // Fallback to our order calculation
              const order = getClueSubmissionOrder();
              const myIndex = order.indexOf(session.id);
              const submittedCount = Object.keys(clues).length;

              if (myIndex === -1) {
                return <div className="text-destructive text-xs mt-1">You're not in this game.</div>;
              }

              if (submittedCount < myIndex) {
                return <div className="text-amber-500 text-xs mt-1">Please wait for your turn. You'll be able to submit soon.</div>;
              }

              if (submittedCount > myIndex) {
                return <div className="text-amber-500 text-xs mt-1">You missed your turn, but try submitting anyway.</div>;
              }

              return <div className="text-green-500 text-xs mt-1">It's your turn to submit!</div>;
            })()}

            <Button type="submit" className="w-full mt-2" disabled={clueSubmitting || !clue.trim()}>
              {clueSubmitting ? "Submitting..." : "Submit Clue"}
            </Button>
          </form>
        )}
        {phase === "shouldVote" && (
          <>
            <div className="text-lg font-semibold text-primary mt-4 text-center">Should we vote now?</div>
            {game.game_data.shouldVoteVotes && session?.id && game.game_data.shouldVoteVotes[session.id] ? (
              <div className="text-main bg-secondary/30 rounded px-4 py-2 text-center">You voted: <span className="font-bold">{game.game_data.shouldVoteVotes[session.id] === 'yay' ? 'Yay' : 'Nay'}</span></div>
            ) : (
              <div className="flex gap-2 mt-2 w-full justify-center">
                <Button className="w-32" onClick={() => submitShouldVote('yay')}>Yay</Button>
                <Button variant="secondary" className="w-32" onClick={() => submitShouldVote('nay')}>Nay</Button>
              </div>
            )}
            <div className="w-full flex flex-col gap-1 mt-2 items-center">
              <div className="text-secondary text-sm text-center">Votes so far:</div>
              {game.game_data.shouldVoteVotes && Object.entries(game.game_data.shouldVoteVotes).map(([pid, v]) => (
                <div key={pid} className="text-main bg-main/30 rounded px-2 py-1 text-sm text-center">
                  {getPlayerName(pid)}: <span className="font-semibold">{v === 'yay' ? 'Yay' : 'Nay'}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    );
  } else if (phase === "vote") {
    phaseContent = (
      <div className="w-full flex flex-col items-center gap-4 mt-4">
        <div className="text-lg font-semibold text-primary text-center">Clues from this round</div>
        <div className="w-full flex flex-col gap-1 mt-2 items-center">
          {Object.entries(clues).map(([pid, clue]) => (
            <div key={pid} className="text-main bg-main/30 rounded px-2 py-1 text-sm text-center">
              {getPlayerName(pid)}: <span className="font-semibold">{clue}</span>
            </div>
          ))}
        </div>
        <div className="text-lg font-semibold text-primary mt-4 text-center">Vote for the Imposter</div>
        {votes[session?.id] ? (
          <div className="text-main bg-secondary/30 rounded px-4 py-2 text-center">You voted for: <span className="font-bold">{getPlayerName(votes[session.id])}</span></div>
        ) : (
          <form onSubmit={e => { e.preventDefault(); submitVote(); }} className="flex flex-col items-center gap-2 w-full max-w-xs">
            <select
              value={vote}
              onChange={e => setVote(e.target.value)}
              className="w-full px-3 py-2 rounded border border-secondary bg-main text-main text-center"
              required
              disabled={voteSubmitting}
            >
              <option value="" disabled>Select a player</option>
              {game.player_ids.map((pid: string) => (
                <option key={pid} value={pid}>{getPlayerName(pid)}</option>
              ))}
            </select>
            <Button type="submit" className="w-full mt-2" disabled={voteSubmitting || !vote}>
              {voteSubmitting ? "Submitting..." : "Submit Vote"}
            </Button>
          </form>
        )}
        <div className="w-full flex flex-col gap-1 mt-2 items-center">
          <div className="text-secondary text-sm text-center">Votes submitted:</div>
          {Object.entries(votes).map(([pid, votedFor]) => (
            <div key={pid} className="text-main bg-main/30 rounded px-2 py-1 text-sm text-center">
              {getPlayerName(pid)} voted
            </div>
          ))}
        </div>
        {!allVotesSubmitted && <div className="text-secondary text-xs mt-2 text-center">Waiting for all players to vote...</div>}
        {actionError && <div className="text-destructive text-sm mt-2 text-center">{actionError}</div>}
      </div>
    );
  } else if (phase === "reveal") {
    const voteCounts: Record<string, number> = {};
    Object.values(votes).forEach((v: string) => {
      voteCounts[v] = (voteCounts[v] || 0) + 1;
    });
    let maxVotes = 0;
    let votedOut: string[] = [];
    Object.entries(voteCounts).forEach(([pid, count]) => {
      if (count > maxVotes) {
        maxVotes = count;
        votedOut = [pid];
      } else if (count === maxVotes) {
        votedOut.push(pid);
      }
    });
    const imposters = game.imposter_ids || [];
    const revealResult = game.game_data.revealResult;
    phaseContent = (
      <div className="w-full flex flex-col items-center gap-4 mt-4">
        <div className="text-lg font-semibold text-primary text-center">Voting Results</div>
        <div className="w-full flex flex-col gap-1 mt-2 items-center">
          <div className="text-secondary text-sm text-center">Votes:</div>
          {Object.entries(voteCounts).map(([pid, count]) => (
            <div key={pid} className="text-main bg-main/30 rounded px-2 py-1 text-sm text-center">
              {getPlayerName(pid)}: <span className="font-semibold">{count} vote{count !== 1 ? "s" : ""}</span>
            </div>
          ))}
        </div>
        <div className="w-full flex flex-col gap-1 mt-2 items-center">
          <div className="text-secondary text-sm text-center">Voted out:</div>
          {votedOut.map(pid => (
            <div key={pid} className="text-main bg-destructive/30 rounded px-2 py-1 text-sm font-bold text-center">
              {getPlayerName(pid)}
            </div>
          ))}
        </div>
        <div className="w-full flex flex-col gap-1 mt-2 items-center">
          <div className="text-secondary text-sm text-center">Imposters were:</div>
          {imposters.map((pid: string) => (
            <div key={pid} className="text-main bg-main/30 rounded px-2 py-1 text-sm text-center">
              {getPlayerName(pid)}
            </div>
          ))}
        </div>
        <div className="text-xl text-center mt-4">
          {revealResult === "imposter_win" ? (
            <span className="text-destructive font-bold">Imposter(s) win! 😈</span>
          ) : revealResult === "player_win" ? (
            <span className="text-green-600 font-bold">Players win! 🎉</span>
          ) : (
            <span className="text-primary font-bold">Next round starting soon...</span>
          )}
        </div>
      </div>
    );
  }

  if (loading || !game || !game.game_data) return (
    <main className="min-h-screen flex items-center justify-center bg-main text-main">
      <div className="flex flex-col items-center gap-4">
        <Loader2 className="animate-spin w-12 h-12 text-primary" />
        <div className="text-lg text-secondary">Loading game...</div>
      </div>
    </main>
  );

  if (error || !game) return <main className="min-h-screen flex items-center justify-center text-destructive">{error || "Game not found"}</main>;
  if (!session?.id) return <main className="min-h-screen flex items-center justify-center text-main">No session</main>;

  const isImposter = game.imposter_ids?.includes(session.id);
  const isPlayer = game.player_ids?.includes(session.id);

  if (!isPlayer) {
    router.replace(`/imposter/${actualParams.id}/results`);
    return null;
  }

  if (!game.imposter_ids || !game.chosen_word) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-main text-main p-4">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="animate-spin w-12 h-12 text-primary" />
          <div className="text-xl text-center text-secondary">Waiting for host to start the game...</div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-main text-main p-4">
      <div className="bg-card border border-secondary rounded-xl shadow-lg p-8 w-full max-w-lg flex flex-col items-center gap-6">
        <h1 className="text-3xl font-bold text-primary text-center uppercase tracking-wide">Imposter Game</h1>
        {isImposter ? (
          <>
            <div className="text-2xl font-bold text-destructive text-center">YOU ARE THE IMPOSTER</div>
            <div className="text-lg text-center text-secondary">Pretend you know the word. Blend in with others without knowing what they're describing.</div>
          </>
        ) : (
          <>
            <div className="text-2xl font-bold text-primary text-center">The word is:</div>
            <div className="text-3xl font-extrabold text-main bg-primary/80 rounded px-4 py-2 my-2 text-center">{game.chosen_word}</div>
            <div className="text-lg text-center text-secondary">Describe the word indirectly without making it obvious.</div>
          </>
        )}
        {phaseContent}
      </div>
      {/* Debug Logs Section */}
      {/* <details className="w-full max-w-lg mt-4 bg-black/80 text-green-300 rounded p-4 text-xs" open>
        <summary className="cursor-pointer font-bold text-white">Debug Logs (Game State)</summary>
        <div className="overflow-x-auto whitespace-pre-wrap break-all mt-2">
          <div>game:</div>
          <pre>{JSON.stringify(game, null, 2)}</pre>
          <div>game.game_data:</div>
          <pre>{JSON.stringify(game?.game_data, null, 2)}</pre>
        </div>
      </details> */}
    </main>
  );
}
