import { NextRequest, NextResponse } from "next/server";
import { db } from "~/server/db";
import { password_game } from "~/server/db/schema";
import { eq } from "drizzle-orm";

export async function POST(req: NextRequest) {
  const { gameId, teamId, category } = await req.json();
  if (!gameId || !teamId || !category) {
    return NextResponse.json({ error: "Missing gameId, teamId, or category" }, { status: 400 });
  }
  const game = await db.query.password_game.findFirst({ where: eq(password_game.id, gameId) });
  if (!game) return NextResponse.json({ error: "Game not found" }, { status: 404 });
  const teamData = game.team_data ?? { teams: [] };
  const teams = teamData.teams ?? [];
  const team = teams.find((t: any) => t.id === teamId);
  if (!team) return NextResponse.json({ error: "Team not found" }, { status: 404 });
  // Save the chosen category for this round in the team object
  team.category = category;
  // Also update game_data to indicate category has been picked
  const gameData = { ...game.game_data, phase: "round", category };
  await db.update(password_game)
    .set({ team_data: teamData, game_data: gameData })
    .where(eq(password_game.id, gameId));
  return NextResponse.json({ success: true });
}
