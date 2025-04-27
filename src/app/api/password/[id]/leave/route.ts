import { NextRequest, NextResponse } from "next/server";
import { db } from "../../../../../server/db/index";
import { eq } from "drizzle-orm";
import { password } from "../../../../../server/db/schema";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const sessionId = req.cookies.get("session_id")?.value;
  if (!sessionId) {
    return NextResponse.json({ error: "No session" }, { status: 401 });
  }

  try {
    // Get the current game state
    const game = await db.query.password.findFirst({
      where: eq(password.id, params.id),
    });

    if (!game) {
      return NextResponse.json({ error: "Game not found" }, { status: 404 });
    }

    // Check if the player is in the game
    let playerFound = false;
    const updatedTeams = { ...game.teams };

    // Check each team for the player
    for (const teamKey in updatedTeams) {
      const playerIndex = updatedTeams[teamKey].indexOf(sessionId);
      if (playerIndex !== -1) {
        // Remove player from the team
        updatedTeams[teamKey] = updatedTeams[teamKey].filter(id => id !== sessionId);
        playerFound = true;
        break;
      }
    }

    if (!playerFound) {
      return NextResponse.json({ error: "Player not in game" }, { status: 400 });
    }

    // If the player is the host, either assign a new host or end the game
    let updatedHostId = game.host_id;
    if (sessionId === game.host_id) {
      // Find a new host from remaining players
      const allPlayers = Object.values(updatedTeams).flat();
      if (allPlayers.length > 0) {
        updatedHostId = allPlayers[0];
      } else {
        // No players left, game should be marked for cleanup
        // Could set an expiration time here if needed
      }
    }

    // Update the game state
    await db.update(password)
      .set({
        teams: updatedTeams,
        host_id: updatedHostId,
        updated_at: new Date()
      })
      .where(eq(password.id, params.id));

    // If the game is now empty or has no host, you might want to handle that
    // For example, setting an expiration time or deleting the game

    return NextResponse.json({
      success: true,
      message: "Left the game successfully",
      newHost: sessionId === game.host_id ? updatedHostId : undefined
    });

  } catch (error) {
    console.error("Error in leave game route:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
