import { NextRequest, NextResponse } from "next/server";
import { db } from "~/server/db";
import { password } from "~/server/db/schema";
import { eq } from "drizzle-orm";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { sessionId } = await req.json();

    if (!sessionId) {
      return NextResponse.json(
        { error: "Session ID is required" },
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
        { error: "Cannot leave team after game has started" },
        { status: 403 }
      );
    }

    const teams = game.teams as any;

    // Find which team the player is in
    let playerFound = false;
    for (const team in teams) {
      if (team !== "noTeam" && teams[team].includes(sessionId)) {
        playerFound = true;
        break;
      }
    }

    if (!playerFound) {
      return NextResponse.json(
        { error: "Player is not in any team" },
        { status: 400 }
      );
    }

    // Remove player from their team and add to noTeam
    const updatedTeams = { ...teams };
    for (const team in updatedTeams) {
      if (team !== "noTeam") {
        updatedTeams[team] = updatedTeams[team].filter(
          (id: string) => id !== sessionId
        );
      }
    }

    // Add player to noTeam if they aren't already there
    if (!updatedTeams.noTeam.includes(sessionId)) {
      updatedTeams.noTeam = [...updatedTeams.noTeam, sessionId];
    }

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
    console.error("Error leaving team:", error);
    return NextResponse.json(
      { error: "Failed to leave team" },
      { status: 500 }
    );
  }
}
