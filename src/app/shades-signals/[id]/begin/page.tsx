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
  game_data?: any;
  [key: string]: any;
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
          const data = await res.json();
          setGame(data.game as ShadesSignalsGame);
          setPlayerNames(data.game.playerNames ? Object.values(data.game.playerNames) : []);
        } else {
          setError("Game not found");
        }
      } catch {
        setError("Failed to load game");
      } finally {
        setRefreshing(false);
      }
    }
    fetchGame();
    const interval = setInterval(fetchGame, 3000);
    return () => clearInterval(interval);
  }, [params.id]);

  const isHost = session?.id && game?.host_id === session.id;
  const isPlayer = session?.id && game?.player_ids?.includes(session.id);

  async function handleJoin() {
    setJoining(true);
    setError("");
    try {
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
        const data = await res.json();
        setGame(data.game as ShadesSignalsGame);
        setPlayerNames(data.game.playerNames ? Object.values(data.game.playerNames) : []);
      }
    } finally {
      setRefreshing(false);
    }
  }

  if (loading) {
    return <main className="min-h-screen flex items-center justify-center bg-main text-main">
      <div className="flex flex-col items-center gap-4">
        <div className="animate-spin w-12 h-12 text-primary border-4 border-current border-t-transparent rounded-full"></div>
        <div className="text-lg text-secondary">Loading session...</div>
      </div>
    </main>;
  }

  if (!game) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-main text-main">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin w-12 h-12 text-primary border-4 border-current border-t-transparent rounded-full"></div>
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
        <h1 className="text-3xl font-bold text-primary text-center uppercase tracking-wide mb-6">Shades & Signals Lobby</h1>
        {/* Add HexGrid Help button at the top right of the lobby card */}
        <div className="w-full flex justify-end mb-2">
          <Button variant="outline" size="sm" onClick={() => setShowHexGridHelp(true)}>
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
                  <span className="font-bold">{game.game_data?.maxPlayers || "?"}</span>
                </div>
                <div className="flex justify-between px-3 py-2 rounded bg-primary/10 border border-primary/30">
                  <span className="font-medium">Rounds:</span>
                  <span className="font-bold">{game.game_data?.rounds || "?"}</span>
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
              {!isHost && !isPlayer && !canJoin && !loading && (
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
                  <Button variant="destructive" onClick={() => { setShowDeleteDialog(false); handleDelete(); }}>
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
        {/* HexGrid Help Modal */}
        <Dialog open={showHexGridHelp} onOpenChange={setShowHexGridHelp}>
          <DialogContent className="max-w-md sm:max-w-lg w-full p-6 rounded-xl bg-[#171717] border-[#333]">
            <DialogHeader className="mb-4">
              <DialogTitle className="text-2xl font-bold text-center text-white">What is the Hex Grid?</DialogTitle>
              <DialogDescription className="text-sm text-center text-gray-300">
                The Hex Grid is the centerpiece of <span className="text-primary">Shades & Signals</span>. Each cell is a unique color, identified by its coordinates.
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-col items-center w-full">
              {/* Larger grid that fills more of the modal width */}
              <div className="w-full flex justify-center my-3">
                <HexGrid
                  width={380}
                  height={240}
                  selectedCell={demoSelected}
                  onCellClick={handleDemoCellClick}
                />
              </div>

              <div className="my-3 text-sm text-[#67b1e7] text-center">{demoTip}</div>

              <div className="w-full text-sm text-gray-400 space-y-1">
                <p>• The clue giver is assigned a secret color and gives one-word clues.</p>
                <p>• Guessers click a cell to guess the color.</p>
                <p>• First player to select the correct color wins the round!</p>
              </div>
            </div>

            <div className="flex w-full justify-center mt-4">
              <Button
                onClick={() => setShowHexGridHelp(false)}
                className="px-8 py-2 text-sm font-medium rounded-lg bg-[#333] hover:bg-[#444] text-white border-none"
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
