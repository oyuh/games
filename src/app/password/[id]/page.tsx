"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useRef } from "react";
import { Button } from "~/components/ui/button";
import { useSessionInfo } from "~/app/_components/session-modal";
import { imposterCategories } from "~/data/categoryList";
import { Input } from "~/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "~/components/ui/dialog";
import type { PasswordGame as PasswordGameType } from "~/lib/types/password";

export default function PasswordPage({
  params,
}: {
  params: { id: string };
}) {
  const [game, setGame] = useState<PasswordGameType | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [namesLoaded, setNamesLoaded] = useState<boolean>(false);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedWord, setSelectedWord] = useState<string>("");
  const [clue, setClue] = useState<string>("");
  const [guess, setGuess] = useState<string>("");
  const [showLeaveDialog, setShowLeaveDialog] = useState<boolean>(false);
  const router = useRouter();
  const { session } = useSessionInfo();
  const sessionId = session?.id;
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const [playerNamesCache, setPlayerNamesCache] = useState<Record<string, string>>({});

  // Heartbeat functionality
  const sendHeartbeat = async () => {
    if (!sessionId || !game) return;

    try {
      await fetch(`/api/password/${params.id}/heartbeat`, {
        method: "POST",
        credentials: "include",
      });
    } catch (error) {
      console.error("Failed to send heartbeat:", error);
    }
  };

  // Start heartbeat when game starts
  useEffect(() => {
    if (game?.started_at && sessionId && !game.finished_at) {
      // Send initial heartbeat
      sendHeartbeat();

      // Set up interval for heartbeats every 10 seconds
      heartbeatIntervalRef.current = setInterval(sendHeartbeat, 10000);

      return () => {
        if (heartbeatIntervalRef.current) {
          clearInterval(heartbeatIntervalRef.current);
        }
      };
    }
  }, [game?.started_at, game?.finished_at, sessionId, params.id]);

  const fetchGame = async () => {
    try {
      const response = await fetch(`/api/password/${params.id}`, {
        headers: {
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        }
      });

      if (!response.ok) {
        throw new Error("Failed to load game");
      }

      const data = await response.json();

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
    // This effect runs whenever teamScores changes
    if (
      game?.game_data?.teamScores &&
      game?.game_data?.pointsToWin &&
      Object.values(game.game_data.teamScores).some(score => score >= Number(game.game_data.pointsToWin))
    ) {
      console.log("Team reached points to win! Ending game...");
      fetch(`/api/password/${params.id}/end-game`, {
        method: "POST",
        cache: "no-store",
        headers: {
          'Pragma': 'no-cache',
          'Cache-Control': 'no-cache'
        }
      }).then(() => {
        // Force reload after a brief delay to ensure all clients have updated data
        setTimeout(() => {
          window.location.href = `/password/${params.id}/results`;
        }, 1000);
      });
    }
  }, [game?.game_data?.teamScores, game?.game_data?.pointsToWin, params.id]);

  useEffect(() => {
    fetchGame();

    const interval = setInterval(() => {
      fetchGame();
    }, 3000);

    // Check if game has finished and redirect to results page immediately
    if (game?.finished_at ||
        (game?.game_data?.winningTeams && game.game_data.winningTeams.length > 0)) {
      router.push(`/password/${params.id}/results`);
      return;
    }

    return () => clearInterval(interval);
  }, [params.id, game?.finished_at, game?.game_data?.winningTeams, router]);

  const voteForCategory = async (category: string) => {
    try {
      setSelectedCategory(category);
      const response = await fetch(`/api/password/${params.id}/vote-category`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to vote for category");
      }

      fetchGame();
    } catch (err) {
      if (err instanceof Error) {
        setActionError(err.message);
      } else {
        setActionError("Failed to vote for category");
      }
    }
  };

  const selectWord = async () => {
    if (!selectedWord) return;

    try {
      const response = await fetch(`/api/password/${params.id}/select-word`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ word: selectedWord }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to select word");
      }

      setSelectedWord("");
      fetchGame();
    } catch (err) {
      if (err instanceof Error) {
        setActionError(err.message);
      } else {
        setActionError("Failed to select word");
      }
    }
  };

  const submitClue = async () => {
    if (!clue) return;

    try {
      const response = await fetch(`/api/password/${params.id}/clue`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clue }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to submit clue");
      }

      setClue("");
      fetchGame();
    } catch (err) {
      if (err instanceof Error) {
        setActionError(err.message);
      } else {
        setActionError("Failed to submit clue");
      }
    }
  };

  const submitGuess = async () => {
    if (!guess) return;

    try {
      const response = await fetch(`/api/password/${params.id}/guess`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guess }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to submit guess");
      }

      setGuess("");
      fetchGame();
    } catch (err) {
      if (err instanceof Error) {
        setActionError(err.message);
      } else {
        setActionError("Failed to submit guess");
      }
    }
  };

  const startNextRound = async () => {
    try {
      const response = await fetch(`/api/password/${params.id}/next-round`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to start next round");
      }

      fetchGame();
    } catch (err) {
      if (err instanceof Error) {
        setActionError(err.message);
      } else {
        setActionError("Failed to start next round");
      }
    }
  };

  const endRound = async () => {
    try {
      const response = await fetch(`/api/password/${params.id}/end-round`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to end round");
      }

      fetchGame();
    } catch (err) {
      if (err instanceof Error) {
        setActionError(err.message);
      } else {
        setActionError("Failed to end round");
      }
    }
  };

  const displayPlayerName = (playerId: string) => {
    if (playerNamesCache[playerId]) {
      return playerNamesCache[playerId];
    }

    if (game?.playerNames?.[playerId]) {
      return game.playerNames[playerId];
    }

    if (loading && !namesLoaded) {
      return "Loading...";
    }

    return playerId.slice(0, 8);
  };

  const getCurrentTeam = () => {
    if (!game || !sessionId) return null;

    for (const teamKey in game.teams) {
      if (game.teams[teamKey].includes(sessionId)) {
        return teamKey;
      }
    }
    return null;
  };

  const getPlayerRole = () => {
    if (!game?.game_data?.teamRoles || !sessionId || !currentTeam) return null;

    const teamRole = game.game_data.teamRoles[currentTeam];
    if (!teamRole) return null;

    if (teamRole.clueGiver === sessionId) return "clueGiver";
    if (teamRole.guesser === sessionId) return "guesser";
    return null;
  };

  const currentTeam = getCurrentTeam();
  const playerRole = getPlayerRole();
  const isHost = game?.host_id === sessionId;

  const getTeammate = () => {
    if (!game || !sessionId || !currentTeam || currentTeam === "noTeam") return null;

    const teamMembers = game.teams[currentTeam];
    return teamMembers.find(id => id !== sessionId) || null;
  };

  const teammate = getTeammate();

  const hasVoted = () => {
    if (!game?.game_data?.categoryVotes || !sessionId) return false;
    return sessionId in game.game_data.categoryVotes;
  };

  const getTeammateVote = () => {
    if (!game?.game_data?.categoryVotes || !teammate) return null;
    return game.game_data.categoryVotes[teammate];
  };

  const teammateVote = getTeammateVote();

  const getCategoryItems = () => {
    if (!game?.game_data?.currentCategory) return [];

    const categoryKey = Object.keys(imposterCategories).find(
      key => imposterCategories[key].displayName === game.game_data!.currentCategory
    );

    if (!categoryKey) return [];
    return imposterCategories[categoryKey].items;
  };

  const categoryItems = getCategoryItems();

  const hasTeamSelectedWord = () => {
    if (!game?.game_data?.selectedWords || !currentTeam) return false;
    return currentTeam in game.game_data.selectedWords;
  };

  const getTeamSelectedWord = () => {
    if (!game?.game_data?.selectedWords || !currentTeam) return null;
    return game.game_data.selectedWords[currentTeam];
  };

  const getLatestClue = () => {
    if (!game?.game_data?.clues || !currentTeam) return null;
    const teamClues = game.game_data.clues[currentTeam] || [];
    return teamClues.length > 0 ? teamClues[teamClues.length - 1] : null;
  };

  const getLatestGuess = () => {
    if (!game?.game_data?.guesses || !currentTeam) return null;
    const teamGuesses = game.game_data.guesses[currentTeam] || [];
    return teamGuesses.length > 0 ? teamGuesses[teamGuesses.length - 1] : null;
  };

  const isPlayerTurn = () => {
    if (!game?.game_data || !currentTeam || !playerRole) return false;

    if (game.game_data.phase === "word-selection") {
      return playerRole === "clueGiver" && !hasTeamSelectedWord();
    }

    if (game.game_data.phase === "clue-giving") {
      const teamClues = game.game_data.clues?.[currentTeam] || [];
      const teamGuesses = game.game_data.guesses?.[currentTeam] || [];

      return playerRole === "clueGiver" && teamClues.length === teamGuesses.length;
    }

    if (game.game_data.phase === "guessing") {
      const teamClues = game.game_data.clues?.[currentTeam] || [];
      const teamGuesses = game.game_data.guesses?.[currentTeam] || [];

      return playerRole === "guesser" && teamClues.length > teamGuesses.length;
    }

    return false;
  };

  // --- NEW: Per-team helpers ---
  const getPerTeamData = (teamKey: string) => {
    // Only use game.game_data.round_data (API response)
    if (game?.game_data?.round_data && game.game_data.round_data[teamKey]) {
      return game.game_data.round_data[teamKey];
    }
    return null;
  };

  const getCurrentTeamPerTeamData = () => {
    if (!currentTeam) return null;
    return getPerTeamData(currentTeam);
  };

  const getCategoryItemsPerTeam = (teamKey: string) => {
    const perTeam = getPerTeamData(teamKey);
    if (!perTeam?.category) return [];
    const categoryKey = Object.keys(imposterCategories).find(
      key => imposterCategories[key].displayName === perTeam.category
    );
    if (!categoryKey) return [];
    return imposterCategories[categoryKey].items;
  };

  const hasTeamSelectedWordPerTeam = (teamKey: string) => {
    // Use selectedWords from game_data if available
    if (game?.game_data?.selectedWords && game.game_data.selectedWords[teamKey]) return true;
    return false;
  };

  const getTeamSelectedWordPerTeam = (teamKey: string) => {
    // Use selectedWords from game_data if available
    if (game?.game_data?.selectedWords && game.game_data.selectedWords[teamKey]) {
      return game.game_data.selectedWords[teamKey];
    }
    return null;
  };

  const getTeamGuesser = (teamKey: string) => {
    const perTeam = getPerTeamData(teamKey);
    return perTeam?.guesser || null;
  };

  const getTeamClueGiver = (teamKey: string) => {
    const perTeam = getPerTeamData(teamKey);
    return perTeam?.clueGiver || null;
  };
  // --- END NEW ---

  // --- LEAVE GAME HANDLING ---
  // Only trigger leave if not a refresh
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      // Mark as refresh if the page is being reloaded
      sessionStorage.setItem("password-refreshing", "true");
      // Let the event continue
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        // If not a refresh, treat as a leave
        if (!sessionStorage.getItem("password-refreshing")) {
          fetch(`/api/password/${params.id}/leave`, { method: "POST" });
        }
      } else if (document.visibilityState === "visible") {
        // Clear the refresh flag when the page is visible again
        sessionStorage.removeItem("password-refreshing");
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [params.id]);

  const leaveGame = async () => {
    await fetch(`/api/password/${params.id}/leave`, { method: "POST" });
    router.push("/");
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

  if (!game.started_at) {
    router.push(`/password/${params.id}/begin`);
    return (
      <main className="min-h-screen flex items-center justify-center bg-main text-main">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin w-12 h-12 text-primary border-4 border-current border-t-transparent rounded-full"></div>
          <div className="text-lg text-secondary">Redirecting to game setup...</div>
        </div>
      </main>
    );
  }

  if (game.finished_at) {
    router.push(`/password/${params.id}/results`);
    return (
      <main className="min-h-screen flex items-center justify-center bg-main text-main">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin w-12 h-12 text-primary border-4 border-current border-t-transparent rounded-full"></div>
          <div className="text-lg text-secondary">Redirecting to results...</div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-main text-main p-4">
      <Dialog open={showLeaveDialog} onOpenChange={setShowLeaveDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Leave Game</DialogTitle>
            <DialogDescription>
              Are you sure you want to leave this game? This will remove you from the game and you'll need to rejoin with the game code if you want to play again.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowLeaveDialog(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={leaveGame}>
              Leave Game
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="bg-card border border-secondary rounded-xl shadow-lg p-8 w-full max-w-[1080px] flex flex-col items-center gap-4">
        <div className="w-full flex justify-between items-center mb-2">
          <h1 className="text-3xl font-bold text-primary uppercase tracking-wide">Password Game</h1>
          <Button
            onClick={() => setShowLeaveDialog(true)}
            variant="destructive"
            size="sm"
            className="px-4 py-2"
          >
            Leave Game
          </Button>
        </div>

        {actionError && (
          <div className="w-full max-w-lg bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-red-500 mb-4">
            <p>{actionError}</p>
          </div>
        )}

        <div className="w-full mt-4">
          <h2 className="text-xl font-bold text-primary text-center mb-4">Teams</h2>
          <div className="flex flex-wrap justify-center gap-4 mb-6 max-w-[1000px] mx-auto">
            {Object.keys(game.teams)
              .filter((key) => key !== "noTeam")
              .map((teamKey) => {
                const perTeamData = getPerTeamData(teamKey);
                return (
                  <div key={teamKey} className="bg-secondary/10 border border-secondary/30 rounded-lg p-4 w-[220px]">
                    <h3 className="text-lg font-medium mb-2 text-primary text-center">
                      Team {teamKey}
                      {game.game_data?.teamScores && ` (${game.game_data.teamScores[teamKey] || 0})`}
                    </h3>
                    {/* Show category specific to each team */}
                    {(() => {
                      // Get the category specifically for this team
                      const teamCategory = perTeamData?.category;
                      // Only fall back to global category if nothing else is available
                      const fallbackCategory = game.game_data?.currentCategory;

                      return teamCategory ? (
                        <p className="text-sm text-secondary text-center mb-2">Category: {teamCategory}</p>
                      ) : fallbackCategory ? (
                        <p className="text-sm text-secondary text-center mb-2">Category: {fallbackCategory}</p>
                      ) : null;
                    })()}
                    {/* Show the word only to clue givers for their own team */}
                    {(() => {
                      // Get team roles to check if host is also clue giver
                      const teamRoles = game.game_data?.teamRoles && game.game_data.teamRoles[teamKey];
                      const isClueGiverForTeam = teamRoles && teamRoles.clueGiver === sessionId;
                      const isGuesserForTeam = teamRoles && teamRoles.guesser === sessionId;

                      // Determine if user should see the word
                      if (isClueGiverForTeam) {
                        // User is clue giver for this team - show the word
                        if (game.game_data?.selectedWords && game.game_data.selectedWords[teamKey]) {
                          return <p className="text-sm text-secondary text-center mb-2">Word: {game.game_data.selectedWords[teamKey]}</p>;
                        } else if (perTeamData?.word) {
                          return <p className="text-sm text-secondary text-center mb-2">Word: {perTeamData.word}</p>;
                        }
                      }
                      // User is guesser for this team - show (hidden)
                      else if (isGuesserForTeam) {
                        return <p className="text-sm text-secondary text-center mb-2">Word: <span className="italic">(hidden)</span></p>;
                      }
                      // User is not on this team - don't show anything
                      return null;
                    })()}
                    <div className="mb-4">
                      {game.teams[teamKey].length > 0 ? (
                        <ul className="w-full flex flex-col gap-2 items-center">
                          {game.teams[teamKey].map((playerId) => {
                            const isClueGiver = perTeamData?.clueGiver === playerId;
                            const isGuesser = perTeamData?.guesser === playerId;

                            return (
                              <li key={playerId} className="w-full">
                                <div className="flex items-center justify-between bg-primary/10 border border-primary/30 rounded-md shadow-sm px-3 py-2 w-full">
                                  <div className="flex items-center">
                                    <span className="font-medium text-primary">{displayPlayerName(playerId)}</span>
                                    {playerId === sessionId && <span className="ml-2 text-xs text-secondary">(you)</span>}
                                    {playerId === game.host_id &&
                                      <span className="ml-2 text-xs px-1.5 py-0.5 bg-secondary/20 rounded text-secondary">Host</span>
                                    }
                                  </div>
                                  <div className="flex items-center">
                                    {isClueGiver &&
                                      <span className="text-xs px-1.5 py-0.5 bg-blue-500/20 rounded text-blue-500">Clue Giver</span>
                                    }
                                    {isGuesser &&
                                      <span className="text-xs px-1.5 py-0.5 bg-purple-500/20 rounded text-purple-500">Guesser</span>
                                    }
                                  </div>
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      ) : (
                        <p className="text-secondary text-center">No players in this team</p>
                      )}
                    </div>
                  </div>
                );
              })}
          </div>
        </div>

        <div className="w-full mt-6 mb-4 max-w-lg">
          <div className="bg-primary/10 border border-primary/30 rounded-lg p-6 text-center">
            <h2 className="text-xl font-bold text-primary mb-4">Round {game.game_data?.round || 1}</h2>

            {game.game_data?.phase === "category-selection" && (
              <div>
                <h3 className="text-lg font-semibold mb-4">Choose a Category</h3>

                {hasVoted() && (
                  <div className="mb-6 p-3 bg-secondary/20 rounded-lg">
                    <p>You voted for: <span className="font-bold text-primary">{game.game_data.categoryVotes[sessionId!]}</span></p>

                    {teammateVote ? (
                      <p className="mt-2">Your teammate voted for: <span className="font-bold text-primary">{teammateVote}</span></p>
                    ) : (
                      <p className="mt-2">Waiting for your teammate to vote...</p>
                    )}
                  </div>
                )}

                {!hasVoted() && (
                  <div className="flex flex-wrap justify-center gap-3 mb-4">
                    {Object.entries(imposterCategories).map(([key, category]) => (
                      <Button
                        key={key}
                        onClick={() => voteForCategory(category.displayName)}
                        className={`bg-primary text-main hover:bg-primary/90 transition ${selectedCategory === category.displayName ? 'ring-2 ring-offset-2 ring-primary' : ''}`}
                      >
                        {category.displayName}
                      </Button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {game.game_data?.phase === "word-selection" && (
              <div>
                <h3 className="text-lg font-semibold mb-4">
                  {getCurrentTeamPerTeamData()?.category ? `Category: ${getCurrentTeamPerTeamData()?.category}` : "Waiting for category selection..."}
                </h3>

                {hasTeamSelectedWordPerTeam(currentTeam!) ? (
                  <div className="mb-4 p-3 bg-secondary/20 rounded-lg">
                    {playerRole === "clueGiver" ? (
                      <div>
                        <p>You selected the secret word:</p>
                        <p className="mt-2 text-xl font-bold text-primary">{getTeamSelectedWordPerTeam(currentTeam!)}</p>
                        <p className="mt-2">Waiting for other teams to select their words...</p>
                      </div>
                    ) : (
                      <div>
                        <p>Your teammate is selecting a secret word...</p>
                        {getTeamSelectedWordPerTeam(currentTeam!) && (
                          <div className="mt-3">
                            <p>Secret word has been selected!</p>
                            <p className="mt-2 italic text-sm">The word will be kept secret from you as the guesser.</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <>
                    {playerRole === "clueGiver" ? (
                      <div className="mb-4">
                        <p className="mb-4">As the Clue Giver, select a secret word from the category:</p>
                        <div className="flex flex-wrap justify-center gap-2 mb-4">
                          {getCategoryItemsPerTeam(currentTeam!).map((item) => (
                            <Button
                              key={item}
                              onClick={() => setSelectedWord(item)}
                              className={`bg-secondary text-main hover:bg-secondary/90 transition ${selectedWord === item ? 'ring-2 ring-offset-2 ring-secondary' : ''}`}
                            >
                              {item}
                            </Button>
                          ))}
                        </div>

                        {selectedWord && (
                          <div className="mt-4">
                            <p className="mb-2">Selected word: <span className="font-bold">{selectedWord}</span></p>
                            <Button
                              onClick={selectWord}
                              className="bg-primary text-main hover:bg-primary/90 transition"
                            >
                              Confirm Selection
                            </Button>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="mb-4 p-3 bg-secondary/20 rounded-lg">
                        <p>Your teammate is selecting a secret word...</p>
                        <p className="mt-2 italic text-sm">As the Guesser, you will not know the secret word.</p>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {(game.game_data?.phase === "clue-giving" || game.game_data?.phase === "guessing") && (
              <div>
                <h3 className="text-lg font-semibold mb-4">
                  {/* Get the category specific to the current player's team */}
                  Category: {(() => {
                    // First try to get the team-specific category
                    if (currentTeam && game.game_data?.round_data?.[currentTeam]?.category) {
                      return game.game_data.round_data[currentTeam].category;
                    }
                    // Then check perTeam data
                    else if (currentTeam && game.round_data?.perTeam?.[currentTeam]?.category) {
                      return game.round_data.perTeam[currentTeam].category;
                    }
                    // Fallback to global category if needed
                    else {
                      return game.game_data?.currentCategory || "Loading...";
                    }
                  })()}
                </h3>

                {game.game_data.clues && game.game_data.clues[currentTeam!] && game.game_data.clues[currentTeam!].length > 0 && (
                  <div className="mb-6">
                    <h4 className="text-md font-medium mb-2">Clues & Guesses</h4>
                    <div className="flex flex-col gap-2 max-h-[200px] overflow-y-auto p-2 border border-secondary/30 rounded-lg">
                      {game.game_data.clues[currentTeam!].map((clue, index) => (
                        <div key={`exchange-${index}`} className="flex flex-col gap-1">
                          <div className="flex items-center bg-blue-500/10 p-2 rounded-md">
                            <span className="text-blue-500 font-medium mr-2">Clue:</span>
                            <span>{clue}</span>
                          </div>

                          {game.game_data!.guesses &&
                            game.game_data!.guesses[currentTeam!] &&
                            game.game_data!.guesses[currentTeam!][index] && (
                              <div className="flex items-center bg-purple-500/10 p-2 rounded-md">
                                <span className="text-purple-500 font-medium mr-2">Guess:</span>
                                <span>
                                  {typeof game.game_data!.guesses[currentTeam!][index] === 'object'
                                    ? game.game_data!.guesses[currentTeam!][index].word
                                    : game.game_data!.guesses[currentTeam!][index]}
                                </span>
                              </div>
                            )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {playerRole === "clueGiver" && (
                  <div className="mb-4 p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg">
                    <p className="text-sm mb-1">Secret Word (only you can see this):</p>
                    {getTeamSelectedWordPerTeam(currentTeam!) ? (
                      <p className="text-xl font-bold text-primary">{getTeamSelectedWordPerTeam(currentTeam!)}</p>
                    ) : (
                      <p className="text-secondary italic">No word selected yet</p>
                    )}
                  </div>
                )}

                {isPlayerTurn() ? (
                  <div className="mt-4">
                    {playerRole === "clueGiver" && (
                      <div>
                        <p className="mb-3">Give a one-word clue to help your teammate guess the secret word:</p>
                        <div className="flex gap-2">
                          <Input
                            type="text"
                            placeholder="Enter your clue"
                            value={clue}
                            onChange={(e) => setClue(e.target.value)}
                            className="flex-1"
                          />
                          <Button
                            onClick={submitClue}
                            disabled={!clue}
                            className="bg-primary text-main hover:bg-primary/90 transition"
                          >
                            Submit Clue
                          </Button>
                        </div>
                        <p className="text-xs text-secondary mt-2">
                          Remember: Your clue must be a single word related to the secret word.
                        </p>
                      </div>
                    )}

                    {playerRole === "guesser" && (
                      <div>
                        <p className="mb-3">Based on the clue, make your guess:</p>
                        <div className="flex gap-2">
                          <Input
                            type="text"
                            placeholder="Enter your guess"
                            value={guess}
                            onChange={(e) => setGuess(e.target.value)}
                            className="flex-1"
                          />
                          <Button
                            onClick={submitGuess}
                            disabled={!guess}
                            className="bg-primary text-main hover:bg-primary/90 transition"
                          >
                            Submit Guess
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="mt-4 p-3 bg-secondary/20 rounded-lg">
                    {playerRole === "clueGiver" ? (
                      <p>Waiting for your teammate to guess...</p>
                    ) : (
                      <p>Waiting for your teammate to give a clue...</p>
                    )}
                  </div>
                )}

                {/* Add team status indicator without implying teams need to wait for each other */}
                {game.game_data?.teamPhases && Object.entries(game.game_data.teamPhases)
                  .filter(([teamKey]) => teamKey !== "noTeam")
                  .length > 1 && (
                    <div className="mt-4 p-3 bg-blue-500/10 rounded-lg border border-blue-500/30">
                      <p className="text-sm">Team Progress Status</p>
                      <div className="mt-2 text-xs space-y-1">
                        {Object.entries(game.game_data.teamPhases)
                          .filter(([teamKey]) => teamKey !== "noTeam")
                          .map(([teamKey, phase]) => {
                            const isYourTeam = teamKey === currentTeam;
                            return (
                              <div key={teamKey} className={`flex justify-between ${isYourTeam ? 'font-bold' : ''}`}>
                                <span>Team {teamKey}{isYourTeam ? ' (your team)' : ''}:</span>
                                <span className="font-medium">
                                  {phase === "clue-giving" ? "Giving clues" :
                                   phase === "guessing" ? "Making a guess" :
                                   phase === "round-results" ? "Finished round" :
                                   phase === "category-selection" ? "Selecting category" :
                                   phase === "word-selection" ? "Selecting word" :
                                   phase}
                                </span>
                              </div>
                            );
                          })}
                      </div>
                    </div>
                  )}
              </div>
            )}

            {game.game_data?.phase === "round-results" && (
              <div>
                <h3 className="text-lg font-semibold mb-4">Round Results</h3>

                <div className="mb-6 p-4 bg-secondary/10 rounded-lg border border-secondary/30">
                  <h4 className="font-medium text-primary mb-3">Guess Summary</h4>

                  {game.game_data.roundGuessCount && (
                    <div className="space-y-2 mb-4">
                      {Object.entries(game.game_data.roundGuessCount).map(([teamKey, guessCount]) => {
                        const isWinner = game.game_data.roundSummary &&
                                        game.game_data.roundSummary[game.game_data.round] &&
                                        game.game_data.roundSummary[game.game_data.round].winningTeams.includes(teamKey);

                        // Get the team's secret word to display in results
                        const teamWord = game.game_data?.selectedWords?.[teamKey] ||
                                         game.game_data?.round_data?.[teamKey]?.word ||
                                         game.round_data?.perTeam?.[teamKey]?.word ||
                                         "Unknown";

                        return (
                          <div
                            key={teamKey}
                            className={`flex flex-col p-3 rounded ${isWinner ? 'bg-green-500/20 border border-green-500/30' : 'bg-secondary/5'}`}
                          >
                            <div className="flex justify-between mb-1">
                              <span className="font-medium">Team {teamKey}</span>
                              <div>
                                <span>{guessCount} {Number(guessCount) === 1 ? 'guess' : 'guesses'}</span>
                                {isWinner && <span className="ml-2 text-green-600">+1 point</span>}
                              </div>
                            </div>
                            <div className="text-sm mt-1">
                              <span className="text-secondary">Secret word:</span> <span className="font-medium">{teamWord}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <div className="mt-4">
                    <h4 className="font-medium text-primary mb-2">Current Scores</h4>
                    <div className="space-y-2">
                      {game.game_data.teamScores && Object.entries(game.game_data.teamScores)
                        .sort(([, scoreA], [, scoreB]) => Number(scoreB) - Number(scoreA))
                        .map(([teamKey, score]) => (
                          <div key={teamKey} className="flex justify-between p-2 bg-primary/10 rounded">
                            <span>Team {teamKey}</span>
                            <span className="font-bold">{score} {Number(score) === 1 ? 'point' : 'points'}</span>
                          </div>
                        ))
                      }
                    </div>
                  </div>

                  {isHost && (
                    <div className="mt-6 flex justify-center">
                      <Button
                        onClick={startNextRound}
                        className="bg-primary text-main hover:bg-primary/90 transition px-8"
                      >
                        Start Next Round
                      </Button>
                    </div>
                  )}

                  {!isHost && (
                    <p className="mt-6 text-center text-secondary">Waiting for the host to start the next round...</p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
