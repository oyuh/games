import { NextRequest, NextResponse } from "next/server";
import { db } from "~/server/db";
import { password } from "~/server/db/schema";
import { eq } from "drizzle-orm";

interface TeamStructure {
  noTeam: string[];
  [key: string]: string[];
}

export async function POST(
  req: NextRequest,
  { params }: { params: { code: string } }
) {
  try {
    // Get code from URL parameter and session ID from cookies
    const code = params.code;
    const sessionId = req.cookies.get("session_id")?.value;

    if (!sessionId) {
      return NextResponse.json({ error: "No session" }, { status: 401 });
    }

    // Find game by code
    const game = await db.query.password.findFirst({
      where: eq(password.code, code.toUpperCase()),
    });

    if (!game) {
      return NextResponse.json(
        { error: "Game not found with this code" },
        { status: 404 }
      );
    }

    // Check if game has already started
    if (game.started_at) {
      return NextResponse.json(
        { error: "Cannot join game that has already started" },
        { status: 403 }
      );
    }

    // Check if player is already in the game
    const teams = game.teams as TeamStructure;
    let playerFound = false;

    // Check all teams including noTeam
    for (const teamKey in teams) {
      if (teams[teamKey].includes(sessionId)) {
        playerFound = true;
        break;
      }
    }

    if (!playerFound) {
      // Add player to noTeam
      const updatedTeams = {
        ...teams,
        noTeam: [...teams.noTeam, sessionId]
      };

      // Update the game with the new player
      // Also reset expiration time similar to imposter route
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 24);

      await db
        .update(password)
        .set({
          teams: updatedTeams,
          expires_at: expiresAt
        })
        .where(eq(password.id, game.id));
    }

    // Return the game ID for consistency with the imposter route
    return NextResponse.json({ success: true, id: game.id });
  } catch (error) {
    console.error("Error joining password game:", error);
    return NextResponse.json(
      { error: "Failed to join game", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
