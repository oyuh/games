"use client";
import { useSessionInfo } from "../../_components/session-modal";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, XCircle } from "lucide-react";
import React from "react";
import { Button } from "~/components/ui/button";
import shuffle from "lodash.shuffle";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "~/components/ui/dialog";

export default function ImposterGamePage({ params }: { params: Promise<{ id: string }> }) {
  const actualParams = React.use(params);
  const { session } = useSessionInfo();
  const [game, setGame] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const router = useRouter();
  const [isLeaveDialogOpen, setIsLeaveDialogOpen] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);
  const [playerDisconnected, setPlayerDisconnected] = useState(false);
  const [disconnectedPlayerName, setDisconnectedPlayerName] = useState("");
  const [disconnectionVote, setDisconnectionVote] = useState<string | null>(null);
  const [disconnectionVotesStatus, setDisconnectionVotesStatus] = useState<{
    votesCounted: number;
    totalPlayers: number;
  } | null>(null);
  const [disconnectionDialogOpen, setDisconnectionDialogOpen] = useState(false);

  const phase = game?.game_data?.phase;
  const clues = game?.game_data?.clues || {};
  const votes = game?.game_data?.votes || {};
  const allCluesSubmitted = Object.keys(clues).length === game?.player_ids?.length;
  const allVotesSubmitted = Object.keys(votes).length === game?.player_ids?.length;

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

  useEffect(() => {
    if (!game || !session?.id) return;

    let cancelled = false;

    // Start the heartbeat
    const sendHeartbeat = async () => {
      try {
        const res = await fetch(`/api/imposter/${actualParams.id}/heartbeat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" }
        });

        if (res.ok) {
          const data = await res.json();

          // Check if a player disconnection is in progress
          if (data.playerDisconnected && !cancelled) {
            setDisconnectionDialogOpen(true);
            const playerName = game.playerNames?.[data.playerId] || "A player";
            setDisconnectedPlayerName(playerName);
          }

          // Update disconnection votes if they exist
          if (data.disconnectionInProgress && data.votesCounted !== undefined && data.totalPlayers !== undefined) {
            setDisconnectionVotesStatus({
              votesCounted: data.votesCounted,
              totalPlayers: data.totalPlayers
            });
          }
        }
      } catch (error) {
        console.error("Heartbeat error:", error);
      }
    };

    // Send initial heartbeat
    sendHeartbeat();

    // Set up interval for regular heartbeats (every 10 seconds)
    const heartbeatInterval = setInterval(sendHeartbeat, 10000);

    // Add beforeunload event listener to notify when the user is about to leave
    const handleBeforeUnload = () => {
      fetch(`/api/imposter/${actualParams.id}/leave`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Using keepalive to ensure the request completes even as the page unloads
        keepalive: true
      }).catch(() => {});
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      cancelled = true;
      clearInterval(heartbeatInterval);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [actualParams.id, game, session?.id]);

  useEffect(() => {
    // Open disconnection dialog if playerDetectedDisconnected is set
    if (game?.game_data?.playerDetectedDisconnected) {
      setDisconnectionDialogOpen(true);
      const playerName = game.playerNames?.[game.game_data.playerDetectedDisconnected] || "A player";
      setDisconnectedPlayerName(playerName);
    } else {
      // Close dialog if the disconnected player is no longer detected (resolved)
      setDisconnectionDialogOpen(false);
      setDisconnectionVote(null);
      setDisconnectionVotesStatus(null);
    }

    // Only redirect to results for normal game end conditions
    // For player_left, we'll show the banner instead
    if (phase === 'reveal' && ["imposter_win", "player_win"].includes(game?.game_data?.revealResult)) {
      router.replace(`/imposter/${actualParams.id}/results`);
    }

    // Check for player left in game data
    if (game?.game_data?.playerLeft && !playerDisconnected) {
      const playerName = game.playerNames?.[game.game_data.playerLeft.id] || "A player";
      setPlayerDisconnected(true);
      setDisconnectedPlayerName(playerName);

      // Redirect to results page after a delay
      setTimeout(() => {
        router.replace(`/imposter/${actualParams.id}/results`);
      }, 3000);
    }
  }, [phase, game?.game_data?.revealResult, game?.game_data?.playerLeft, game?.game_data?.playerDetectedDisconnected, playerDisconnected, game?.playerNames, actualParams.id, router]);

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

  function getClueSubmissionOrder() {
    if (!game?.player_ids || !game.imposter_ids) return [];

    // If a current turn player is explicitly set, honor that
    if (game.game_data?.currentTurnPlayerId) {
      const remainingPlayers = game.player_ids.filter((id: string) => !clues[id]);
      if (remainingPlayers.length > 0) {
        // Put current turn player at front, then rest of remaining players
        const otherPlayers = remainingPlayers.filter(id => id !== game.game_data.currentTurnPlayerId);
        return [game.game_data.currentTurnPlayerId, ...otherPlayers];
      }
    }

    // Get non-imposter players first, then imposters
    const nonImposters = game.player_ids.filter((id: string) => !game.imposter_ids.includes(id));
    const imposters = game.player_ids.filter((id: string) => game.imposter_ids.includes(id));

    // Filter the players who haven't submitted clues yet
    const remainingNonImposters = nonImposters.filter(id => !clues[id]);
    const remainingImposters = imposters.filter(id => !clues[id]);

    // Return the remaining players in the right order
    return [...remainingNonImposters, ...remainingImposters];
  }

  // Function to determine whose turn it is
  function getCurrentTurnPlayerId() {
    // If game explicitly tells us whose turn it is, use that
    if (game.game_data?.currentTurnPlayerId) {
      // Verify this player hasn't already submitted
      if (!clues[game.game_data.currentTurnPlayerId]) {
        return game.game_data.currentTurnPlayerId;
      }
    }

    // Otherwise determine based on submission order
    const orderOfPlay = getClueSubmissionOrder();
    return orderOfPlay.length > 0 ? orderOfPlay[0] : null;
  }

  useEffect(() => {
    if (allCluesSubmitted) {
      const entries = Object.entries(clues);
      const imposterIds = game.imposter_ids || [];
      const nonImposterClues = entries.filter(([pid]) => !imposterIds.includes(pid));
      const imposterClues = entries.filter(([pid]) => imposterIds.includes(pid));
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

  async function submitDisconnectionVote(vote: 'continue' | 'end') {
    try {
      setDisconnectionVote(vote);
      const res = await fetch(`/api/imposter/${actualParams.id}/heartbeat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vote,
          disconnectedPlayerId: game?.game_data?.playerDetectedDisconnected
        })
      });

      if (res.ok) {
        const data = await res.json();
        if (data.votesCounted !== undefined && data.totalPlayers !== undefined) {
          setDisconnectionVotesStatus({
            votesCounted: data.votesCounted,
            totalPlayers: data.totalPlayers
          });
        }

        if (data.disconnectionResolved) {
          // Dialog will automatically close on next game update
          if (!data.continueGame) {
            // Game ended - will redirect eventually
            setPlayerDisconnected(true);
            const playerName = game.playerNames?.[game?.game_data?.playerDetectedDisconnected] || "A player";
            setDisconnectedPlayerName(playerName);
          } else {
            // Game continues without the disconnected player
            setDisconnectionDialogOpen(false);
            setDisconnectionVote(null);
            setDisconnectionVotesStatus(null);
          }
        }
      }
    } catch (error) {
      console.error("Failed to submit disconnection vote:", error);
    }
  }

  async function handleLeaveGame() {
    setIsLeaving(true);
    try {
      const res = await fetch(`/api/imposter/${actualParams.id}/leave`, {
        method: "POST",
        headers: { "Content-Type": "application/json" }
      });

      if (res.ok) {
        // Redirect to home page
        router.push("/imposter");
      } else {
        setActionError("Failed to leave the game");
      }
    } catch (error) {
      setActionError("Error leaving the game");
    } finally {
      setIsLeaving(false);
      setIsLeaveDialogOpen(false);
    }
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

  let phaseContent = null;
  if (phase === "ended" && game?.game_data?.playerLeft) {
    // For ended games due to player leaving, keep showing the last phase content
    // We'll determine what to show based on available data
    if (game.game_data.clues && Object.keys(game.game_data.clues).length > 0) {
      // Show clues if they exist
      phaseContent = (
        <div className="w-full flex flex-col items-center gap-4 mt-4">
          <div className="text-base font-medium text-amber-500 text-center mb-3 p-2 border border-amber-500 rounded">
            Game ended because a player left
          </div>
          <div className="text-base font-medium text-primary/90 text-center mb-1">
            Clues from this round:
          </div>
          <div className="w-full flex flex-col gap-1 mt-2 items-center">
            {Object.entries(game.game_data.clues).map(([pid, clue]) => (
              <div
                key={pid}
                className={`rounded px-3 py-2 text-sm text-main bg-secondary/20 border border-secondary/30 mb-1 w-full text-center
                  ${pid === session?.id ? "ring-2 ring-primary/40" : ""}
                `}
              >
                {getPlayerName(pid)}: <span className="font-semibold">{clue}</span>
              </div>
            ))}
          </div>
        </div>
      );
    }
  } else if (phase === "clue" || phase === "shouldVote") {
    phaseContent = (
      <div className="w-full flex flex-col items-center gap-4 mt-4">
        <div className="text-base font-medium text-primary/90 text-center mb-1">
          {phase === "clue" ? `Round ${game.game_data.round}: Give your clue` : "Review the clues"}
        </div>
        {phase === "clue" && session?.id && clues[session.id] ? (
          <div className="text-main bg-secondary/30 rounded px-4 py-2 text-center">Your clue: <span className="font-bold">{clues[session.id]}</span></div>
        ) : null}
        <div className="w-full flex flex-col gap-1 mt-2 items-center">
          <div className="text-sm font-semibold text-secondary/80 mt-3 mb-1 text-center">Clues submitted:</div>
          {(allCluesSubmitted ? shuffledClues : shuffle(Object.entries(clues))).map(([pid, clue], idx) => (
            <div
              key={pid}
              className={`rounded px-3 py-2 text-sm text-main bg-secondary/20 border border-secondary/30 mb-1 w-full text-center
                ${pid === session?.id ? "ring-2 ring-primary/40" : ""}
              `}
            >
              {shouldShowClueAuthors || phase === "vote" || phase === "reveal"
                ? <>{getPlayerName(pid)}: <span className="font-semibold">{clue}</span></>
                : <>Player ?: <span className="font-semibold">{clue}</span></>
              }
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
          <form
            onSubmit={e => {
              e.preventDefault();
              submitClue();
            }}
            className="flex flex-col items-center gap-2 w-full max-w-xs bg-secondary/10 border border-secondary/20 rounded p-3"
          >
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
              const currentTurnId = getCurrentTurnPlayerId();

              if (currentTurnId && currentTurnId !== session.id) {
                return <div className="text-amber-500 text-xs mt-1">
                  It's another players turn to submit. Please wait.
                </div>;
              }

              if (currentTurnId && currentTurnId === session.id) {
                return <div className="text-green-500 text-xs mt-1">It's your turn to submit!</div>;
              }

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
            <div className="text-base font-medium text-primary/90 text-center mb-1">Should we vote now?</div>
            {game.game_data.shouldVoteVotes && session?.id && game.game_data.shouldVoteVotes[session.id] ? (
              <div className="text-main bg-secondary/30 rounded px-4 py-2 text-center">You voted: <span className="font-bold">{game.game_data.shouldVoteVotes[session.id] === 'yay' ? 'Yay' : 'Nay'}</span></div>
            ) : (
              <div className="flex gap-2 mt-2 w-full justify-center">
                <Button className="w-32" onClick={() => submitShouldVote('yay')}>Yay</Button>
                <Button variant="secondary" className="w-32" onClick={() => submitShouldVote('nay')}>Nay</Button>
              </div>
            )}
            <div className="w-full flex flex-col gap-1 mt-2 items-center">
              <div className="text-sm font-semibold text-secondary/80 mt-3 mb-1 text-center">Votes so far:</div>
              {game.game_data.shouldVoteVotes && Object.entries(game.game_data.shouldVoteVotes).map(([pid, v]) => (
                <div
                  key={pid}
                  className={`rounded px-3 py-2 text-sm bg-secondary/20 border border-secondary/30 mb-1 w-full text-center
                    ${pid === session?.id ? "ring-2 ring-accent/40" : ""}
                  `}
                >
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
        <div className="text-base font-medium text-primary/90 text-center mb-1">Clues from this round</div>
        <div className="w-full flex flex-col gap-1 mt-2 items-center">
          {Object.entries(clues).map(([pid, clue]) => (
            <div
              key={pid}
              className={`rounded px-3 py-2 text-sm text-main bg-secondary/20 border border-secondary/30 mb-1 w-full text-center
                ${pid === session?.id ? "ring-2 ring-primary/40" : ""}
              `}
            >
              {getPlayerName(pid)}: <span className="font-semibold">{clue}</span>
            </div>
          ))}
        </div>
        <div className="text-base font-medium text-primary/90 text-center mb-1">Vote for the Imposter</div>
        {votes[session?.id] ? (
          <div className="text-main bg-secondary/30 rounded px-4 py-2 text-center">You voted for: <span className="font-bold">{getPlayerName(votes[session.id])}</span></div>
        ) : (
          <form
            onSubmit={e => { e.preventDefault(); submitVote(); }}
            className="flex flex-col items-center gap-2 w-full max-w-xs bg-secondary/10 border border-secondary/20 rounded p-3"
          >
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
          <div className="text-sm font-semibold text-secondary/80 mt-3 mb-1 text-center">Votes submitted:</div>
          {Object.entries(votes).map(([pid, votedFor]) => (
            <div
              key={pid}
              className={`rounded px-3 py-2 text-sm bg-secondary/20 border border-secondary/30 mb-1 w-full text-center
                ${pid === session?.id ? "ring-2 ring-accent/40" : ""}
              `}
            >
              {getPlayerName(pid)} voted{pid === session?.id ? " (you)" : ""}
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
        <div className="text-base font-medium text-primary/90 text-center mb-1">Voting Results</div>
        <div className="w-full flex flex-col gap-1 mt-2 items-center">
          <div className="text-sm font-semibold text-secondary/80 mt-3 mb-1 text-center">Votes:</div>
          {Object.entries(voteCounts).map(([pid, count]) => (
            <div
              key={pid}
              className={`rounded px-3 py-2 text-sm bg-secondary/20 border border-secondary/30 mb-1 w-full text-center
                ${pid === session?.id ? "ring-2 ring-accent/40" : ""}
              `}
            >
              {getPlayerName(pid)}: <span className="font-semibold">{count} vote{count !== 1 ? "s" : ""}</span>
            </div>
          ))}
        </div>
        <div className="w-full flex flex-col gap-1 mt-2 items-center">
          <div className="text-sm font-semibold text-secondary/80 mt-3 mb-1 text-center">Voted out:</div>
          {votedOut.map(pid => (
            <div key={pid} className="text-main bg-destructive/30 rounded px-2 py-1 text-sm font-bold text-center">
              {getPlayerName(pid)}
            </div>
          ))}
        </div>
        <div className="w-full flex flex-col gap-1 mt-2 items-center">
          <div className="text-sm font-semibold text-secondary/80 mt-3 mb-1 text-center">Imposters were:</div>
          {imposters.map((pid: string) => (
            <div key={pid} className="text-main bg-main/30 rounded px-2 py-1 text-sm text-center">
              {getPlayerName(pid)}
            </div>
          ))}
        </div>
        <div className="text-lg text-center mt-4 font-semibold">
          {revealResult === "imposter_win" ? (
            <span className="text-destructive/80">Imposter(s) win</span>
          ) : revealResult === "player_win" ? (
            <span className="text-green-600/80">Players win</span>
          ) : (
            <span className="text-primary/80">Next round starting soon...</span>
          )}
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-main text-main p-4">
      {/* Player disconnection banner */}
      {playerDisconnected && (
        <div className="fixed top-0 left-0 right-0 bg-amber-600 text-white p-4 text-center z-50 shadow-md">
          <div className="max-w-lg mx-auto">
            <p className="text-lg font-bold">{disconnectedPlayerName} has disconnected from the game</p>
            <p className="text-sm mt-1">You will be redirected to results momentarily...</p>
          </div>
        </div>
      )}

      {/* Disconnection vote dialog */}
      <Dialog open={disconnectionDialogOpen && !playerDisconnected} onOpenChange={(open) => {
        if (!open) setDisconnectionDialogOpen(false);
      }}>
        <DialogContent className="bg-card text-main">
          <DialogHeader>
            <DialogTitle className="text-amber-500 text-xl font-bold">Player Disconnected</DialogTitle>
            <DialogDescription className="text-main">
              <p className="mb-3"><strong>{disconnectedPlayerName}</strong> appears to be disconnected from the game.</p>
              <p>Would you like to continue playing without them, or end the game?</p>

              {disconnectionVotesStatus && (
                <div className="mt-4 text-sm text-secondary">
                  {disconnectionVote ? (
                    <p>You voted to {disconnectionVote === 'continue' ? 'continue playing' : 'end the game'}</p>
                  ) : null}
                  <p className="mt-1">
                    Votes: {disconnectionVotesStatus.votesCounted} / {disconnectionVotesStatus.totalPlayers} players
                  </p>
                </div>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="flex justify-center gap-4 mt-6">
            {!disconnectionVote ? (
              <>
                <Button
                  onClick={() => submitDisconnectionVote('continue')}
                  className="w-1/2">
                  Continue Playing
                </Button>
                <Button
                  onClick={() => submitDisconnectionVote('end')}
                  variant="destructive"
                  className="w-1/2">
                  End Game
                </Button>
              </>
            ) : (
              <p className="text-center w-full text-secondary">
                Waiting for other players to vote...
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <div className="bg-card border border-secondary rounded-xl shadow-lg p-8 w-full max-w-lg flex flex-col items-center gap-6">
        <div className="w-full flex justify-between items-center">
          <div className="flex-1"></div>
          <h1 className="text-3xl font-bold text-primary text-center uppercase tracking-wide flex-2">Imposter Game</h1>
          <div className="flex-1 flex justify-end">
            <Dialog open={isLeaveDialogOpen} onOpenChange={setIsLeaveDialogOpen}>
              <DialogTrigger asChild>
                <button
                  className="text-destructive hover:text-destructive/80 transition-colors"
                  aria-label="Leave Game"
                >
                  <XCircle size={24} />
                </button>
              </DialogTrigger>
              <DialogContent className="bg-card text-main">
                <DialogHeader>
                  <DialogTitle className="text-destructive">Leave Game?</DialogTitle>
                  <DialogDescription className="text-main">
                    If you leave the game, it will end for all players. Are you sure you want to leave?
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => setIsLeaveDialogOpen(false)}
                    className="bg-secondary/20 text-main"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleLeaveGame}
                    disabled={isLeaving}
                    variant="destructive"
                    className="bg-destructive text-white"
                  >
                    {isLeaving ? "Leaving..." : "Leave Game"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <div className="text-lg text-secondary text-center">Category: <span className="font-semibold">{game.category}</span></div>

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
    </main>
  );
}
