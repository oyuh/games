import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { db } from '~/server/db';
import { shadesSignals } from '~/server/db/schema';
import { eq } from 'drizzle-orm';
import type {
  ShadesSignalsHeartbeatResponse,
  ShadesSignalsGameData,
  ShadesSignalsPlayer
} from '~/lib/types/shades-signals';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse<ShadesSignalsHeartbeatResponse>> {
  try {
    const gameId = params.id;
    const body = await request.json() as { playerId: string };
    const { playerId } = body;

    if (!playerId) {
      return NextResponse.json(
        { success: false, error: 'Player ID is required' },
        { status: 400 }
      );
    }

    // Get current game
    const game = await db
      .select()
      .from(shadesSignals)
      .where(eq(shadesSignals.id, gameId))
      .limit(1);

    if (!game[0]) {
      return NextResponse.json(
        { success: false, error: 'Game not found' },
        { status: 404 }
      );
    }

    const gameData = game[0].game_data as ShadesSignalsGameData;
    const currentTime = Date.now();

    // Update player's last heartbeat
    if (gameData.players) {
      const playerIndex = gameData.players.findIndex((p: ShadesSignalsPlayer) => p.id === playerId);
      if (playerIndex !== -1 && gameData.players[playerIndex]) {
        gameData.players[playerIndex].lastHeartbeat = currentTime;
      }
    }

    // Remove players who haven't sent heartbeat in 30 seconds
    const heartbeatTimeout = 30 * 1000; // 30 seconds
    if (gameData.players) {
      const activePlayers = gameData.players.filter(
        (player: ShadesSignalsPlayer) => currentTime - (player.lastHeartbeat ?? 0) <= heartbeatTimeout
      );

      // If players were removed, update the game and handle disconnections
      if (activePlayers.length < gameData.players.length) {
        gameData.players = activePlayers;

        // Handle disconnections during active game
        if (gameData.gameStarted && gameData.currentRound) {
          // Check if the clue giver disconnected
          const currentRound = gameData.rounds[gameData.currentRound - 1];
          if (currentRound && !activePlayers.some((p: ShadesSignalsPlayer) => p.id === currentRound.clueGiverId)) {
            // End the current round if clue giver disconnected
            gameData.currentPhase = 'roundEnd';
          }
        }

        // End game if too few players remain
        if (activePlayers.length < 2) {
          gameData.gameStarted = false;
          gameData.currentPhase = 'waiting';
          gameData.currentRound = 0;
        }
      }
    }

    // Save updated game state
    await db
      .update(shadesSignals)
      .set({
        game_data: gameData,
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000) // Extend expiry by 24 hours
      })
      .where(eq(shadesSignals.id, gameId));

    return NextResponse.json({
      success: true,
      gameData: gameData
    });

  } catch (error) {
    console.error('Heartbeat error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
