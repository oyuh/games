"use client";

import { useSessionInfo } from "../../../_components/session-modal";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import React from "react";

export default function ImposterBeginPage({ params }: { params: Promise<{ id: string }> }) {
  const actualParams = React.use(params);
  const { session, loading } = useSessionInfo();
  const router = useRouter();
  const [joining, setJoining] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");
  const [game, setGame] = useState<any>(null);
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
          setGame(data.game);
          // playerNames now comes from data.game.playerNames (object mapping)
          setPlayerNames(Object.values(data.game.playerNames || {}));
        } else {
          setError("Game not found");
        }
      } catch (e) {
        setError("Failed to load game");
      } finally {
        setRefreshing(false);
      }
    }
    fetchGame();
    // Optionally, poll for updates every few seconds
    const interval = setInterval(fetchGame, 3000);
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
        setGame(data.game);
        setPlayerNames(Object.values(data.game.playerNames || {}));
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
        <div className="w-full flex flex-col items-center gap-2 mt-6">
          <div className="text-center text-main text-base">Share this link to invite others:</div>
          <div className="bg-secondary text-main rounded px-4 py-2 font-mono text-sm select-all break-all w-full text-center">
            {`${baseUrl}/imposter/${game.id}/begin`}
          </div>
          {isHost && (
            <>
              <button type="button" onClick={handleStart} disabled={!canStart} className="btn-primary w-full mt-2">
                {starting ? "Starting..." : "Start Game"}
              </button>
              <button type="button" onClick={handleDelete} disabled={!canDelete} className="btn-destructive w-full mt-2">
                {deleting ? "Deleting..." : "Delete Game"}
              </button>
            </>
          )}
          {canJoin && (
            <button type="button" onClick={handleJoin} disabled={!canJoin} className="btn-primary w-full mt-2">
              {joining ? "Joining..." : "Join Game"}
            </button>
          )}
          {/* Fallback: If user is not recognized, show join button */}
          {!isHost && !isPlayer && !canJoin && !loading && (
            <button type="button" onClick={handleJoin} disabled={joining} className="btn-primary w-full mt-2">
              {joining ? "Joining..." : "Join Game"}
            </button>
          )}
          {error && <div className="text-destructive text-center mt-2">{error}</div>}
        </div>
      </div>
    </main>
  );
}
