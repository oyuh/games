"use client";

import React, { useEffect, useState } from "react";
import { useSessionInfo } from "~/app/_components/session-modal";
import { useRouter } from "next/navigation";
import { Button } from "~/components/ui/button";

export default function PasswordNextRoundPage({ params }: { params: Promise<{ id: string }> }) {
  const actualParams = React.use(params);
  const { session } = useSessionInfo();
  const router = useRouter();
  const [game, setGame] = useState<any>(null);
  const [ready, setReady] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Poll for game state
  useEffect(() => {
    let cancelled = false;
    async function fetchGame() {
      try {
        const res = await fetch(`/api/password/team-select?gameId=${actualParams.id}`);
        if (res.ok) {
          const data = await res.json();
          setGame({ id: actualParams.id, ...data });
        }
      } catch {}
    }
    fetchGame();
    const interval = setInterval(fetchGame, 1000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [actualParams.id]);

  // On mount, always mark this player as having seen the ready phase
  useEffect(() => {
    if (!game || !session?.id) return;
    // Always POST to /api/password/ready to mark readySeen, even if not pressing the button
    fetch("/api/password/ready", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gameId: game.id, playerId: session.id }),
    });
  }, [game, session?.id]);

  // Redirect to in-game page when phase advances
  useEffect(() => {
    if (!game) return;
    const phase = game?.game_data?.phase;
    if (phase === "category-pick" || phase === "round" || phase === "recap") {
      router.replace(`/password/${actualParams.id}`);
    }
  }, [game, actualParams.id, router]);

  if (!game || !session?.id) {
    return <main className="min-h-screen flex items-center justify-center text-main">Loading...</main>;
  }

  const teams = game.teams || [];
  const allPlayers = teams.flatMap((t: any) => t.players);
  const readyMap = game.game_data?.ready || {};

  async function handleReady() {
    setSubmitting(true);
    try {
      await fetch("/api/password/ready", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gameId: game.id, playerId: session.id }),
      });
      setReady(true);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-main text-main p-4">
      <div className="bg-card border border-secondary rounded-xl shadow-lg p-8 w-full max-w-lg flex flex-col items-center gap-4">
        <h1 className="text-3xl font-bold text-primary text-center uppercase tracking-wide">Next Round</h1>
        <div className="text-lg text-center text-main mb-2">Press Ready when you are ready to start the next round.</div>
        <Button
          className="w-full text-lg"
          onClick={handleReady}
          disabled={ready || submitting}
        >
          {ready ? "Ready!" : submitting ? "Submitting..." : "I'm Ready"}
        </Button>
        <div className="w-full flex flex-col items-center gap-2 mt-4">
          <div className="text-lg font-semibold text-primary">Players Ready:</div>
          <ul className="w-full flex flex-col gap-1 items-center">
            {allPlayers.map((p: any) => (
              <li key={p.id} className={`rounded px-3 py-1 w-full text-center text-base font-semibold ${readyMap[p.id] ? "bg-green-400/80 text-black" : "bg-secondary/30 text-secondary"}`}>{p.name}{p.id === session.id && " (You)"} {readyMap[p.id] ? "✅" : ""}</li>
            ))}
          </ul>
        </div>
      </div>
    </main>
  );
}
