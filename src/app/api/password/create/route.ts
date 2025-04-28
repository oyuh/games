import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { db } from "~/server/db";
import { password } from "~/server/db/schema";
import { eq } from "drizzle-orm";

function generateGameCode() {
  // Generate a random 6-character code (alphanumeric)
  const characters = "ABCDEFGHIJKLMNPQRSTUVWXYZ123456789";
  let result = "";
  for (let i = 0; i < 6; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
}

export async function POST(req: NextRequest) {
  try {
    // Parse the request body to get hostId, teams, and pointsToWin
    const body = (await req.json()) as Partial<{ hostId: string; teams: number | string; pointsToWin: number | string }>;
    const hostId = body.hostId;
    const numTeams = Number(body.teams) || 2;
    const pointsToWin = Number(body.pointsToWin) || 5;

    if (!hostId) {
      return NextResponse.json({ error: "Host ID is required" }, { status: 400 });
    }

    // Generate a unique game code
    let gameCode = generateGameCode();
    let codeExists = true;

    // Ensure code is unique
    while (codeExists) {
      const existingGame = await db.query.password.findFirst({
        where: eq(password.code, gameCode),
      });

      if (!existingGame) {
        codeExists = false;
      } else {
        gameCode = generateGameCode();
      }
    }

    // Calculate expiration (24 hours from now)
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24);

    // Create initial game structure with dynamically generated teams
    const initialTeams: Record<string, string[]> = {
      noTeam: [hostId], // Initially, the host is in "no team"
    };

    // Add the requested number of teams (from 1 to numTeams)
    for (let i = 1; i <= numTeams; i++) {
      initialTeams[i.toString()] = [];
    }

    // Store the game settings in game_data
    const gameData = {
      pointsToWin: Number(pointsToWin) || 5,
      numberOfTeams: numTeams,
      teamPhases: {},  // Initialize empty teamPhases object
    };

    // Let the database generate the UUID
    const newGame = await db
      .insert(password)
      .values({
        host_id: hostId,
        code: gameCode,
        teams: initialTeams,
        game_data: gameData,
        round_data: {},
        expires_at: expiresAt,
      })
      .returning();

    return NextResponse.json({ game: newGame[0] });
  } catch (error) {
    console.error("Error creating password game:", error);
    return NextResponse.json(
      { error: "Failed to create game", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
