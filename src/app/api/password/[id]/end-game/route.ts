import { NextRequest, NextResponse } from "next/server";
import { db } from "~/server/db";
import { password } from "~/server/db/schema";
import { eq } from "drizzle-orm";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Find game by ID
    const game = await db.query.password.findFirst({
      where: eq(password.id, params.id),
    });
    if (!game) {
      return NextResponse.json({ error: "Game not found" }, { status: 404 });
    }
    const gameData = game.game_data || {};
    // Calculate winning teams and max score
    const teamScores = gameData.teamScores || {};
    const maxScore = Math.max(...Object.values(teamScores));
    const winningTeams = Object.entries(teamScores)
      .filter(([_, score]) => score === maxScore)
      .map(([team]) => team);
    const finishedAt = new Date().toISOString();
    // Set finished_at and winningTeams at both top level and in game_data
    gameData.finished_at = finishedAt;
    gameData.winningTeams = winningTeams;
    await db.update(password)
      .set({
        game_data: gameData,
        finished_at: finishedAt,
      })
      .where(eq(password.id, params.id));
    return NextResponse.json({ success: true, finished_at: finishedAt, winningTeams });
  } catch (error) {
    return NextResponse.json({ error: "Failed to end game", details: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
