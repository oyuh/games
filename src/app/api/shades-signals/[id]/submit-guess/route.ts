import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { db } from '~/server/db';
import { shadesSignals } from '~/server/db/schema';
import { eq } from 'drizzle-orm';
import type {
  ShadesSignalsActionResponse,
  ShadesSignalsGameData,
  ShadesSignalsGuess,
  ShadesSignalsPlayer
} from '~/lib/types/shades-signals';
import { isValidHexId, calculateHexDistance } from '~/lib/types/shades-signals';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse<ShadesSignalsActionResponse>> {
  try {
    const gameId = params.id;
    const body = await request.json() as { playerId: string; guessedHex: string };
    const { playerId, guessedHex } = body;

    if (!playerId || !guessedHex?.trim()) {
      return NextResponse.json(
        { success: false, error: 'Player ID and guessed hex are required' },
        { status: 400 }
      );
    }

    // Validate hex ID format
    if (!isValidHexId(guessedHex)) {
      return NextResponse.json(
        { success: false, error: 'Invalid hex ID format' },
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

    // Check if player is not the clue giver
    if (currentRound.clueGiverId === playerId) {
      return NextResponse.json(
        { success: false, error: 'Clue giver cannot submit guesses' },
        { status: 403 }
      );
    }

    // Check if player exists in game
    const player = gameData.players.find((p: ShadesSignalsPlayer) => p.id === playerId);
    if (!player) {
      return NextResponse.json(
        { success: false, error: 'Player not found in game' },
        { status: 404 }
      );
    }

    // Check if player has already guessed in this round
    const existingGuess = currentRound.guesses.find(g => g.playerId === playerId);
    if (existingGuess) {
      return NextResponse.json(
        { success: false, error: 'Player has already submitted a guess for this round' },
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

    // Check if guess is correct
    const isCorrect = guessedHex.toUpperCase() === currentRound.targetHex.toUpperCase();
    const distanceFromTarget = calculateHexDistance(guessedHex, currentRound.targetHex);

    // Create new guess
    const newGuess: ShadesSignalsGuess = {
      id: crypto.randomUUID(),
      playerId,
      guessedHex: guessedHex.toUpperCase(),
      isCorrect,
      timestamp: Date.now(),
      roundNumber: currentRound.roundNumber,
      distanceFromTarget
    };

    // Add guess to current round
    currentRound.guesses.push(newGuess);

    // Handle correct guess
    if (isCorrect) {
      currentRound.winnerId = playerId;
      currentRound.status = 'completed';
      currentRound.endTime = Date.now();

      // Update player scores
      gameData.playerScores[playerId] = (gameData.playerScores[playerId] ?? 0) + gameData.settings.pointsForCorrectGuess;

      // Award points to clue giver
      const clueGiverId = currentRound.clueGiverId;
      gameData.playerScores[clueGiverId] = (gameData.playerScores[clueGiverId] ?? 0) + gameData.settings.pointsForClueGiver;

      // Check if game should end
      if (gameData.currentRound >= gameData.totalRounds) {
        gameData.currentPhase = 'finished';
        await db
          .update(shadesSignals)
          .set({
            game_data: gameData,
            finished_at: new Date()
          })
          .where(eq(shadesSignals.id, gameId));
      } else {
        // Prepare next round
        gameData.currentPhase = 'roundEnd';
        gameData.roundStartDelay = 5000; // 5 second delay before next round
      }
    }

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
    console.error('Submit guess error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
