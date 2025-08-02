import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { db } from '~/server/db';
import { shadesSignals } from '~/server/db/schema';
import { eq } from 'drizzle-orm';
import type {
  ShadesSignalsActionResponse,
  ShadesSignalsGameData,
  ShadesSignalsPlayer,
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
  activeRound?: {
    clueGiverId: string;
    targetHex: string;
    cluesGiven: Clue[];
  };
}
// --- End Type Definitions ---

// --- Mock Database (Simplified and copied for self-containment) ---
// In a real app, share this or use a proper DB connection.
const mockGamesDB = new Map<string, Game>();

async function getGameFromDb(gameId: string): Promise<Game | null> {
  // Simulating async DB call
  await new Promise(resolve => setTimeout(resolve, 50));
  return mockGamesDB.get(gameId) ?? null;
}

async function updateGameInDb(game: Game): Promise<Game | null> {
  // Simulating async DB call
  await new Promise(resolve => setTimeout(resolve, 50));
  mockGamesDB.set(game.id, game);
  return mockGamesDB.get(game.id) ?? null;
}
// --- End Mock Database ---

interface SubmitClueRequestBody {
  clueText: string;
  clueGiverId: string; // Used for validation against the active round's clue giver
}

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const gameId = params.id;

  try {
    const body = await request.json() as SubmitClueRequestBody;
    const { clueText, clueGiverId } = body;

    if (!clueText || typeof clueText !== 'string' || clueText.trim().length === 0) {
      return NextResponse.json({ message: 'Clue text cannot be empty.' }, { status: 400 });
    }
    // Optional: Add more clue validation (e.g., length, one word)
    // if (clueText.trim().split(' ').length > 1) {
    //   return NextResponse.json({ message: 'Clue must be a single word.' }, { status: 400 });
    // }

    if (!clueGiverId) {
        return NextResponse.json({ message: 'Clue giver ID is required.' }, { status: 400 });
    }

    const game = await getGameFromDb(gameId);

    if (!game) {
      return NextResponse.json({ message: 'Game not found.' }, { status: 404 });
    }

    if (game.status !== 'active') {
      return NextResponse.json({ message: 'Game is not currently active. Cannot submit clue.' }, { status: 400 });
    }

    if (!game.activeRound) {
      console.error(`Game ${gameId} is active but has no activeRound defined.`);
      return NextResponse.json({ message: 'Internal server error: Active round not found.' }, { status: 500 });
    }

    if (game.activeRound.clueGiverId !== clueGiverId) {
      return NextResponse.json({ message: 'Invalid action: Submitted clueGiverId does not match active clue giver.' }, { status: 403 });
    }

    // --- Add Clue Logic ---
    const newClue: Clue = {
      clueGiverId: game.activeRound.clueGiverId, // Use the validated one from activeRound
      clueText: clueText.trim(),
      timestamp: new Date(),
    };

    // Update activeRound
    game.activeRound.cluesGiven.push(newClue);

    // Update historical round data in the rounds array
    const currentRoundInArray = game.rounds.find(r => r.roundNumber === game.currentRoundNumber);
    if (currentRoundInArray) {
      currentRoundInArray.clues.push(newClue);
    } else {
      // This should not happen if game state is consistent
      console.error(`Consistency error: Current round ${game.currentRoundNumber} not found in rounds array for game ${gameId}.`);
      // Potentially create it, or handle as an error depending on desired strictness
    }

    game.updatedAt = new Date();
    const updatedGame = await updateGameInDb(game);

    if (!updatedGame) {
      console.error(`Failed to update game ${gameId} in DB after submitting clue.`);
      return NextResponse.json({ message: 'Failed to save clue. Database error.' }, { status: 500 });
    }

    return NextResponse.json(updatedGame, { status: 200 }); // Return the full updated game state

  } catch (error) {
    console.error(`Error submitting clue for game ${gameId}:`, error);
    if (error instanceof SyntaxError) {
        return NextResponse.json({ message: 'Invalid JSON in request body.' }, { status: 400 });
    }
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred.';
    return NextResponse.json({ message: 'Failed to submit clue.', error: errorMessage }, { status: 500 });
  }
}
