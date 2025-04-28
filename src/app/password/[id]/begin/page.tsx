"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "~/components/ui/button";
import { useSessionInfo } from "~/app/_components/session-modal";
import { X } from "lucide-react";

interface PasswordGame {
  id: string;
  code: string;
  host_id: string;
  teams: {
    noTeam: string[];
    [key: string]: string[];
  };
  playerNames?: Record<string, string>;
  started_at: string | null;
  finished_at: string | null;
}

export default function PasswordBeginPage({
  params,
}: {
  params: { id: string };
}) {
  const [game, setGame] = useState<PasswordGame | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [namesLoaded, setNamesLoaded] = useState<boolean>(false);
  const router = useRouter();
  const { session } = useSessionInfo();
  const sessionId = session?.id;

  // Create a cache for player names to avoid showing loading placeholders repeatedly
  const [playerNamesCache, setPlayerNamesCache] = useState<Record<string, string>>({});

  const fetchGame = async () => {
    try {
      const response = await fetch(`/api/password/${params.id}`, {
        // Add cache control headers to improve performance
        headers: {
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        }
      });

      if (!response.ok) {
        throw new Error("Failed to load game");
      }

      const data = await response.json();

      // Update player names cache with any new names
      if (data.game.playerNames) {
        setPlayerNamesCache(prevCache => ({
          ...prevCache,
          ...data.game.playerNames
        }));
        setNamesLoaded(true);
      }

      setGame(data.game);
      setLoading(false);
    } catch (err) {
      setError("Error loading game");
      setLoading(false);
    }
  };

  useEffect(() => {
    // Initial fetch with immediate feedback
    fetchGame();

    // Set up polling to refresh game data
    const interval = setInterval(() => {
      fetchGame();
    }, 5000);

    return () => clearInterval(interval);
  }, [params.id]);

  // Redirect effect - if game has started, automatically redirect all players to the main game page
  useEffect(() => {
    if (game?.started_at && !loading) {
      router.push(`/password/${params.id}`);
    }
  }, [game?.started_at, loading, params.id, router]);

  const joinTeam = async (teamNumber: string | number) => {
    try {
      const response = await fetch(`/api/password/${params.id}/team/team-join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, teamNumber }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to join team");
      }

      const data = await response.json();
      setGame(data.game);
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Failed to join team");
      }
    }
  };

  const leaveTeam = async () => {
    try {
      const response = await fetch(`/api/password/${params.id}/team/team-leave`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to leave team");
      }

      const data = await response.json();
      setGame(data.game);
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Failed to leave team");
      }
    }
  };

  const leaveGame = async () => {
    try {
      const response = await fetch(`/api/password/${params.id}/leave`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to leave game");
      }

      // Redirect back to main page after successfully leaving
      router.push("/");
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Failed to leave game");
      }
    }
  };

  const startGame = async () => {
    try {
      // Call API to start the game
      const response = await fetch(`/api/password/${params.id}/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to start game");
      }

      // Redirect directly to the game page
      router.push(`/password/${params.id}`);
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Failed to start game");
      }
    }
  };

  // Check which team the current player is in
  const getCurrentTeam = () => {
    if (!game || !sessionId) return null;

    for (const teamKey in game.teams) {
      if (game.teams[teamKey].includes(sessionId)) {
        return teamKey;
      }
    }
    return null;
  };

  const currentTeam = getCurrentTeam();
  const isHost = game?.host_id === sessionId;

  // Display function to prevent flashing IDs - prioritize cached names
  const displayPlayerName = (playerId: string) => {
    // Check cache first for instant name display
    if (playerNamesCache[playerId]) {
      return playerNamesCache[playerId];
    }

    // Then check current game data
    if (game?.playerNames?.[playerId]) {
      return game.playerNames[playerId];
    }

    // Show loading only if names are still being fetched initially
    if (loading && !namesLoaded) {
      return "Loading...";
    }

    // Fallback to truncated ID if names couldn't be loaded
    return playerId.slice(0, 8);
  };

  if (loading) return (
    <main className="min-h-screen flex items-center justify-center bg-main text-main">
      <div className="flex flex-col items-center gap-4">
        <div className="animate-spin w-12 h-12 text-primary border-4 border-current border-t-transparent rounded-full"></div>
        <div className="text-lg text-secondary">Loading game...</div>
      </div>
    </main>
  );

  if (error) return (
    <main className="min-h-screen flex items-center justify-center bg-main text-destructive">
      <div className="text-lg">{error}</div>
    </main>
  );

  if (!game) return (
    <main className="min-h-screen flex items-center justify-center bg-main text-main">
      <div className="text-lg">Game not found</div>
    </main>
  );

  const canStartGame = !Object.keys(game.teams)
    .filter((key) => key !== "noTeam")
    .some((team) => game.teams[team].length !== 2);

  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-main text-main p-4 py-8">
      <div className="bg-card border border-secondary rounded-xl shadow-lg p-8 w-full max-w-5xl flex flex-col items-center gap-6">
        <h1 className="text-3xl font-bold text-primary text-center uppercase tracking-wide mb-6">Password Game Lobby</h1>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 w-full">
          {/* Game Info Section */}
          <div className="flex flex-col items-center gap-4">
            <div className="bg-secondary/10 rounded-lg p-4 border border-secondary/30 w-full">
              <h2 className="text-xl font-bold text-primary border-b border-primary/30 pb-2 mb-4">Game Info</h2>

              <div className="flex flex-col items-center my-4 w-full">
                <div className="text-lg font-semibold text-primary text-center mb-2">Join Code</div>
                <div className="bg-main text-primary font-mono text-3xl tracking-widest rounded-lg px-8 py-3 mb-2 select-all border-2 border-primary/50 text-center w-full font-extrabold">
                  {game.code || <span className="text-secondary">(not available)</span>}
                </div>
                <div className="text-xs text-secondary text-center mb-2">Share this code with friends to join!</div>
              </div>

              <div className="space-y-3 mt-4">
                <div className="flex justify-between px-3 py-2 rounded bg-primary/10 border border-primary/30">
                  <span className="font-medium">Host:</span>
                  <span className="font-bold">{displayPlayerName(game.host_id)}</span>
                </div>
                <div className="flex justify-between px-3 py-2 rounded bg-primary/10 border border-primary/30">
                  <span className="font-medium">Total Players:</span>
                  <span className="font-bold">
                    {Object.values(game.teams).flat().length}
                  </span>
                </div>
              </div>
            </div>

            {/* Controls */}
            <div className="flex flex-col w-full gap-2">
              {isHost && (
                <Button
                  onClick={startGame}
                  className="w-full"
                  disabled={!canStartGame}
                >
                  {canStartGame ? "Start Game" : "Need 2 players per team"}
                </Button>
              )}
              <Button
                onClick={leaveGame}
                className="w-full"
                variant="destructive"
              >
                Leave Game
              </Button>
              {error && <div className="text-destructive text-center mt-2">{error}</div>}
            </div>
          </div>

          {/* Players Without Teams Section */}
          <div className="bg-secondary/10 rounded-lg p-4 border border-secondary/30">
            <h2 className="text-xl font-bold text-primary border-b border-primary/30 pb-2 mb-4">Unassigned Players</h2>
            <div className="w-full">
              {game.teams.noTeam.length > 0 ? (
                <ul className="space-y-2">
                  {game.teams.noTeam.map((playerId) => (
                    <li key={playerId} className="px-3 py-2 rounded bg-primary/10 border border-primary/30 font-medium flex justify-between items-center">
                      <div>
                        {displayPlayerName(playerId)}
                        {playerId === sessionId && <span className="ml-2 text-xs text-secondary">(you)</span>}
                        {playerId === game.host_id && (
                          <span className="ml-2 text-xs px-1.5 py-0.5 bg-secondary/20 rounded text-secondary">Host</span>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="text-secondary bg-secondary/10 p-4 rounded-lg text-center">
                  No players waiting for teams
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Teams Section - Below the grid */}
        <div className="w-full">
          <h2 className="text-2xl font-bold text-primary border-b border-primary/30 pb-2 mb-4">Teams</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Object.keys(game.teams)
              .filter((key) => key !== "noTeam")
              .map((teamKey) => (
                <div key={teamKey} className="bg-secondary/10 rounded-lg p-4 border border-secondary/30">
                  <h3 className="text-lg font-bold text-primary border-b border-primary/30 pb-2 mb-3">Team {teamKey}</h3>

                  <div className="mb-4">
                    {game.teams[teamKey].length > 0 ? (
                      <ul className="space-y-2">
                        {game.teams[teamKey].map((playerId) => (
                          <li key={playerId} className="px-3 py-2 rounded bg-primary/10 border border-primary/30 font-medium flex justify-between items-center">
                            <div>
                              {displayPlayerName(playerId)}
                              {playerId === sessionId && <span className="ml-2 text-xs text-secondary">(you)</span>}
                              {playerId === game.host_id && (
                                <span className="ml-2 text-xs px-1.5 py-0.5 bg-secondary/20 rounded text-secondary">Host</span>
                              )}
                            </div>
                            {playerId === sessionId && currentTeam !== "noTeam" && (
                              <button
                                onClick={(e) => {
                                  e.preventDefault();
                                  leaveTeam();
                                }}
                                className="text-destructive hover:text-destructive/80 transition-colors p-1 rounded-full hover:bg-secondary/10"
                                aria-label="Leave Team"
                              >
                                <X size={16} />
                              </button>
                            )}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <div className="text-secondary bg-secondary/10 p-4 rounded-lg text-center">
                        No players in this team
                      </div>
                    )}
                  </div>

                  {currentTeam !== teamKey && currentTeam === "noTeam" && game.teams[teamKey].length < 2 && (
                    <Button
                      onClick={() => joinTeam(teamKey)}
                      className="w-full bg-primary text-main hover:bg-primary/90 transition"
                    >
                      Join Team {teamKey}
                    </Button>
                  )}

                  {game.teams[teamKey].length === 2 && (
                    <div className="text-green-600 text-center text-sm mt-2">
                      Team complete
                    </div>
                  )}

                  {game.teams[teamKey].length === 1 && (
                    <div className="text-amber-500 text-center text-sm mt-2">
                      Need one more player
                    </div>
                  )}
                </div>
              ))}
          </div>
        </div>

        {/* Game readiness status */}
        {isHost && !canStartGame && (
          <div className="text-amber-500 text-center mt-2">
            All teams must have exactly 2 players to start
          </div>
        )}

        {isHost && canStartGame && game.teams.noTeam.length > 0 && (
          <div className="text-amber-500 text-center mt-2">
            Warning: {game.teams.noTeam.length} player{game.teams.noTeam.length > 1 ? 's' : ''} still not assigned to teams
          </div>
        )}
      </div>
    </main>
  );
}
