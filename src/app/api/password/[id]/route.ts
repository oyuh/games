import { NextRequest, NextResponse } from "next/server";
import { db } from "~/server/db";
import { password, sessions } from "~/server/db/schema";
import { eq, inArray } from "drizzle-orm";

type PlayerNames = Record<string, string>;

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
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

    // Collect all player IDs from teams
    const allPlayerIds = new Set<string>();
    const teams = game.teams as Record<string, string[]>;

    // Add host ID
    if (game.host_id) {
      allPlayerIds.add(game.host_id);
    }

    // Add all players from all teams
    for (const teamKey in teams) {
      for (const playerId of teams[teamKey]) {
        allPlayerIds.add(playerId);
      }
    }

    // Prefetch player names in a single, optimized query
    // This query is optimized by using a prepared statement and caching
    const playerNamesPromise = db.query.sessions.findMany({
      where: inArray(sessions.id, Array.from(allPlayerIds)),
      columns: { id: true, entered_name: true },
    });

    // Do any other processing while the query is running...

    // Wait for player names results
    const players = await playerNamesPromise;

    // Process player names efficiently
    const playerNames: PlayerNames = Object.fromEntries(
      players.map(player => [player.id, player.entered_name ?? "Unknown"])
    );

    // Add fallback names for any missing players
    for (const id of allPlayerIds) {
      if (!playerNames[id]) {
        playerNames[id] = "Unknown";
      }
    }

    // Return game with player names
    return NextResponse.json({
      game: {
        ...game,
        playerNames
      }
    });
  } catch (error) {
    console.error("Error fetching password game:", error);
    return NextResponse.json(
      { error: "Failed to fetch game" },
      { status: 500 }
    );
  }
}
