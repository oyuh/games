"use client";

import React, { useState, useEffect } from "react";
import { useSessionInfo } from "../../_components/session-modal";
import { useRouter } from "next/navigation";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { imposterCategories } from "~/data/categoryList";

export default function PasswordGamePage({ params }: { params: Promise<{ id: string }> }) {
  const actualParams = React.use(params);
  const { session } = useSessionInfo();
  const router = useRouter();
  const [game, setGame] = useState<any>(null);
  const [guess, setGuess] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [category, setCategory] = useState("");
  const [categorySubmitting, setCategorySubmitting] = useState(false);

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
    const interval = setInterval(fetchGame, 2000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [actualParams.id]);

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

  if (!game || !session?.id) {
    return <main className="min-h-screen flex items-center justify-center text-main">Loading...</main>;
  }

  // Find player's team and role
  const teams = game.teams || [];
  const playerTeam = teams.find((t: any) => t.players.some((p: any) => p.id === session.id));
  const isLeader = playerTeam && playerTeam.leaderId === session.id;
  const isClueGiver = playerTeam && playerTeam.clueGiverId === session.id;
  const isGuesser = playerTeam && !isClueGiver;
  const isGameFinished = game.game_data?.state === "finished";
  const winnerTeamId = game.game_data?.winner;
  const phase = game.game_data?.phase;

  // Find recap info if in recap phase
  const isRecap = phase === "recap";
  const lastRecap = game.game_data?.history?.[game.game_data.history.length - 1];

  // Show secret word to clue-giver only
  const secretWord = isClueGiver && phase === "round" ? game.round_data?.secretWord : null;
  const roundCategory = game.round_data?.category;
  const guesses = game.round_data?.guesses?.[playerTeam?.id] || [];
  const roundPoints = playerTeam?.roundPoints || 0;
  const teamScore = playerTeam?.score || 0;

  // Category pick handler
  async function handleCategoryPick(e: React.FormEvent) {
    e.preventDefault();
    setCategorySubmitting(true);
    setError("");
    try {
      // Save category to round_data and trigger round start
      const res = await fetch("/api/password/category-pick", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gameId: game.id, teamId: playerTeam.id, category }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to pick category");
      } else {
        setCategory("");
      }
    } finally {
      setCategorySubmitting(false);
    }
  }

  // Guess handler
  async function handleGuessSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/password/guess", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gameId: game.id, playerId: session.id, guess }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to submit guess");
      } else {
        setGuess("");
      }
    } finally {
      setSubmitting(false);
    }
  }

  // Category options
  const categoryOptions = Object.keys(imposterCategories);

  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-main text-main p-4">
      <div className="bg-card border border-secondary rounded-xl shadow-lg p-8 w-full max-w-lg flex flex-col items-center gap-4">
        <h1 className="text-3xl font-bold text-primary text-center uppercase tracking-wide">Password Game</h1>
        {isGameFinished ? (
          <div className="text-2xl font-bold text-green-500 text-center">Game Over! Winner: Team {winnerTeamId}</div>
        ) : isRecap && lastRecap ? (
          <div className="w-full flex flex-col items-center gap-4">
            <div className="text-2xl font-bold text-primary text-center">Round {lastRecap.round} Recap</div>
            <div className="text-lg text-main text-center">Secret Word: <span className="font-bold">{lastRecap.secretWord}</span></div>
            <div className="text-main text-center">Winner: <span className="font-bold">{Array.isArray(lastRecap.winner) ? lastRecap.winner.join(', ') : lastRecap.winner}</span></div>
            <div className="w-full flex flex-col gap-2 mt-2">
              {lastRecap.teams.map((team: any) => (
                <div key={team.id} className="bg-main/20 border border-secondary rounded p-3 mb-2">
                  <div className="font-bold text-primary mb-1">Team {team.id}</div>
                  <div className="text-main text-sm mb-1">Clue Giver: {team.players.find((p: any) => p.id === team.clueGiverId)?.name || team.clueGiverId}</div>
                  <div className="text-main text-sm mb-1">Points this round: {team.roundPoints}</div>
                  <div className="text-main text-sm mb-1">Total Score: {team.score}</div>
                  <div className="text-main text-sm">Players: {team.players.map((p: any) => p.name).join(", ")}</div>
                </div>
              ))}
            </div>
            <div className="w-full flex flex-col gap-2 mt-2">
              <div className="font-bold text-primary">Guesses:</div>
              {Object.entries(lastRecap.guesses || {}).map(([teamId, guesses]: any) => (
                <div key={teamId} className="text-main text-sm mb-1">Team {teamId}: {guesses.join(", ") || "No guesses"}</div>
              ))}
            </div>
            {isHost && (
              <Button className="w-full mt-4" onClick={async () => {
                await fetch("/api/password/next-round", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ gameId: game.id }),
                });
              }}>
                Start Next Round
              </Button>
            )}
            {!isHost && <div className="text-secondary text-center mt-2">Waiting for host to start the next round...</div>}
          </div>
        ) : phase === "category-pick" ? (
          <>
            <div className="text-lg font-semibold text-primary">Category Selection</div>
            {isLeader ? (
              <form onSubmit={handleCategoryPick} className="flex flex-col items-center gap-2 w-full">
                <select
                  value={category}
                  onChange={e => setCategory(e.target.value)}
                  className="w-full px-3 py-2 rounded border border-secondary bg-main text-main text-center"
                  required
                  disabled={categorySubmitting}
                >
                  <option value="" disabled>Select a category</option>
                  {categoryOptions.map(opt => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
                <Button type="submit" className="w-full" disabled={categorySubmitting || !category}>
                  {categorySubmitting ? "Submitting..." : "Pick Category"}
                </Button>
                {error && <div className="text-destructive text-center mt-2">{error}</div>}
              </form>
            ) : (
              <div className="text-main text-center">Waiting for your team leader to pick a category...</div>
            )}
          </>
        ) : phase === "round" ? (
          <>
            <div className="text-lg font-semibold text-primary">Round {game.round_data?.round}</div>
            <div className="text-main text-base mb-2">Category: <span className="font-bold">{roundCategory}</span></div>
            {isClueGiver ? (
              <div className="bg-primary/90 text-black font-bold rounded px-4 py-2 text-center text-2xl shadow border border-primary/60">
                Secret Word: {secretWord}
                <div className="text-xs text-secondary mt-2">Give clues to your teammate!</div>
              </div>
            ) : (
              <form onSubmit={handleGuessSubmit} className="flex flex-col items-center gap-2 w-full">
                <Input
                  value={guess}
                  onChange={e => setGuess(e.target.value)}
                  placeholder="Enter your guess"
                  className="w-full text-main bg-main border border-secondary rounded px-3 py-2"
                  disabled={submitting || isGameFinished}
                  required
                />
                <Button type="submit" className="w-full" disabled={submitting || isGameFinished || !guess.trim()}>
                  {submitting ? "Submitting..." : "Submit Guess"}
                </Button>
                {error && <div className="text-destructive text-center mt-2">{error}</div>}
              </form>
            )}
            <div className="w-full flex flex-col items-center gap-2 mt-4">
              <div className="text-lg font-semibold text-primary">Your Team</div>
              <div className="flex flex-col gap-1 w-full">
                <div className="text-main text-base font-bold">Score: {teamScore}</div>
                <div className="text-main text-base">Round Points: {roundPoints}</div>
                <div className="text-main text-base">Guesses this round:</div>
                <ul className="w-full flex flex-col gap-1 items-center">
                  {guesses.length === 0 ? (
                    <li className="text-secondary">No guesses yet.</li>
                  ) : (
                    guesses.map((g: string, i: number) => (
                      <li key={i} className="bg-primary/80 text-black font-semibold rounded px-2 py-1 mb-1 text-base shadow border border-primary/40 text-center">{g}</li>
                    ))
                  )}
                </ul>
              </div>
            </div>
          </>
        ) : (
          <div className="text-lg text-center text-secondary">Waiting for the next round...</div>
        )}
      </div>
    </main>
  );
}
