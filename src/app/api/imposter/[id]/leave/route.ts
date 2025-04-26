// In src/app/api/imposter/[id]/leave/route.ts
import { NextRequest, NextResponse } from "next/server";
import { db } from "../../../../../server/db/index";
import { imposter, sessions } from "../../../../../server/db/schema";
import { eq } from "drizzle-orm";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const sessionId = req.cookies.get("session_id")?.value;
  if (!sessionId) return NextResponse.json({ error: "No session" }, { status: 401 });

  // Get the game and session info
  const game = await db.query.imposter.findFirst({ where: eq(imposter.id, params.id) });
  if (!game) return NextResponse.json({ error: "Game not found" }, { status: 404 });

  // Get player name for the leaving player
  const session = await db.query.sessions.findFirst({ where: eq(sessions.id, sessionId) });
  if (!session) return NextResponse.json({ error: "Session not found" }, { status: 404 });

  const playerName = session.entered_name || "Unknown Player";

  // Update game data to mark that a player left
  const updatedGameData = {
    ...game.game_data,
    phase: "ended",
    playerLeft: {
      id: sessionId,
      name: playerName,
      timestamp: new Date().toISOString()
    },
    revealResult: "player_left"
  };

  // Update the game state to reflect a player left
  await db.update(imposter)
    .set({
      game_data: updatedGameData,
      expires_at: new Date(Date.now() + 60 * 60 * 1000) // Set expiry to 1 hour from now
    })
    .where(eq(imposter.id, params.id));

  return NextResponse.json({ success: true });
}
