import { NextRequest, NextResponse } from "next/server";
import { db } from "~/server/db";
import { password_game } from "~/server/db/schema";
import { eq } from "drizzle-orm";

export async function POST(req: NextRequest) {
  const { gameId, playerId } = await req.json();
  if (!gameId || !playerId) return NextResponse.json({ error: "Missing gameId or playerId" }, { status: 400 });
  const game = await db.query.password_game.findFirst({ where: eq(password_game.id, gameId) });
  if (!game) return NextResponse.json({ error: "Game not found" }, { status: 404 });
  const gameData = { ...game.game_data };
  gameData.ready = gameData.ready || {};
  gameData.ready[playerId] = true;

  // Check if all players are ready
  const allPlayers = (game.team_data?.teams ?? []).flatMap((t: any) => t.players.map((p: any) => p.id));
  const allReady = allPlayers.length > 0 && allPlayers.every((id: string) => gameData.ready[id]);

  // Only update phase if all players are ready AND all clients have seen the ready phase
  // We'll use a new map: gameData.readySeen[playerId] = true when a client sees phase 'ready'
  gameData.readySeen = gameData.readySeen || {};
  gameData.readySeen[playerId] = true;
  const allSeen = allPlayers.length > 0 && allPlayers.every((id: string) => gameData.readySeen[id]);

  let phaseChanged = false;
  if (allReady && allSeen && gameData.phase === "ready") {
    gameData.phase = "category-pick";
    phaseChanged = true;
    // Reset ready/readySeen for next round
    gameData.ready = {};
    gameData.readySeen = {};
  }

  await db.update(password_game)
    .set({ game_data: gameData })
    .where(eq(password_game.id, gameId));
  return NextResponse.json({ success: true, allReady, allSeen, phaseChanged, phase: gameData.phase });
}
