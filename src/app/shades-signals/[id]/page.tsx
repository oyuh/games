"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function ShadesSignalsLobby({ params }: { params: { id: string } }) {
  const { id } = params;
  const router = useRouter();
  const [game, setGame] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchGame() {
      setLoading(true);
      const res = await fetch(`/api/shades-signals/${id}`);
      if (res.ok) {
        const data = await res.json();
        setGame(data.game);
      }
      setLoading(false);
    }
    fetchGame();
  }, [id]);

  if (loading) return <div className="flex justify-center items-center h-full">Loading...</div>;
  if (!game) return <div className="text-center mt-10">Game not found.</div>;

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-8">
      <h1 className="text-3xl font-bold mb-4">Shades & Signals Lobby</h1>
      <div className="mb-2">Game Code: <span className="font-mono bg-secondary/20 px-2 py-1 rounded">{game.code}</span></div>
      <div className="mb-4">Players: {game.player_ids?.length || 1}</div>
      {/* Add player list, start button, etc. here */}
      <button
        className="bg-primary text-primary-foreground px-4 py-2 rounded mt-4"
        onClick={() => router.push(`/shades-signals/${id}/begin`)}
      >
        Start Game
      </button>
    </main>
  );
}
