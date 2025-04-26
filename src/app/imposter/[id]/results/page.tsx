"use client";
import React from "react";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "../../../../components/ui/button";
import shuffle from "lodash.shuffle";

// Add type for game state
interface GameResult {
  expires_at?: string;
  player_ids?: string[];
  playerNames?: Record<string, string>;
  imposter_ids?: string[];
  chosen_word?: string;
  game_data?: {
    firstClueAt?: string;
    gameFinished?: boolean; // Add this to track explicit game completion
    history?: Array<{
      clues?: Record<string, string>;
      clueOrder?: string[];
      round?: number;
      phase?: string;
      shouldVoteVotes?: Record<string, string>;
      votes?: Record<string, string>;
      votedOut?: string[];
      revealResult?: string;
      activePlayers?: string[];
    }>;
    round?: number;
    phase?: string;
    clues?: Record<string, string>;
    clueOrder?: string[];
    shouldVoteVotes?: Record<string, string>;
    votes?: Record<string, string>;
    votedOut?: string[];
    revealResult?: string;
    playerLeft?: { id: string; disconnected?: boolean };
  };
}

// Improve styling and layout for better readability on desktop
export default function ImposterResultsPage({ params }: { params: Promise<{ id: string }> }) {
  const actualParams = React.use(params);
  const [game, setGame] = useState<GameResult | null>(null);
  const [error, setError] = useState("");
  const [expired, setExpired] = useState(false);
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    async function fetchGame() {
      setError("");
      try {
        const res = await fetch(`/api/imposter/${actualParams.id}`);
        if (res.ok) {
          const data = await res.json();
          if (!cancelled) setGame(data.game as GameResult);
        } else {
          if (!cancelled) setError("Game not found");
        }
      } catch {
        if (!cancelled) setError("Failed to load game");
      }
    }
    void fetchGame();
    // Poll more frequently for better real-time experience (every 2 seconds)
    const interval = setInterval(() => { void fetchGame(); }, 2000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [actualParams.id]);

  useEffect(() => {
    if (!game?.expires_at) return;
    const checkExpired = () => {
      const now = new Date();
      const expires = new Date(game.expires_at);
      setExpired(now > expires);
    };
    checkExpired();
    const interval = setInterval(checkExpired, 1000);
    return () => clearInterval(interval);
  }, [game?.expires_at]);

  // Update the getPlayerName function to be more robust
  function getPlayerName(pid: string) {
    if (!pid) return "Unknown Player";

    // Try to get the name from playerNames
    const name = game?.playerNames?.[pid];

    // If we have a name, return it
    if (name) return name;

    // If the ID is short enough to be displayed, show a shortened version with ellipsis
    if (pid.length <= 8) return pid;

    // For longer IDs, truncate and add ellipsis
    return `${pid.substring(0, 6)}...`;
  }

  function isImposter(pid: string) {
    // Only reveal imposters if the game is finished or revealResult is set
    if (
      game?.game_data?.gameFinished ||
      game?.game_data?.revealResult === "imposter_win" ||
      game?.game_data?.revealResult === "player_win" ||
      game?.game_data?.revealResult === "player_left"
    ) {
      return (game.imposter_ids || []).includes(pid);
    }
    // Otherwise, do not reveal
    return false;
  }

  // Helper to get imposter ids if not present: find the id in imposter_ids or, if missing, infer as the id in imposter_ids or the one not in player_ids
  function getImposterIds(): string[] {
    if (game.imposter_ids && game.imposter_ids.length > 0) return game.imposter_ids;
    // Fallback: infer imposter as the id in clues/votes/history that is not in player_ids
    const allIds = new Set([
      ...(game.player_ids || []),
      ...((game.game_data?.clues && Object.keys(game.game_data.clues)) || []),
      ...((game.game_data?.votes && Object.keys(game.game_data.votes)) || []),
    ]);
    // If there are clues, try to find an id not in player_ids
    if (game.game_data?.clues) {
      for (const pid of Object.keys(game.game_data.clues)) {
        if (!(game.player_ids || []).includes(pid)) return [pid];
      }
    }
    // If there is only one id in allIds not in player_ids, that's the imposter
    const imposters = Array.from(allIds).filter(pid => !(game.player_ids || []).includes(pid));
    if (imposters.length > 0) return imposters;
    return [];
  }

  // Function to collect all player IDs from the entire game
  function getAllPlayerIds(): string[] {
    const allPlayerIdsSet = new Set<string>([
      ...(game.player_ids || []),
      ...(game.imposter_ids || [])
    ]);

    // Add players from history
    if (Array.isArray(game?.game_data?.history)) {
      for (const round of game.game_data.history) {
        // Add from clues
        if (round.clues) {
          Object.keys(round.clues).forEach(pid => allPlayerIdsSet.add(pid));
        }
        // Add from votes
        if (round.votes) {
          Object.keys(round.votes).forEach(pid => allPlayerIdsSet.add(pid));
        }
        // Add from shouldVoteVotes
        if (round.shouldVoteVotes) {
          Object.keys(round.shouldVoteVotes).forEach(pid => allPlayerIdsSet.add(pid));
        }
        // Add from votedOut
        if (Array.isArray(round.votedOut)) {
          round.votedOut.forEach(pid => allPlayerIdsSet.add(pid));
        }
      }
    }

    // Add players from current round
    if (game.game_data) {
      const gd = game.game_data;
      if (gd.clues) Object.keys(gd.clues).forEach(pid => allPlayerIdsSet.add(pid));
      if (gd.votes) Object.keys(gd.votes).forEach(pid => allPlayerIdsSet.add(pid));
      if (gd.shouldVoteVotes) Object.keys(gd.shouldVoteVotes).forEach(pid => allPlayerIdsSet.add(pid));
      if (Array.isArray(gd.votedOut)) gd.votedOut.forEach(pid => allPlayerIdsSet.add(pid));
    }

    return Array.from(allPlayerIdsSet);
  }

  // Update the renderRound function to prevent unwanted shuffling
  function renderRound(round: any, idx: number) {
    // Get clues in a consistent order - don't shuffle them randomly
    let clueEntries = Object.entries(round.clues || {});

    if (round.clueOrder && Array.isArray(round.clueOrder)) {
      // If we have a clueOrder array, use that to order the entries
      clueEntries = round.clueOrder
        .map((pid: string) => [pid, round.clues[pid]])
        .filter(([_pid, clue]) => clue !== undefined);
    } else {
      // If no clueOrder, sort by player ID for consistency
      clueEntries = clueEntries.sort((a, b) => a[0].localeCompare(b[0]));
    }

    return (
      <div key={idx} className="mb-6 p-4 border border-secondary rounded-lg bg-main/10">
        <div className="font-bold text-secondary mb-1">Round {round.round ?? (idx + 1)}{round.phase ? ` — Phase: ${round.phase}` : ''}</div>
        {round.clues && (
          <div className="mb-2">
            <div className="font-semibold text-primary">Clues:</div>
            <ul className="list-disc pl-6">
              {clueEntries.map(([pid, clue]) => (
                <li key={pid}>
                  <span className="font-mono bg-muted px-2 py-1 rounded mr-2">{clue}</span>
                  <span className={isImposter(pid) ? "text-destructive font-bold" : "text-secondary"}>
                    {getPlayerName(pid)}{/* Hide imposter label in history */}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Apply the same consistent ordering to other data displays */}
        {round.shouldVoteVotes && (
          <div className="mb-2">
            <div className="font-semibold text-primary">Should We Vote?</div>
            <ul className="list-disc pl-6">
              {Object.entries(round.shouldVoteVotes)
                .sort((a, b) => a[0].localeCompare(b[0])) // Sort by player ID for consistency
                .map(([pid, v]) => (
                  <li key={pid}>
                    <span className="font-mono bg-muted px-2 py-1 rounded mr-2">{v}</span>
                    <span className={isImposter(pid) ? "text-destructive font-bold" : "text-secondary"}>
                      {getPlayerName(pid)}{/* Hide imposter label in history */}
                    </span>
                  </li>
              ))}
            </ul>
          </div>
        )}

        {round.votes && (
          <div className="mb-2">
            <div className="font-semibold text-primary">Votes:</div>
            <ul className="list-disc pl-6">
              {Object.entries(round.votes)
                .sort((a, b) => a[0].localeCompare(b[0])) // Sort by player ID for consistency
                .map(([pid, votedFor]) => (
                  <li key={pid}>
                    <span className="font-mono bg-muted px-2 py-1 rounded mr-2">{getPlayerName(votedFor)}</span>
                    <span className={isImposter(pid) ? "text-destructive font-bold" : "text-secondary"}>
                      {getPlayerName(pid)} voted{/* Hide imposter label in history */}
                    </span>
                  </li>
              ))}
            </ul>
          </div>
        )}

        {round.votedOut && (
          <div className="mb-2">
            <div className="font-semibold text-primary">Voted Out:</div>
            <ul className="list-disc pl-6">
              {Array.isArray(round.votedOut) ? round.votedOut.map((pid: string) => (
                <li key={pid} className={isImposter(pid) ? "text-destructive font-bold" : "text-secondary"}>
                  {getPlayerName(pid)}{/* Hide imposter label in history */}
                </li>
              )) : null}
            </ul>
          </div>
        )}
        {round.revealResult && (
          <div className="mb-2">
            <div className="font-semibold text-primary">Result:</div>
            <div className="text-lg font-bold">
              {round.revealResult === "imposter_win" ? (
                <span className="text-destructive">Imposters win!</span>
              ) : round.revealResult === "player_win" ? (
                <span className="text-green-600">Players win!</span>
              ) : round.revealResult === "player_left" ? (
                <span className="text-amber-500">Game ended - a player left</span>
              ) : (
                <span className="text-secondary">{round.revealResult}</span>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  if (!game) return (
    <main className="min-h-screen flex items-center justify-center bg-main text-main">
      <div className="flex flex-col items-center gap-4">
        <Loader2 className="animate-spin w-12 h-12 text-primary" />
        <div className="text-lg text-secondary">Loading results...</div>
      </div>
    </main>
  );
  if (error) return <main className="min-h-screen flex items-center justify-center text-destructive">{error}</main>;

  // Render a much cleaner and more appealing layout
  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-main text-main p-4 py-8">
      <div className="bg-card border border-secondary rounded-xl shadow-lg p-8 w-full max-w-3xl flex flex-col items-center gap-6">
        <h1 className="text-3xl font-bold text-primary text-center uppercase tracking-wide">Game Results</h1>

        {game?.game_data?.playerLeft ? (
          <div className="text-xl text-center text-amber-500 font-bold mb-2 p-3 border border-amber-500 rounded-lg">
            {game.playerNames?.[game.game_data.playerLeft.id] || "A player"} disconnected from the game
            <div className="text-sm text-secondary mt-1">
              (Their browser was closed or they navigated away)
            </div>
          </div>
        ) : expired ? (
          <div className="text-xl text-center text-destructive font-bold p-3 border border-destructive rounded-lg">This game has expired.</div>
        ) : game.game_data?.gameFinished ||
           game.game_data?.revealResult === "imposter_win" ||
           game.game_data?.revealResult === "player_win" ? (
          <div className="text-xl text-center text-primary font-bold p-3 border border-primary rounded-lg">
            Game completed!
          </div>
        ) : (
          <div className="text-lg text-center text-secondary">This results page will update live until the game expires.</div>
        )}

        {game?.expires_at && !expired && !game.game_data?.gameFinished && (
          <div className="text-center text-sm text-secondary bg-secondary/10 px-4 py-2 rounded-lg">
            Expires at: {new Date(game.expires_at).toLocaleString()}<br />
            (Time left: {Math.max(0, Math.floor((new Date(game.expires_at).getTime() - Date.now()) / (60*1000)))} minutes)
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full">
          {/* Game summary section - left column on desktop */}
          <div className="flex flex-col gap-4">
            <div className="bg-secondary/10 rounded-lg p-4 border border-secondary/30">
              <h2 className="text-xl font-bold text-primary border-b border-primary/30 pb-2 mb-3">Game Info</h2>

              <div className="mb-4">
                <h3 className="text-lg font-semibold text-primary mb-2">The Word</h3>
                <div className="text-2xl font-bold text-main bg-primary/80 rounded-lg px-4 py-2 text-center">
                  {game?.chosen_word}
                </div>
              </div>

              <div className="mb-4">
                <h3 className="text-lg font-semibold text-primary mb-2">Players</h3>
                <ul className="space-y-1">
                  {getAllPlayerIds().map((pid: string) => (
                    <li key={pid} className={`rounded-md px-3 py-1 ${isImposter(pid) ? "bg-destructive/20 text-destructive" : "bg-primary/10"}`}>
                      {getPlayerName(pid)}{isImposter(pid) ? " (Imposter)" : ""}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Imposter reveal section - only show if game is finished */}
              {(game?.game_data?.gameFinished ||
                game?.game_data?.revealResult === "imposter_win" ||
                game?.game_data?.revealResult === "player_win" ||
                game?.game_data?.revealResult === "player_left") && (
                <div className="mb-4">
                  <h3 className="text-lg font-semibold text-destructive mb-2">Imposter{(getImposterIds().length > 1) ? 's' : ''} Revealed</h3>
                  <ul className="space-y-1">
                    {getImposterIds().map(pid => (
                      <li key={pid} className="rounded-md px-3 py-1 bg-destructive/20 text-destructive font-bold">
                        {getPlayerName(pid)}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div>
                <h3 className="text-lg font-semibold text-primary mb-2">Game Result</h3>
                {game?.game_data?.revealResult ? (
                  <div className="text-xl font-bold text-center p-2 rounded-md">
                    {game.game_data.revealResult === "imposter_win" ? (
                      <span className="text-destructive">Imposters Win!</span>
                    ) : game.game_data.revealResult === "player_win" ? (
                      <span className="text-green-600">Players Win!</span>
                    ) : game.game_data.revealResult === "player_left" ? (
                      <span className="text-amber-500">Game Ended - Player Left</span>
                    ) : (
                      <span className="text-secondary">{game.game_data.revealResult}</span>
                    )}
                  </div>
                ) : (
                  <p className="text-secondary text-center italic">Game in progress...</p>
                )}
              </div>
            </div>

            <Button className="mt-2" onClick={() => router.push("/imposter")}>
              Back to Lobby
            </Button>
          </div>

          {/* Game history section - right column on desktop */}
          <div className="flex flex-col gap-3">
            <h2 className="text-xl font-bold text-primary">Game History</h2>
            <div className="overflow-y-auto max-h-[600px] pr-2 space-y-4">
              {/* Render all rounds from history */}
              {Array.isArray(game?.game_data?.history) && game?.game_data?.history.length > 0 ? (
                game.game_data.history
                  .filter((_, idx) => (idx + 1) % 2 === 0)
                  .map((round, idx) => renderRound(round, idx))
              ) : (
                <div className="text-secondary bg-secondary/10 p-4 rounded-lg text-center">
                  No round history yet.
                </div>
              )}
              {/* Render current round if not already in history */}
              {game?.game_data && (!game.game_data.history || !game.game_data.history.some((r: any) => r.round === game.game_data?.round)) && (
                renderRound(game.game_data, (game.game_data.history?.length || 0))
              )}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
