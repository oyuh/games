import { NextRequest, NextResponse } from "next/server";
import { db } from "~/server/db";
import { password } from "~/server/db/schema";
import { eq } from "drizzle-orm";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { sessionId, teamNumber } = await req.json();

    if (!sessionId || teamNumber === undefined) {
      return NextResponse.json(
        { error: "Session ID and team number are required" },
        { status: 400 }
      );
    }

    // Find game by ID
    const game = await db.query.password.findFirst({
      where: eq(password.id, params.id),
    });

    if (!game) {
      return NextResponse.json(
        { error: "Game not found with this ID" },
        { status: 404 }
      );
    }

    // Check if game has already started
    if (game.started_at) {
      return NextResponse.json(
        { error: "Cannot join team after game has started" },
        { status: 403 }
      );
    }

    const teams = game.teams as any;
    const teamKey = teamNumber.toString();

    // Check if team exists
    if (!teams[teamKey] && teamKey !== "noTeam") {
      return NextResponse.json(
        { error: "Invalid team number" },
        { status: 400 }
      );
    }

    // Check if team is already full (max 2 members per team)
    if (teams[teamKey] && teams[teamKey].length >= 2 && teamKey !== "noTeam") {
      return NextResponse.json(
        { error: "Team is already full" },
        { status: 403 }
      );
    }

    // Remove player from any existing team
    const updatedTeams = { ...teams };
    for (const team in updatedTeams) {
      updatedTeams[team] = updatedTeams[team].filter(
        (id: string) => id !== sessionId
      );
    }

    // Add player to the requested team
    updatedTeams[teamKey] = [...(updatedTeams[teamKey] || []), sessionId];

    // Update the game with the new team assignments
    await db
      .update(password)
      .set({ teams: updatedTeams })
      .where(eq(password.id, params.id));

    // Fetch updated game
    const updatedGame = await db.query.password.findFirst({
      where: eq(password.id, params.id),
    });

    return NextResponse.json({ game: updatedGame });
  } catch (error) {
    console.error("Error joining team:", error);
    return NextResponse.json(
      { error: "Failed to join team" },
      { status: 500 }
    );
  }
}
