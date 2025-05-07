"use client";

import { useSessionInfo } from "../../../_components/session-modal";
import { useRouter } from "next/navigation";
import { useEffect, useState, useRef } from "react";
import React from "react";
import { Button } from "~/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "~/components/ui/dialog";
import HexGrid from "~/components/HexGrid";

interface ShadesSignalsGame {
  id: string;
  code: string;
  host_id: string;
  player_ids: string[];
  game_data?: {
    maxPlayers?: number;
    rounds?: number;
  };
  playerNames?: Record<string, string>;
}

interface ApiResponse {
  game: ShadesSignalsGame;
}

export default function ShadesSignalsBeginPage({ params }: { params: { id: string } }) {
  const { session, loading } = useSessionInfo();
  const router = useRouter();
  const [joining, setJoining] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");
  const [game, setGame] = useState<ShadesSignalsGame | null>(null);
  const [playerNames, setPlayerNames] = useState<string[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  // Modal for HexGrid Help
  const [showHexGridHelp, setShowHexGridHelp] = useState(false);

  // Demo HexGrid state for interactivity
  const [demoSelected, setDemoSelected] = useState<string | undefined>(undefined);
  const [demoTip, setDemoTip] = useState<string>("Click any color cell to see its coordinates!");

  function handleDemoCellClick(cell: string, color: string) {
    setDemoSelected(cell);
    setDemoTip(`You selected ${cell} (${color})! Try another cell.`);
  }

  // Responsive HexGrid orientation using ResizeObserver
  const [hexOrientation, setHexOrientation] = useState<"horizontal" | "vertical">("horizontal");
  const gridContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = gridContainerRef.current;
    if (!container) return;
    const observer = new window.ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        // Flip to vertical if width is less than 700px or height is much greater than width
        if (width < 700 || height > width * 1.1) {
          setHexOrientation("vertical");
        } else {
          setHexOrientation("horizontal");
        }
      }
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    async function fetchGame() {
      setRefreshing(true);
      setError("");
      try {
        const res = await fetch(`/api/shades-signals/${params.id}`);
        if (res.ok) {
          const data = await res.json() as ApiResponse;
          setGame(data.game);
          setPlayerNames(data.game?.playerNames ? Object.values(data.game.playerNames) : []);
        } else {
          setError("Game not found");
        }
      } catch {
        setError("Failed to load game");
      } finally {
        setRefreshing(false);
      }
    }
    void fetchGame();
    const interval = setInterval(() => { void fetchGame(); }, 3000);
    return () => clearInterval(interval);
  }, [params.id]);

  const isHost = session?.id && game?.host_id === session.id;
  const isPlayer = session?.id && game?.player_ids?.includes(session.id);

  async function handleJoin() {
    setJoining(true);
    setError("");
    try {
      if (!session?.id) {
        setError("No active session");
        return;
      }

      const res = await fetch(`/api/shades-signals/${params.id}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ player_id: session.id }),
      });
      if (res.ok) {
        await refreshGame();
      } else {
        setError("Failed to join game.");
      }
    } finally {
      setJoining(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    setError("");
    try {
      const res = await fetch(`/api/shades-signals/${params.id}/delete`, { method: "POST" });
      if (res.ok) {
        router.push("/");
      } else {
        setError("Failed to delete game.");
      }
    } finally {
      setDeleting(false);
    }
  }

  async function refreshGame() {
    setRefreshing(true);
    try {
      const res = await fetch(`/api/shades-signals/${params.id}`);
      if (res.ok) {
        const data = await res.json() as ApiResponse;
        setGame(data.game);
        setPlayerNames(data.game?.playerNames ? Object.values(data.game.playerNames) : []);
      }
    } finally {
      setRefreshing(false);
    }
  }

  if (loading) {
    return <main className="min-h-screen flex items-center justify-center bg-main text-main">
      <div className="flex flex-col items-center gap-4">
        <div className="animate-spin w-12 h-12 text-primary border-4 border-current border-t-transparent rounded-full" />
        <div className="text-lg text-secondary">Loading session...</div>
      </div>
    </main>;
  }

  if (!game) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-main text-main">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin w-12 h-12 text-primary border-4 border-current border-t-transparent rounded-full" />
          <div className={error ? "text-lg text-destructive" : "text-lg text-secondary"}>
            {error || "Loading game..."}
          </div>
        </div>
      </main>
    );
  }

  const canJoin = !isHost && !isPlayer && !joining && !loading;
  const canDelete = isHost && !deleting && !loading;

  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-main text-main p-4 py-8">
      <div className="bg-card border border-secondary rounded-xl shadow-lg p-8 w-full max-w-5xl flex flex-col items-center gap-6">
        {/* Center title and place button below */}
        <div className="w-full flex flex-col items-center gap-3 mb-6">
          <h1 className="text-3xl font-bold text-primary uppercase tracking-wide text-center">Shades & Signals Lobby</h1>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowHexGridHelp(true)}
            className="px-4 bg-secondary/20 hover:bg-secondary/30 text-primary"
          >
            HexGrid Help
          </Button>
        </div>

        {/* Join Code & Game Info */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full">
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
                  <span className="font-medium">Max Players:</span>
                  <span className="font-bold">{game.game_data?.maxPlayers ?? "?"}</span>
                </div>
                <div className="flex justify-between px-3 py-2 rounded bg-primary/10 border border-primary/30">
                  <span className="font-medium">Rounds:</span>
                  <span className="font-bold">{game.game_data?.rounds ?? "?"}</span>
                </div>
              </div>
            </div>

            {/* Controls */}
            <div className="flex flex-col w-full gap-2">
              {isHost && (
                <Button
                  onClick={() => setShowDeleteDialog(true)}
                  disabled={!canDelete}
                  variant="destructive"
                  className="w-full"
                >
                  {deleting ? "Deleting..." : "Delete Game"}
                </Button>
              )}
              {canJoin && (
                <Button
                  onClick={handleJoin}
                  disabled={!canJoin}
                  className="w-full"
                >
                  {joining ? "Joining..." : "Join Game"}
                </Button>
              )}
              {!isHost && !isPlayer && !canJoin && !loading && session && (
                <Button
                  onClick={handleJoin}
                  disabled={joining}
                  className="w-full"
                >
                  {joining ? "Joining..." : "Join Game"}
                </Button>
              )}
              {error && <div className="text-destructive text-center mt-2">{error}</div>}
            </div>
            <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Delete Game</DialogTitle>
                  <DialogDescription>
                    Are you sure you want to delete this game? This cannot be undone.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>
                    Cancel
                  </Button>
                  <Button variant="destructive" onClick={() => { setShowDeleteDialog(false); void handleDelete(); }}>
                    Delete Game
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          {/* Players List */}
          <div className="bg-secondary/10 rounded-lg p-4 border border-secondary/30">
            <h2 className="text-xl font-bold text-primary border-b border-primary/30 pb-2 mb-4">Players</h2>
            <div className="w-full flex flex-col gap-1">
              {game.player_ids.length === 0 ? (
                <div className="text-secondary bg-secondary/10 p-4 rounded-lg text-center">
                  No players yet.
                </div>
              ) : (
                <ul className="space-y-2">
                  {game.player_ids.map((id, i) => (
                    <li key={id} className="px-3 py-2 rounded bg-primary/10 border border-primary/30 font-medium">
                      {id === game.host_id ? "Host" : `Player ${i + 1}`}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {game.player_ids.length > 0 && (
              <div className="text-sm text-center mt-4 text-secondary">
                {game.player_ids.length} {game.player_ids.length === 1 ? "player" : "players"} in lobby
              </div>
            )}
          </div>
        </div>
        {/* HexGrid Help Modal - Adjusted for better fit and scrolling */}
        <Dialog open={showHexGridHelp} onOpenChange={setShowHexGridHelp}>
          <DialogContent className="max-w-2xl w-full p-6 mx-auto rounded-xl bg-card border border-primary/20 shadow-xl flex flex-col items-center max-h-[85vh] overflow-y-auto overflow-x-hidden">
            <DialogHeader className="mb-4 w-full">
              <DialogTitle className="text-2xl font-bold text-center text-primary">What is the Hex Grid?</DialogTitle>
              <DialogDescription className="text-center text-secondary mt-2">
                The Hex Grid is the centerpiece of <span className="text-primary font-medium">Shades & Signals</span>.
                Each cell represents a unique color identified by its coordinates.
              </DialogDescription>
            </DialogHeader>

            {/* Container for the HexGrid, now tightly wrapping it with shadow */}
            <div className="my-4 shadow-lg rounded-lg">
              <HexGrid
                width={600}
                height={240}
                selectedCell={demoSelected}
                onCellClick={handleDemoCellClick}
              />
            </div>

            <div className="my-3 w-full max-w-[600px] px-5 py-3 bg-primary/10 rounded-lg text-primary text-center">
              {demoTip || "Click any color cell to see its coordinates!"}
            </div>

            <div className="w-full max-w-[600px] bg-secondary/10 p-5 rounded-lg mt-3">
              <h3 className="text-primary font-semibold text-lg mb-3 text-center">How to Play:</h3>
              <ul className="space-y-3 text-secondary">
                <li className="flex items-start gap-3">
                  <span className="text-primary text-lg">•</span>
                  <span>The clue giver is assigned a secret color and gives one-word clues.</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-primary text-lg">•</span>
                  <span>Guessers click a cell to guess the color.</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-primary text-lg">•</span>
                  <span>First player to select the correct color wins the round!</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-primary text-lg">•</span>
                  <span>The game is played over multiple rounds with players taking turns as the clue giver.</span>
                </li>
              </ul>
            </div>

            <div className="flex w-full justify-center mt-5">
              <Button
                onClick={() => setShowHexGridHelp(false)}
                className="px-10 py-2 text-base font-medium rounded-lg bg-primary hover:bg-primary/90 text-white"
              >
                Close
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </main>
  );
}
