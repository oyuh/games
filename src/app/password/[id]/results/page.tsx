"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function PasswordResultsPage({ params }: { params: { id: string } }) {
  const [game, setGame] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
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

  // Helper to get player names for a team
  function getTeamPlayers(teamKey: string) {
    return (game.teams[teamKey] || []).map((pid: string) => playerNames[pid] || pid);
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-main text-main p-4 py-8">
      <div className="bg-card border border-secondary rounded-xl shadow-lg p-8 w-full max-w-4xl flex flex-col md:flex-row gap-8 items-start">
        {/* Left: Game summary */}
        <div className="flex-1 flex flex-col gap-6 min-w-[260px] w-full">
          <h1 className="text-3xl font-bold text-primary text-center uppercase tracking-wide mb-2">Game Results</h1>

          <div className="bg-secondary/10 rounded-lg p-4 border border-secondary/30">
            <h2 className="text-xl font-bold text-primary border-b border-primary/30 pb-2 mb-3">Summary</h2>
            {winningTeams.length > 0 ? (
              <div className="mb-4">
                <h3 className="text-lg font-semibold text-green-700 mb-2">Winner{winningTeams.length > 1 ? "s" : ""}</h3>
                <div className="flex flex-wrap gap-2">
                  {winningTeams.map((team: string) => (
                    <div key={team} className="bg-green-500/10 border border-green-500/30 rounded-lg px-4 py-1 text-lg font-semibold text-green-700">
                      Team {team} (Score: {teamScores[team] || 0})
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="mb-4 text-secondary text-lg">No team reached the points to win.</div>
            )}

            <div className="mb-4">
              <h3 className="text-lg font-semibold text-primary mb-2">Final Scores</h3>
              <ul className="space-y-1">
                {Object.entries(teamScores)
                  .sort(([, a], [, b]) => Number(b) - Number(a))
                  .map(([team, score]) => (
                    <li key={team} className="flex justify-between bg-primary/10 border border-primary/30 rounded px-3 py-1">
                      <span>Team {team}</span>
                      <span className="font-bold">{score} {Number(score) === 1 ? "point" : "points"}</span>
                    </li>
                  ))}
              </ul>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-primary mb-2">Teams & Players</h3>
              <ul className="space-y-2">
                {teams.map((teamKey) => (
                  <li key={teamKey} className="bg-secondary/10 rounded px-3 py-2 border border-secondary/20">
                    <div className="font-semibold text-primary mb-1">Team {teamKey}</div>
                    <ul className="flex flex-wrap gap-2">
                      {game.teams[teamKey].map((pid: string) => (
                        <li key={pid} className="bg-main/20 rounded px-2 py-1 text-sm text-main border border-secondary/20">{playerNames[pid] || pid}</li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <button
            onClick={() => window.location.href = "/"}
            className="mt-2 px-6 py-3 bg-primary text-main rounded-lg font-semibold shadow hover:bg-primary/90 transition"
          >
            Back to Home
          </button>
        </div>

        {/* Right: Round-by-round history */}
        <div className="flex-1 flex flex-col gap-3 w-full">
          <h2 className="text-xl font-bold text-primary mb-2">Round-by-Round History</h2>
          <div className="overflow-y-auto max-h-[600px] pr-2 space-y-4">
            {Object.entries(roundSummary).length > 0 ? (
              Object.entries(roundSummary).map(([round, summary]: any) => (
                <div key={round} className="bg-secondary/10 border border-secondary/30 rounded-lg p-4">
                  <div className="mb-2 font-semibold text-lg">Round {round}</div>
                  <div className="mb-2">
                    <span className="font-medium">Winning Team(s): </span>
                    {summary.winningTeams && summary.winningTeams.length > 0
                      ? summary.winningTeams.map((t: string) => `Team ${t}`).join(", ")
                      : <span className="italic text-secondary">No winner</span>}
                  </div>
                  <div className="mb-2">
                    <span className="font-medium">Guesses per Team:</span>
                    <ul className="ml-4 mt-1">
                      {summary.teamGuesses && Object.entries(summary.teamGuesses).map(([team, guesses]: any) => (
                        <li key={team}>
                          Team {team}: {guesses} {Number(guesses) === 1 ? "guess" : "guesses"}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="mb-2">
                    <span className="font-medium">Minimum Guesses to Win:</span> {summary.minGuesses}
                  </div>
                </div>
              ))
            ) : (
              <div className="text-secondary bg-secondary/10 p-4 rounded-lg text-center">
                No round history yet.
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
