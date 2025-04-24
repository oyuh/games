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
    history?: Array<{
      clues?: Record<string, string>;
      clueOrder?: string[];
      round?: number;
      phase?: string;
      shouldVoteVotes?: Record<string, string>;
      votes?: Record<string, string>;
      votedOut?: string[];
      revealResult?: string;
    }>;
    round?: number;
    phase?: string;
    clues?: Record<string, string>;
    clueOrder?: string[];
    shouldVoteVotes?: Record<string, string>;
    votes?: Record<string, string>;
    votedOut?: string[];
    revealResult?: string;
  };
}

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
    const interval = setInterval(() => { void fetchGame(); }, 3000);
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
    return (game.imposter_ids || []).includes(pid);
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
                    {getPlayerName(pid)}{isImposter(pid) ? " (IMPOSTER)" : ""}
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
                      {getPlayerName(pid)}{isImposter(pid) ? " (IMPOSTER)" : ""}
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
                      {getPlayerName(pid)}{isImposter(pid) ? " (IMPOSTER)" : ""} voted
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
                  {getPlayerName(pid)}{isImposter(pid) ? " (IMPOSTER)" : ""}
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

  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-main text-main p-4">
      <div className="bg-card border border-secondary rounded-xl shadow-lg p-8 w-full max-w-lg flex flex-col items-center gap-6">
        <h1 className="text-3xl font-bold text-primary text-center uppercase tracking-wide">Game Results</h1>
        {expired ? (
          <div className="text-xl text-center text-destructive font-bold">This game has expired.</div>
        ) : (
          <div className="text-lg text-center text-secondary">This results page will update live until the game expires.</div>
        )}
        {game.expires_at && !expired && (
          <div className="text-center text-sm text-secondary">
            Expires at: {new Date(game.expires_at).toLocaleString()}<br />
            (Time left: {Math.max(0, Math.floor((new Date(game.expires_at).getTime() - Date.now()) / 1000))}s)
          </div>
        )}
        {/* Show summary of the game */}
        <div className="w-full flex flex-col gap-2 mt-4">
          <div className="text-lg font-semibold text-primary">Players:</div>
          <ul className="list-disc pl-6">
            {game.player_ids?.map((pid: string) => (
              <li key={pid}>{getPlayerName(pid)}</li>
            ))}
          </ul>
        </div>
        <div className="w-full flex flex-col gap-2 mt-4">
          <div className="text-lg font-semibold text-primary">Imposters:</div>
          <ul className="list-disc pl-6">
            {getImposterIds().length > 0 ? (
              getImposterIds().map((pid: string) => (
                <li key={pid} className="text-red-600 font-bold">
                  {getPlayerName(pid)}
                </li>
              ))
            ) : (
              <li className="text-secondary italic">No imposters found.</li>
            )}
          </ul>
        </div>
        <div className="w-full flex flex-col gap-2 mt-4">
          <div className="text-lg font-semibold text-primary">Word:</div>
          <div className="text-2xl font-bold text-main bg-primary/80 rounded px-4 py-2 my-2 text-center">{game.chosen_word}</div>
        </div>
        {/* Optionally show clues, votes, etc. */}
        <div className="w-full flex flex-col gap-2 mt-4">
          <div className="text-lg font-semibold text-primary">Game Phases & Rounds:</div>
          {/* Render all rounds from history */}
          {Array.isArray(game?.game_data?.history) && game.game_data.history.length > 0 ? (
            game.game_data.history.map((round, idx) => renderRound(round, idx))
          ) : (
            <div className="text-secondary">No round history yet.</div>
          )}
          {/* Render current round if not already in history */}
          {game.game_data && (!game.game_data.history || !game.game_data.history.some((r: any) => r.round === game.game_data.round)) && (
            renderRound(game.game_data, (game.game_data.history?.length || 0) + 1)
          )}
        </div>
        <Button className="mt-4" onClick={() => router.push("/imposter")}>Back to Lobby</Button>
      </div>
      <style jsx global>{`
        body, .bg-main, .bg-card {
          background-color: #23292f !important;
        }
        .text-main, .text-primary, .text-secondary, .text-green-600 {
          color: #fff !important;
        }
        .bg-primary, .bg-primary\/80 {
          background-color: #2e7d32 !important;
          color: #fff !important;
        }
        .bg-muted {
          background-color: #333 !important;
          color: #fff !important;
        }
        .text-destructive, .text-red-600 {
          color: #ff5252 !important;
        }
        .font-bold {
          font-weight: bold;
        }
      `}</style>
    </main>
  );
}
