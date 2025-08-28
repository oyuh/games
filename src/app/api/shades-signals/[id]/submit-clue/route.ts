import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { db } from '~/server/db';
import { shadesSignals } from '~/server/db/schema';
import { eq } from 'drizzle-orm';
import type {
  ShadesSignalsActionResponse,
  ShadesSignalsGameData,
  ShadesSignalsClue
} from '~/lib/types/shades-signals';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse<ShadesSignalsActionResponse>> {
  try {
    const gameId = params.id;
    const body = await request.json() as { playerId: string; clueText: string };
    const { playerId, clueText } = body;

    if (!playerId || !clueText?.trim()) {
      return NextResponse.json(
        { success: false, error: 'Player ID and clue text are required' },
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

    // Check if game is active
    if (!gameData.gameStarted || gameData.currentPhase !== 'active') {
      return NextResponse.json(
        { success: false, error: 'Game is not currently active' },
        { status: 400 }
      );
    }

    // Get current round
    const currentRound = gameData.rounds[gameData.currentRound - 1];
    if (!currentRound || currentRound.status !== 'active') {
      return NextResponse.json(
        { success: false, error: 'No active round found' },
        { status: 400 }
      );
    }

    // Check if player is the clue giver
    if (currentRound.clueGiverId !== playerId) {
      return NextResponse.json(
        { success: false, error: 'Only the clue giver can submit clues' },
        { status: 403 }
      );
    }

    // Check if max clues reached
    if (currentRound.clues.length >= currentRound.maxClues) {
      return NextResponse.json(
        { success: false, error: 'Maximum number of clues reached for this round' },
        { status: 400 }
      );
    }

    // Check if round time limit exceeded
    if (currentRound.timeLimit && Date.now() - currentRound.startTime > currentRound.timeLimit * 1000) {
      return NextResponse.json(
        { success: false, error: 'Round time limit exceeded' },
        { status: 400 }
      );
    }

    // Create new clue
    const newClue: ShadesSignalsClue = {
      id: crypto.randomUUID(),
      clueGiverId: playerId,
      clueText: clueText.trim(),
      timestamp: Date.now(),
      roundNumber: currentRound.roundNumber
    };

    // Add clue to current round
    currentRound.clues.push(newClue);

    // Save updated game state
    await db
      .update(shadesSignals)
      .set({
        game_data: gameData
      })
      .where(eq(shadesSignals.id, gameId));

    return NextResponse.json({
      success: true,
      gameData: gameData
    });

  } catch (error) {
    console.error('Submit clue error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
