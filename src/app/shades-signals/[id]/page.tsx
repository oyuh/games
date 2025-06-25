"use client";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { HexGrid } from "~/components/HexGrid"; // Using relative path~

// --- Type Definitions ---
export interface Player {
  id: string;
  name: string;
}
export interface Guess {
  playerId: string;
  guessedHex: string;
  isCorrect: boolean;
  timestamp: Date;
}
export interface Clue {
  clueGiverId: string;
  clueText: string;
  timestamp: Date;
}
export type GameStatus = 'lobby' | 'active' | 'round_intermission' | 'finished';
export interface Round {
  roundNumber: number;
  clueGiverId: string;
  targetHex: string;
  clues: Clue[];
  guesses: Guess[];
  winnerId?: string | null;
  startTime: Date;
  endTime?: Date;
}
export interface Game {
  id: string;
  code: string;
  hostId: string;
  players: Player[];
  status: GameStatus;
  totalRounds: number;
  currentRoundNumber: number;
  rounds: Round[];
  settings?: {
    maxPlayers?: number;
    roundTimeLimit?: number;
  };
  playerScores: Record<string, number>;
  createdAt: Date;
  updatedAt: Date;
  activeRound?: {
    clueGiverId: string;
    targetHex: string;
    cluesGiven: Clue[];
  };
}
interface ApiResponse {
  game: Game;
  message?: string;
}
type ApiSubmitClueResponse = Game; // Fixed interface to type alias

interface ApiErrorResponse {
  message: string;
  error?: string;
}
// --- End Type Definitions ---

const getAllCellIds = (): string[] => {
    const rows = Array.from({ length: 12 }, (_, i) => String.fromCharCode(65 + i));
    const cols = Array.from({ length: 24 }, (_, i) => (i + 1).toString());
    const ids: string[] = [];
    for (const r of rows) { // Changed forEach to for...of
        for (const c of cols) { // Changed forEach to for...of
            ids.push(`${r}${c}`);
        }
    }
    return ids;
};

export default function ShadesSignalsGamePage({ params }: { params: { id: string } }) {
  const { id: gameId } = params;
  const router = useRouter();
  const [game, setGame] = useState<Game | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clueError, setClueError] = useState<string | null>(null);
  const [currentClue, setCurrentClue] = useState("");

  const currentUserId = game?.hostId ?? "player1_fallback";

  const fetchGameData = useCallback(async (showLoadingSpinner = true) => {
    if(showLoadingSpinner) setLoading(true);
    try {
      const res = await fetch(`/api/shades-signals/${gameId}`);
      if (res.ok) {
        const data = await res.json() as ApiResponse;
        setGame(data.game);
        if (data.game.status === 'lobby') {
          router.replace(`/shades-signals/${gameId}/begin`);
        }
      } else {
        const errorData = await res.json() as ApiErrorResponse;
        setError(errorData.message ?? "Game not found or failed to load.");
        setGame(null);
      }
    } catch (err) {
      console.error("Failed to fetch game data for gameplay page:", err);
      setError("An unexpected error occurred loading game details. Please try again.");
      setGame(null);
    }
    if(showLoadingSpinner) setLoading(false);
  }, [gameId, router]);

  useEffect(() => {
    void fetchGameData();
  }, [fetchGameData]);

  const handleSubmitClue = async () => {
    if (!currentClue.trim() || !game?.activeRound) return;
    if (game.activeRound.clueGiverId !== currentUserId) {
        setClueError("It's not your turn to give a clue, or you are not the clue giver.");
        return;
    }
    setActionLoading(true);
    setClueError(null);
    try {
        const res = await fetch(`/api/shades-signals/${gameId}/submit-clue`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ clueText: currentClue, clueGiverId: currentUserId }),
        });
        if (res.ok) {
            const updatedGame = await res.json() as ApiSubmitClueResponse;
            setGame(updatedGame);
            setCurrentClue("");
        } else {
            const errorData = await res.json() as ApiErrorResponse;
            setClueError(errorData.message ?? "Failed to submit clue. Please try again.");
        }
    } catch (err) {
        console.error("Error submitting clue:", err);
        setClueError("An unexpected client-side error occurred while submitting your clue.");
    }
    setActionLoading(false);
  };

  if (loading) return <div className="flex justify-center items-center h-screen text-xl">Loading game state...</div>;
  if (error && !game) return <div className="text-center mt-10 p-4 text-red-600 bg-red-100 border border-red-400 rounded">Error: {error}</div>;
  if (!game || game.status === 'lobby') {
    return <div className="text-center mt-10 text-lg">Verifying game status or redirecting...</div>;
  }

  if (game.status === 'active') {
    const isClueGiver = game.activeRound?.clueGiverId === currentUserId;

    // Third attempt to satisfy linter for clueGiverName
    const activeClueGiverId = game.activeRound?.clueGiverId;
    const clueGiverName = activeClueGiverId
                          ? (game.players.find(p => p.id === activeClueGiverId)?.name ?? activeClueGiverId)
                          : "Unknown";

    return (
      <main className="min-h-screen flex flex-col items-center p-4 md:p-8 bg-slate-100">
        <header className="w-full max-w-4xl mb-6 p-4 bg-white rounded-lg shadow-md flex justify-between items-center">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-sky-700">Shades & Signals</h1>
            <p className="text-sm text-slate-500">Game Code: <span className="font-mono text-sky-600">{game.code}</span></p>
          </div>
          <div className="text-right">
            <p className="text-lg font-semibold">Round: {game.currentRoundNumber} / {game.totalRounds}</p>
          </div>
        </header>

        {game.activeRound && (
          <section className="w-full max-w-4xl mb-6 p-4 bg-white rounded-lg shadow-md">
            <h2 className="text-xl font-semibold mb-2 text-slate-700">Current Round</h2>
            <p>Clue Giver: <span className="font-medium text-indigo-600">{clueGiverName}</span></p>
            {isClueGiver && (
                <p className="my-2 p-2 bg-yellow-100 text-yellow-700 border border-yellow-300 rounded-md">
                    You are the Clue Giver! Your Target Hex: <span className="font-mono p-1 bg-yellow-300 text-yellow-800 rounded">{game.activeRound.targetHex}</span>
                </p>
            )}
            {!isClueGiver && <p className="my-2 text-sm text-slate-600">Waiting for <span className="font-medium">{clueGiverName}</span> to submit a clue...</p>}
            <div className="mt-3 border-t pt-3">
              <h3 className="text-md font-semibold text-slate-600 mb-1">Clues Given This Round:</h3>
              {game.activeRound.cluesGiven.length > 0 ? (
                <ul className="list-disc list-inside pl-4 space-y-1 text-slate-700">
                  {game.activeRound.cluesGiven.map((clue, index) => (
                    <li key={`${clue.timestamp.toISOString()}-${index}`}><em>{clue.clueText}</em></li>
                  ))}
                </ul>
              ) : (
                <p className="text-slate-500 italic text-sm">No clues given yet.</p>
              )}
            </div>
          </section>
        )}
        {clueError && (
            <div className="w-full max-w-4xl mb-4 p-3 text-sm text-red-700 bg-red-100 border border-red-300 rounded-md">
                <strong>Clue Error:</strong> {clueError}
            </div>
        )}
        {isClueGiver && game.activeRound && (
          <section className="w-full max-w-4xl mb-6 p-4 bg-white rounded-lg shadow-md">
            <h3 className="text-lg font-semibold mb-2 text-slate-700">Give Your Clue:</h3>
            <textarea
                className="w-full p-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-sky-500 focus:border-sky-500 transition-colors disabled:bg-slate-50"
                rows={2}
                value={currentClue}
                onChange={(e) => setCurrentClue(e.target.value)}
                placeholder="Enter your one-word clue..."
                disabled={actionLoading}
            />
            <button
                type="button"
                onClick={handleSubmitClue}
                disabled={actionLoading || !currentClue.trim()}
                className="mt-3 px-5 py-2 bg-sky-500 text-white rounded-md hover:bg-sky-600 disabled:bg-slate-400 disabled:cursor-not-allowed transition-colors font-semibold">
                {actionLoading ? "Submitting..." : "Submit Clue"}
            </button>
          </section>
        )}
        <section className="w-full max-w-4xl h-auto md:h-[320px] mb-6 flex justify-center items-center bg-white p-3 rounded-lg shadow-md">
          <HexGrid
            width={580}
            height={300}
            showCoordinates={true}
            disabledCells={isClueGiver ? getAllCellIds() : []}
            onCellClick={(cellId: string, color: string) => { // Added types for cellId and color
                if (!isClueGiver) {
                    console.log(`Guesser selected cell: ${cellId}, color: ${color}`);
                } else {
                    console.log("Clue giver clicked on HexGrid (disabled action).");
                }
            }}
          />
        </section>
        <button
            type="button"
            onClick={() => router.push(`/shades-signals/${gameId}/results`)}
            className="mt-4 px-4 py-2 bg-amber-500 text-white rounded-md hover:bg-amber-600 transition-colors text-sm">
            (Dev) Go to Results Page
        </button>
      </main>
    );
  }

  if (game.status === 'finished') {
    router.replace(`/shades-signals/${gameId}/results`);
    return <div className="flex justify-center items-center h-screen text-xl">Game Over. Redirecting to results...</div>;
  }
  return <div className="text-center mt-10 p-4 text-orange-600 bg-orange-100 border border-orange-400 rounded">Unhandled game state: {game?.status ?? 'Unknown'}. Game code: {game?.code ?? 'N/A'}</div>;
}
