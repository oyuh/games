"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function PasswordResultsPage({ params }: { params: { id: string } }) {
  const [game, setGame] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedRounds, setExpandedRounds] = useState<Record<string, boolean>>({});
  const router = useRouter();

  useEffect(() => {
    const fetchGame = async () => {
      try {
        const response = await fetch(`/api/password/${params.id}`);
        if (!response.ok) throw new Error("Failed to load game results");
        const data = await response.json();
        setGame(data.game);
        setLoading(false);
      } catch (err) {
        setError("Error loading results");
        setLoading(false);
      }
    };
    fetchGame();
  }, [params.id]);

  const toggleRoundExpansion = (round: string) => {
    setExpandedRounds(prev => ({
      ...prev,
      [round]: !prev[round]
    }));
  };

  if (loading) return (
    <main className="min-h-screen flex items-center justify-center bg-main text-main">
      <div className="flex flex-col items-center gap-4">
        <div className="animate-spin w-12 h-12 text-primary border-4 border-current border-t-transparent rounded-full"></div>
        <div className="text-lg text-secondary">Loading results...</div>
      </div>
    </main>
  );
  if (error || !game) return <main className="min-h-screen flex items-center justify-center bg-main text-destructive">{error || "Game not found"}</main>;

  const teamScores = game.game_data?.teamScores || {};
  const winningTeams = game.game_data?.winningTeams || [];
  const roundSummary = game.game_data?.roundSummary || {};
  const playerNames = game.playerNames || {};
  const teams = Object.keys(game.teams).filter((t) => t !== "noTeam");
  const pointsToWin = game.game_data?.pointsToWin || 5;

  // Collect all clues and guesses data for each round and team
  const roundHistory = game.game_data?.roundHistory || [];

  // Helper to get player names for a team
  function getTeamPlayers(teamKey: string) {
    return (game.teams[teamKey] || []).map((pid: string) => playerNames[pid] || pid.slice(0, 8));
  }

  // Helper to get player name by ID
  function getPlayerName(playerId: string) {
    return playerNames[playerId] || playerId.slice(0, 8);
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-main text-main p-4 py-8">
      <div className="bg-card border border-secondary rounded-xl shadow-lg p-8 w-full max-w-5xl">
        <h1 className="text-3xl font-bold text-primary text-center uppercase tracking-wide mb-6">Password Game Results</h1>

        {/* Game Summary Section */}
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-primary border-b border-primary/30 pb-2 mb-4">Game Summary</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Winner Display */}
            <div className="bg-secondary/10 rounded-lg p-4 border border-secondary/30">
              <h3 className="text-lg font-semibold text-primary mb-3">Final Outcome</h3>

              {winningTeams.length > 0 ? (
                <div className="mb-4">
                  <h4 className="text-base font-medium text-green-700 mb-2">Winner{winningTeams.length > 1 ? "s" : ""}</h4>
                  <div className="flex flex-wrap gap-2">
                    {winningTeams.map((team: string) => (
                      <div key={team} className="bg-green-500/10 border border-green-500/30 rounded-lg px-4 py-2 text-lg font-semibold text-green-700">
                        Team {team} ({teamScores[team] || 0}/{pointsToWin} points)
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="mb-4 text-secondary text-lg">No team reached the points to win.</div>
              )}

              <div>
                <h4 className="text-base font-medium text-primary mb-2">Final Scores</h4>
                <ul className="space-y-1">
                  {Object.entries(teamScores)
                    .sort(([, a], [, b]) => Number(b) - Number(a))
                    .map(([team, score]) => (
                      <li key={team} className={`flex justify-between px-3 py-2 rounded ${winningTeams.includes(team) ? 'bg-green-500/10 border border-green-500/30' : 'bg-primary/10 border border-primary/30'}`}>
                        <span>Team {team}</span>
                        <span className="font-bold">{score} {Number(score) === 1 ? "point" : "points"}</span>
                      </li>
                    ))}
                </ul>
              </div>
            </div>

            {/* Team Composition */}
            <div className="bg-secondary/10 rounded-lg p-4 border border-secondary/30">
              <h3 className="text-lg font-semibold text-primary mb-3">Teams & Players</h3>
              <ul className="space-y-3">
                {teams.map((teamKey) => (
                  <li key={teamKey} className="bg-secondary/20 rounded-lg px-4 py-3 border border-secondary/30">
                    <div className="font-semibold text-primary mb-2">Team {teamKey}</div>
                    <ul className="space-y-1">
                      {game.teams[teamKey].map((pid: string) => (
                        <li key={pid} className="flex items-center">
                          <div className="bg-main/30 rounded-full h-2 w-2 mr-2"></div>
                          <span>{getPlayerName(pid)}</span>
                          {pid === game.host_id && (
                            <span className="ml-2 text-xs px-1.5 py-0.5 bg-secondary/20 rounded text-secondary">Host</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* Round-by-Round Detailed History */}
        <div>
          <h2 className="text-2xl font-bold text-primary border-b border-primary/30 pb-2 mb-4">Round-by-Round Details</h2>

          <div className="space-y-6 mb-6">
            {Object.entries(roundSummary).length > 0 ? (
              Object.entries(roundSummary).map(([round, summary]: [string, any]) => {
                const isExpanded = expandedRounds[round] || false;
                const roundData = game.game_data?.roundHistory?.[Number(round)-1];
                const teamsClues = game.game_data?.clues || {};
                const teamsGuesses = game.game_data?.guesses || {};
                const selectedWords = game.game_data?.selectedWords || {};

                return (
                  <div key={round} className="bg-secondary/10 border border-secondary/30 rounded-lg p-4">
                    <div
                      className="flex justify-between items-center cursor-pointer"
                      onClick={() => toggleRoundExpansion(round)}
                    >
                      <h3 className="text-lg font-semibold text-primary">Round {round}</h3>
                      <div className="text-sm bg-primary/20 px-3 py-1 rounded-full">
                        {isExpanded ? "Hide Details" : "Show Details"}
                      </div>
                    </div>

                    <div className="mt-2">
                      <div className="flex flex-wrap gap-4">
                        <div>
                          <span className="font-medium">Winning Team(s):</span>{' '}
                          {summary.winningTeams && summary.winningTeams.length > 0
                            ? summary.winningTeams.map((t: string) => `Team ${t}`).join(", ")
                            : <span className="italic text-secondary">None</span>}
                        </div>
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="mt-4 space-y-4">
                        {teams.map(team => {
                          const teamClues = teamsClues[team] || [];
                          const teamGuesses = teamsGuesses[team] || [];
                          const teamWord = selectedWords[team] || "Unknown";
                          const teamPoints = summary.teamGuesses?.[team] ? 1 : 0;
                          const didWin = summary.winningTeams?.includes(team);

                          return (
                            <div key={`team-${team}-round-${round}`}
                              className={`border rounded-lg p-3 ${didWin ? 'border-green-500/30 bg-green-500/5' : 'border-secondary/30'}`}
                            >
                              <div className="flex justify-between mb-3">
                                <h4 className="font-medium text-primary">Team {team}</h4>
                                <div className="text-sm">
                                  {didWin ?
                                    <span className="text-green-600">+{teamPoints} point</span> :
                                    <span className="text-secondary">No points</span>
                                  }
                                </div>
                              </div>

                              <div className="mb-3 text-sm">
                                <strong>Secret Word:</strong> {teamWord}
                              </div>

                              {teamClues.length > 0 && (
                                <div className="space-y-2 mt-3">
                                  <div className="font-medium">Clues & Guesses</div>
                                  <div className="border-l-2 border-secondary/30 pl-3 space-y-3">
                                    {teamClues.map((clue: string, index: number) => {
                                      const guess = teamGuesses[index] ?
                                        (typeof teamGuesses[index] === 'object' ?
                                          teamGuesses[index].word :
                                          teamGuesses[index]
                                        ) : null;

                                      const isCorrect = teamGuesses[index] &&
                                        (typeof teamGuesses[index] === 'object' ?
                                          teamGuesses[index].correct :
                                          teamGuesses[index].toLowerCase() === teamWord.toLowerCase()
                                        );

                                      return (
                                        <div key={`exchange-${index}`} className="bg-secondary/5 rounded-md p-2">
                                          <div className="flex items-center">
                                            <span className="text-blue-500 font-medium w-20">Clue {index+1}:</span>
                                            <span className="bg-blue-500/10 px-2 py-1 rounded">{clue}</span>
                                          </div>
                                          {guess && (
                                            <div className="flex items-center mt-1">
                                              <span className={`font-medium w-20 ${isCorrect ? 'text-green-600' : 'text-purple-500'}`}>
                                                Guess {index+1}:
                                              </span>
                                              <span className={`px-2 py-1 rounded ${
                                                isCorrect ?
                                                'bg-green-500/10 border border-green-500/30' :
                                                'bg-purple-500/10'
                                              }`}>
                                                {guess} {isCorrect && '✓'}
                                              </span>
                                            </div>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              }).reverse() // Show most recent rounds first
            ) : (
              <div className="text-secondary bg-secondary/10 p-4 rounded-lg text-center">
                No round history available.
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-center mt-6">
          <button
            onClick={() => window.location.href = "/"}
            className="px-6 py-3 bg-primary text-main rounded-lg font-semibold shadow hover:bg-primary/90 transition"
          >
            Back to Home
          </button>
        </div>
      </div>
    </main>
  );
}
