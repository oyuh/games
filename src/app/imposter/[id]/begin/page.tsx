"use client";

import { useSessionInfo } from "../../../_components/session-modal";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import React from "react";
import { Button } from "~/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "~/components/ui/dialog";

// Define a type for the game object for type safety
interface ImposterGame {
  id: string;
  code: string;
  host_id: string;
  category: string;
  max_players: number;
  num_imposters: number;
  player_ids: string[];
  imposter_ids?: string[];
  playerNames?: Record<string, string>;
  [key: string]: any;
}

export default function ImposterBeginPage({ params }: { params: Promise<{ id: string }> }) {
  const actualParams = React.use(params);
  const { session, loading } = useSessionInfo();
  const router = useRouter();
  const [joining, setJoining] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");
  const [game, setGame] = useState<ImposterGame | null>(null);
  const [playerNames, setPlayerNames] = useState<string[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  // Fetch game and player names from API
  useEffect(() => {
    async function fetchGame() {
      setRefreshing(true);
      setError("");
      try {
        const res = await fetch(`/api/imposter/${actualParams.id}`);
        if (res.ok) {
          const data = await res.json();
          setGame(data.game as ImposterGame);
          setPlayerNames(Object.values((data.game.playerNames ?? {})));
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
  }, [actualParams.id]);

  // Redirect to in-game page if game has started (even if already on in-game page)
  useEffect(() => {
    if (game && game.imposter_ids && game.chosen_word) {
      if (window.location.pathname !== `/imposter/${actualParams.id}`) {
        router.replace(`/imposter/${actualParams.id}`);
      }
    }
  }, [game, actualParams.id, router]);

  const isHost = session?.id && game?.host_id === session.id;
  const isPlayer = session?.id && game?.player_ids?.includes(session.id);

  async function handleJoin() {
    setJoining(true);
    setError("");
    try {
      const res = await fetch(`/api/imposter/${actualParams.id}`, { method: "POST" });
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
      const res = await fetch(`/api/imposter/${actualParams.id}`, { method: "DELETE" });
      if (res.ok) {
        router.push("/");
      } else {
        setError("Failed to delete game.");
      }
    } finally {
      setDeleting(false);
    }
  }

  async function handleStart() {
    setStarting(true);
    setError("");
    try {
      const res = await fetch(`/api/imposter/${actualParams.id}/start`, { method: "POST" });
      if (res.ok) {
        router.push(`/imposter/${actualParams.id}`);
      } else {
        setError("Failed to start game.");
      }
    } finally {
      setStarting(false);
    }
  }

  async function refreshGame() {
    setRefreshing(true);
    try {
      const res = await fetch(`/api/imposter/${actualParams.id}`);
      if (res.ok) {
        const data = await res.json();
        setGame(data.game as ImposterGame);
        setPlayerNames(Object.values((data.game.playerNames ?? {})));
      }
    } finally {
      setRefreshing(false);
    }
  }

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";

  // Wait for session to load before rendering lobby
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

  // Determine eligibility
  const canJoin = !isHost && !isPlayer && !joining && !loading;
  const canStart = isHost && !starting && !loading;
  const canDelete = isHost && !deleting && !loading;

  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-main text-main p-4 py-8">
      <div className="bg-card border border-secondary rounded-xl shadow-lg p-8 w-full max-w-5xl flex flex-col items-center gap-6">
        <h1 className="text-3xl font-bold text-primary text-center uppercase tracking-wide mb-6">Imposter Game Lobby</h1>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full">
          {/* Join Code & Game Info */}
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
                  <span className="font-medium">Category:</span>
                  <span className="font-bold">{game.category}</span>
                </div>
                <div className="flex justify-between px-3 py-2 rounded bg-primary/10 border border-primary/30">
                  <span className="font-medium">Max Players:</span>
                  <span className="font-bold">{game.max_players}</span>
                </div>
                <div className="flex justify-between px-3 py-2 rounded bg-primary/10 border border-primary/30">
                  <span className="font-medium">Imposters:</span>
                  <span className="font-bold">{game.num_imposters}</span>
                </div>
              </div>
            </div>

            {/* Controls */}
            <div className="flex flex-col w-full gap-2">
              {isHost && (
                <>
                  <Button
                    onClick={handleStart}
                    disabled={!canStart || playerNames.length < 3}
                    className="w-full"
                  >
                    {starting ? "Starting..." : (playerNames.length < 3 ? "Need at least 3 players" : "Start Game")}
                  </Button>
                  <Button
                    onClick={() => setShowDeleteDialog(true)}
                    disabled={!canDelete}
                    variant="destructive"
                    className="w-full"
                  >
                    {deleting ? "Deleting..." : "Delete Game"}
                  </Button>
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
                </>
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
              {/* Fallback: If user is not recognized, show join button */}
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
          </div>

          {/* Players List */}
          <div className="bg-secondary/10 rounded-lg p-4 border border-secondary/30">
            <h2 className="text-xl font-bold text-primary border-b border-primary/30 pb-2 mb-4">Players</h2>
            <div className="w-full flex flex-col gap-1">
              {playerNames.length === 0 ? (
                <div className="text-secondary bg-secondary/10 p-4 rounded-lg text-center">
                  No players yet.
                </div>
              ) : (
                <ul className="space-y-2">
                  {playerNames.map((name, i) => (
                    <li key={i} className="px-3 py-2 rounded bg-primary/10 border border-primary/30 font-medium">
                      {name} {game.host_id === Object.keys(game.playerNames || {})[i] &&
                        <span className="ml-2 text-xs px-1.5 py-0.5 bg-secondary/20 rounded text-secondary">Host</span>
                      }
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {playerNames.length > 0 && (
              <div className="text-sm text-center mt-4 text-secondary">
                {playerNames.length} {playerNames.length === 1 ? "player" : "players"} in lobby
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
