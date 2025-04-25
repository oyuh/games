"use client";

import { useSessionInfo } from "../../../_components/session-modal";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import React from "react";
import { Button } from "~/components/ui/button";

interface PasswordGame {
  id: string;
  code: string;
  host_id: string;
  max_players: number;
  game_data: any;
  team_data: any;
  [key: string]: any;
}

export default function PasswordBeginPage({ params }: { params: Promise<{ id: string }> }) {
  const actualParams = React.use(params);
  const { session, loading } = useSessionInfo();
  const router = useRouter();
  const [game, setGame] = useState<PasswordGame | null>(null);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [starting, setStarting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [joining, setJoining] = useState(false);

  // Fetch game and player/team info
  useEffect(() => {
    async function fetchGame() {
      setRefreshing(true);
      setError("");
      try {
        const res = await fetch(`/api/password/team-select?gameId=${actualParams.id}`);
        if (res.ok) {
          const data = await res.json();
          setGame({ id: actualParams.id, ...data });
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
    const interval = setInterval(() => { void fetchGame(); }, 1000); // 1 second polling
    return () => clearInterval(interval);
  }, [actualParams.id]);

  // Redirect to appropriate page based on game phase
  useEffect(() => {
    if (!game) return;
    const phase = game?.game_data?.phase;
    // If phase is 'ready', go to the ready screen
    if (phase === "ready" && !window.location.pathname.endsWith(`/password/${actualParams.id}/next-round`)) {
      router.replace(`/password/${actualParams.id}/next-round`);
      return;
    }
    // If phase is not 'lobby' or 'ready', go to the main in-game page
    if (phase && phase !== "lobby" && phase !== "ready" && !window.location.pathname.endsWith(`/password/${actualParams.id}`)) {
      router.replace(`/password/${actualParams.id}`);
    }
  }, [game, actualParams.id, router]);

  const isHost = session?.id && game?.hostId === session.id;
  const isPlayer = session?.id && game?.players?.some((p: any) => p.id === session.id);

  async function handleJoin() {
    setJoining(true);
    setError("");
    try {
      const res = await fetch(`/api/password/team-select`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gameId: actualParams.id, playerId: session?.id }),
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

  async function handleJoinTeam(teamId: number) {
    setJoining(true);
    setError("");
    try {
      const res = await fetch(`/api/password/team-select`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gameId: actualParams.id, playerId: session?.id, playerName: session?.entered_name, teamId }),
      });
      if (res.ok) {
        await refreshGame();
      } else {
        setError("Failed to join team.");
      }
    } finally {
      setJoining(false);
    }
  }

  async function handleLeaveTeam(teamId: number) {
    setJoining(true);
    setError("");
    try {
      const res = await fetch(`/api/password/team-select`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gameId: actualParams.id, playerId: session?.id, leaveTeam: true }),
      });
      if (res.ok) {
        await refreshGame();
      } else {
        setError("Failed to leave team.");
      }
    } finally {
      setJoining(false);
    }
  }

  async function handleDelete() {
    // Not implemented yet
    alert("Delete game not implemented");
  }

  async function handleStart() {
    setStarting(true);
    setError("");
    try {
      const res = await fetch(`/api/password/next-round`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gameId: actualParams.id }),
      });
      if (!res.ok) setError("Failed to start game.");
    } finally {
      setStarting(false);
    }
  }

  async function refreshGame() {
    setRefreshing(true);
    try {
      const res = await fetch(`/api/password/team-select?gameId=${actualParams.id}`);
      if (res.ok) {
        const data = await res.json();
        setGame({ id: actualParams.id, ...data });
      }
    } finally {
      setRefreshing(false);
    }
  }

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";

  if (loading) {
    return <main className="min-h-screen flex items-center justify-center text-main">Loading session...</main>;
  }

  if (!game) {
    return <main className="min-h-screen flex items-center justify-center text-main">{error || "Loading..."}</main>;
  }

  const canJoin = !isHost && !isPlayer && !joining && !loading;
  const canStart = isHost && !starting && !loading;
  const canDelete = isHost && !deleting && !loading;

  const teams = game.teams || [];
  const allPlayers = game.players || [];

  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-main text-main p-4">
      <div className="bg-card border border-secondary rounded-xl shadow-lg p-8 w-full max-w-lg flex flex-col items-center gap-4">
        <h1 className="text-3xl font-bold text-primary text-center uppercase tracking-wide">Password Game Lobby</h1>
        {/* --- JOIN CODE PROMINENT --- */}
        <div className="flex flex-col items-center my-4 w-full">
          <div className="text-lg font-semibold text-primary text-center mb-1">Join Code</div>
          <div className="bg-white text-primary font-mono text-4xl tracking-widest rounded-lg px-10 py-5 mb-2 select-all shadow-lg border-4 border-primary text-center w-full font-extrabold" style={{letterSpacing: '0.25em'}}>
            {game.code || <span className="text-secondary">(not available)</span>}
          </div>
          <div className="text-xs text-secondary text-center mb-2">Share this code with friends to join!</div>
        </div>
        <div className="text-secondary text-center">Max Players: <span className="font-bold text-main">{game.max_players}</span></div>
        <div className="w-full flex flex-col items-center gap-2 mt-4">
          <div className="text-lg font-semibold text-primary">Players Joined:</div>
          <ul className="w-full flex flex-col gap-1 items-center">
            {allPlayers.length === 0 ? (
              <li className="text-secondary">No players yet.</li>
            ) : (
              allPlayers.map((p: any, i: number) => (
                <li key={i} className="bg-primary/90 text-black font-bold rounded px-3 py-1 w-full text-center shadow-md border border-primary/60 text-lg">{p.name}{p.id === session?.id && " (You)"}</li>
              ))
            )}
          </ul>
          <div className="text-xs text-secondary mt-1">{allPlayers.length} / {game.max_players} players</div>
        </div>
        {/* --- TEAM SELECTION UI --- */}
        <div className="w-full flex flex-col items-center gap-2 mt-4">
          <div className="text-lg font-semibold text-primary">Teams</div>
          <div className="flex flex-wrap gap-6 justify-center w-full">
            {teams.map((team: any) => (
              <div key={team.id} className="bg-main border border-secondary rounded-lg p-6 min-w-[200px] min-h-[180px] flex flex-col items-center shadow-md transition-all duration-200">
                <div className="font-bold text-primary mb-3 text-lg">{team.name}</div>
                <ul className="mb-3">
                  {team.players.map((p: any) => (
                    <li key={p.id} className="bg-primary/80 text-black font-semibold rounded px-2 py-1 mb-1 text-base shadow border border-primary/40 text-center">{p.name}{p.id === session?.id && " (You)"}</li>
                  ))}
                </ul>
                {team.players.length < 2 && !team.players.some((p: any) => p.id === session?.id) && (
                  <Button size="sm" className="w-full" onClick={() => handleJoinTeam(team.id)}>
                    Join
                  </Button>
                )}
                {team.players.some((p: any) => p.id === session?.id) && (
                  <Button size="sm" className="w-full mt-2" variant="secondary" onClick={() => handleLeaveTeam(team.id)}>
                    Leave
                  </Button>
                )}
              </div>
            ))}
          </div>
        </div>
        {/* --- INVITE LINK, LESS PROMINENT --- */}
        <details className="w-full mt-2">
          <summary className="cursor-pointer text-sm text-secondary hover:text-primary">Show invite link</summary>
          <div className="bg-secondary text-main rounded px-4 py-2 font-mono text-sm select-all break-all w-full text-center mt-2">
            {`${baseUrl}/password/${game.id}/begin`}
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
