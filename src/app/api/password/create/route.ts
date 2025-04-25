import { NextRequest, NextResponse } from "next/server";
import { db } from "~/server/db";
import { password_game } from "~/server/db/schema";
import { randomBytes } from "crypto";

function generateGameCode(length = 6) {
  return randomBytes(length)
    .toString("base64")
    .replace(/[^A-Z0-9]/gi, "")
    .slice(0, length)
    .toUpperCase();
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { hostId, maxPlayers, pointsToWin } = body;
    if (!hostId || !maxPlayers || !pointsToWin) {
      return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
    }
    const code = generateGameCode();
    const gameData = {
      pointsToWin: Number(pointsToWin),
      state: "lobby",
    };
    // Calculate number of teams (max 2 per team)
    const numTeams = Math.ceil(Number(maxPlayers) / 2);
    const teamData = {
      teams: Array.from({ length: numTeams }).map((_, i) => ({
        id: i + 1,
        name: `Team ${i + 1}`,
        players: [],
        score: 0,
      })),
    };
    const roundData = {
      round: 0,
      clueGivers: [],
      secretWord: null,
      guesses: [],
    };
    const [game] = await db
      .insert(password_game)
      .values({
        host_id: hostId,
        category: "", // Will be set later if needed
        max_players: Number(maxPlayers),
        code,
        game_data: gameData,
        team_data: teamData,
        round_data: roundData,
      })
      .returning();
    return NextResponse.json({ game: { id: game.id, code: game.code } });
  } catch (err) {
    return NextResponse.json({ error: "Failed to create game." }, { status: 500 });
  }
}
