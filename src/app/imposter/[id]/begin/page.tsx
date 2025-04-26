"use client";

import { useSessionInfo } from "../../../_components/session-modal";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import React from "react";
import { Button } from "~/components/ui/button"; // Import the Button component

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
    if (!confirm("Are you sure you want to delete this game?")) return;
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
    return <main className="min-h-screen flex items-center justify-center text-main">Loading session...</main>;
  }

  if (!game) {
    return <main className="min-h-screen flex items-center justify-center text-main">{error || "Loading..."}</main>;
  }

  // Determine eligibility
  const canJoin = !isHost && !isPlayer && !joining && !loading;
  const canStart = isHost && !starting && !loading;
  const canDelete = isHost && !deleting && !loading;

  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-main text-main p-4">
      <div className="bg-card border border-secondary rounded-xl shadow-lg p-8 w-full max-w-lg flex flex-col items-center gap-4">
        <h1 className="text-3xl font-bold text-primary text-center uppercase tracking-wide">Imposter Game Lobby</h1>
        {/* --- JOIN CODE PROMINENT --- */}
        <div className="flex flex-col items-center my-4 w-full">
          <div className="text-lg font-semibold text-primary text-center mb-1">Join Code</div>
          <div className="bg-white text-primary font-mono text-4xl tracking-widest rounded-lg px-10 py-5 mb-2 select-all shadow-lg border-4 border-primary text-center w-full font-extrabold" style={{letterSpacing: '0.25em'}}>
            {game.code || <span className="text-secondary">(not available)</span>}
          </div>
          <div className="text-xs text-secondary text-center mb-2">Share this code with friends to join!</div>
        </div>
        {/* --- END JOIN CODE --- */}
        <div className="text-secondary text-center text-lg">Category: <span className="font-bold text-main">{game.category}</span></div>
        <div className="text-secondary text-center">Max Players: <span className="font-bold text-main">{game.max_players}</span></div>
        <div className="text-secondary text-center">Imposters: <span className="font-bold text-main">{game.num_imposters}</span></div>
        <div className="w-full flex flex-col items-center gap-2 mt-4">
          <div className="text-lg font-semibold text-primary">Players Joined:</div>
          <ul className="w-full flex flex-col gap-1 items-center">
            {playerNames.length === 0 ? (
              <li className="text-secondary">No players yet.</li>
            ) : (
              playerNames.map((name, i) => (
                <li key={i} className="text-main bg-main/40 rounded px-3 py-1 w-full text-center">{name}</li>
              ))
            )}
          </ul>
        </div>
        {/* --- INVITE LINK, LESS PROMINENT --- */}
        <details className="w-full mt-2">
          <summary className="cursor-pointer text-sm text-secondary hover:text-primary">Show invite link</summary>
          <div className="bg-secondary text-main rounded px-4 py-2 font-mono text-sm select-all break-all w-full text-center mt-2">
            {`${baseUrl}/api/imposter/join-by-code/${game.code}`}
          </div>
        </details>
        {isHost && (
          <>
            <Button
              onClick={handleStart}
              disabled={!canStart}
              className="w-full mt-2"
            >
              {starting ? "Starting..." : "Start Game"}
            </Button>
            <Button
              onClick={handleDelete}
              disabled={!canDelete}
              variant="destructive"
              className="w-full mt-2"
            >
              {deleting ? "Deleting..." : "Delete Game"}
            </Button>
          </>
        )}
        {canJoin && (
          <Button
            onClick={handleJoin}
            disabled={!canJoin}
            className="w-full mt-2"
          >
            {joining ? "Joining..." : "Join Game"}
          </Button>
        )}
        {/* Fallback: If user is not recognized, show join button */}
        {!isHost && !isPlayer && !canJoin && !loading && (
          <Button
            onClick={handleJoin}
            disabled={joining}
            className="w-full mt-2"
          >
            {joining ? "Joining..." : "Join Game"}
          </Button>
        )}
        {error && <div className="text-destructive text-center mt-2">{error}</div>}
      </div>
    </main>
  );
}
