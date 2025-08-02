import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { db } from '~/server/db/index';
import { shadesSignals } from '~/server/db/schema';
import { eq } from 'drizzle-orm';
import type {
  ShadesSignalsJoinResponse,
  ShadesSignalsGameData,
  ShadesSignalsPlayer
} from "~/lib/types/shades-signals";

export async function POST(
  request: NextRequest,
  { params }: { params: { code: string } }
): Promise<NextResponse<ShadesSignalsJoinResponse>> {
  try {
    const gameCode = params.code;
    const body = await request.json() as {
      player_id: string;
      player_name: string;
    };
    const { player_id, player_name } = body;

    if (!gameCode?.trim()) {
      return NextResponse.json(
        { success: false, error: 'Game code is required' },
        { status: 400 }
      );
    }

    if (!player_id?.trim() || !player_name?.trim()) {
      return NextResponse.json(
        { success: false, error: 'Player ID and name are required' },
        { status: 400 }
      );
    }

    // Find the game
    const game = await db
      .select()
      .from(shadesSignals)
      .where(eq(shadesSignals.code, gameCode.toUpperCase()))
      .limit(1);

    if (!game[0]) {
      return NextResponse.json(
        { success: false, error: `Game not found with code: ${gameCode}` },
        { status: 404 }
      );
    }

    const gameData = game[0].game_data as ShadesSignalsGameData;

    // Check if game has started
    if (gameData.gameStarted) {
      return NextResponse.json(
        { success: false, error: 'This game has already started' },
        { status: 403 }
      );
    }

    // Check if game is full
    if (gameData.players.length >= gameData.maxPlayers) {
      return NextResponse.json(
        { success: false, error: 'Game is full' },
        { status: 403 }
      );
    }

    // Check if player already exists
    const existingPlayer = gameData.players.find(p => p.id === player_id);
    if (existingPlayer) {
      return NextResponse.json(
        { success: false, error: 'Player is already in this game' },
        { status: 400 }
      );
    }

    // Add the new player
    const newPlayer: ShadesSignalsPlayer = {
      id: player_id.trim(),
      name: player_name.trim(),
      score: 0,
      isHost: false,
      isConnected: true,
      lastHeartbeat: Date.now()
    };

    gameData.players.push(newPlayer);
    gameData.playerScores[newPlayer.id] = 0;

    // Update the database
    const updatedGame = await db
      .update(shadesSignals)
      .set({
        player_ids: [...game[0].player_ids, player_id],
        game_data: gameData
      })
      .where(eq(shadesSignals.id, game[0].id))
      .returning();

    if (!updatedGame[0]) {
      return NextResponse.json(
        { success: false, error: 'Failed to update game' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      gameData: gameData
    });

  } catch (error) {
    console.error(`Error processing join request:`, error);
    return NextResponse.json(
      { success: false, error: 'Failed to join game' },
      { status: 500 }
    );
  }
}
