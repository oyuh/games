import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { db } from "~/server/db/index";
import { shadesSignals } from "~/server/db/schema";
import type {
  ShadesSignalsCreateResponse,
  ShadesSignalsGameData,
  ShadesSignalsPlayer
} from "~/lib/types/shades-signals";
import { DEFAULT_GAME_SETTINGS } from "~/lib/types/shades-signals";

function generateGameCode(length = 6) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < length; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

export async function POST(
  req: NextRequest
): Promise<NextResponse<ShadesSignalsCreateResponse>> {
  try {
    const body = await req.json() as {
      host_id?: string;
      hostId?: string; // Support legacy field name
      host_name?: string;
      settings?: {
        maxPlayers?: number;
        totalRounds?: number;
        maxCluesPerRound?: number;
        roundTimeLimit?: number;
        pointsForCorrectGuess?: number;
        pointsForClueGiver?: number;
      };
    };

    const { host_id, hostId, host_name, settings } = body;
    const actualHostId = host_id ?? hostId; // Support both field names

    if (!actualHostId) {
      return NextResponse.json(
        { success: false, error: "Host ID is required" },
        { status: 400 }
      );
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const code = generateGameCode();

    // Create initial game data
    const hostPlayer: ShadesSignalsPlayer = {
      id: actualHostId,
      name: host_name ?? "Host", // Use provided name or default
      score: 0,
      isHost: true,
      isConnected: true,
      lastHeartbeat: Date.now()
    };

    const gameData: ShadesSignalsGameData = {
      players: [hostPlayer],
      gameStarted: false,
      currentPhase: 'waiting',
      maxPlayers: settings?.maxPlayers ?? DEFAULT_GAME_SETTINGS.maxPlayersPerGame,
      totalRounds: settings?.totalRounds ?? 5,
      currentRound: 0,
      rounds: [],
      playerScores: { [actualHostId]: 0 },
      settings: {
        maxPlayersPerGame: settings?.maxPlayers ?? DEFAULT_GAME_SETTINGS.maxPlayersPerGame,
        roundTimeLimit: settings?.roundTimeLimit ?? DEFAULT_GAME_SETTINGS.roundTimeLimit,
        maxCluesPerRound: settings?.maxCluesPerRound ?? DEFAULT_GAME_SETTINGS.maxCluesPerRound,
        pointsForCorrectGuess: settings?.pointsForCorrectGuess ?? DEFAULT_GAME_SETTINGS.pointsForCorrectGuess,
        pointsForClueGiver: settings?.pointsForClueGiver ?? DEFAULT_GAME_SETTINGS.pointsForClueGiver,
      }
    };

    const game = await db.insert(shadesSignals).values({
      host_id: actualHostId,
      player_ids: [actualHostId],
      game_data: gameData,
      created_at: now,
      expires_at: expiresAt,
      code,
    }).returning();

    return NextResponse.json({
      success: true,
      game: game[0],
      gameId: game[0]?.id,
      gameCode: game[0]?.code
    });

  } catch (error) {
    console.error("Create game error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to create game" },
      { status: 500 }
    );
  }
}
