import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { db } from '~/server/db';
import { shadesSignals } from '~/server/db/schema';
import { eq } from 'drizzle-orm';
import type {
  ShadesSignalsActionResponse,
  ShadesSignalsGameData,
  ShadesSignalsPlayer,
  ShadesSignalsRound
} from '~/lib/types/shades-signals';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse<ShadesSignalsActionResponse>> {
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

    // Check if player is host
    const player = gameData.players.find((p: ShadesSignalsPlayer) => p.id === playerId);
    if (!player?.isHost) {
      return NextResponse.json(
        { success: false, error: 'Only the host can advance to the next round' },
        { status: 403 }
      );
    }

    // Check if game is in round end phase
    if (!gameData.gameStarted || gameData.currentPhase !== 'roundEnd') {
      return NextResponse.json(
        { success: false, error: 'Game is not in round end phase' },
        { status: 400 }
      );
    }

    // Check if all rounds are completed
    if (gameData.currentRound >= gameData.totalRounds) {
      return NextResponse.json(
        { success: false, error: 'All rounds have been completed' },
        { status: 400 }
      );
    }

    // Advance to next round
    gameData.currentRound += 1;
    gameData.currentPhase = 'active';

    // Generate hex colors for the new round
    const hexColors = generateHexColors();

    // Create new round
    const newRound = createNewRound(gameData, gameData.currentRound, hexColors);
    gameData.rounds.push(newRound);

    // Clear round start delay
    delete gameData.roundStartDelay;

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
    console.error('Next round error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

function generateHexColors(): Record<string, string> {
  const colors: Record<string, string> = {};
  const rows = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
    const row = rows[rowIndex];
    for (let col = 1; col <= 24; col++) {
      const hexId = `${row}${col}`;

      // Generate a color based on position for consistent color distribution
      const hue = ((rowIndex * 24 + col) * 137.508) % 360; // Golden angle for good distribution
      const saturation = 45 + (rowIndex * 5) % 40; // Vary saturation
      const lightness = 40 + (col * 2) % 30; // Vary lightness

      colors[hexId] = `hsl(${Math.round(hue)}, ${saturation}%, ${lightness}%)`;
    }
  }

  return colors;
}

function createNewRound(
  gameData: ShadesSignalsGameData,
  roundNumber: number,
  hexColors: Record<string, string>
): ShadesSignalsRound {
  // Rotate clue giver
  const clueGiverIndex = (roundNumber - 1) % gameData.players.length;
  const clueGiver = gameData.players[clueGiverIndex];

  if (!clueGiver) {
    throw new Error('No clue giver found');
  }

  // Select a random target hex
  const hexIds = Object.keys(hexColors);
  const randomIndex = Math.floor(Math.random() * hexIds.length);
  const targetHex = hexIds[randomIndex];

  if (!targetHex) {
    throw new Error('No target hex found');
  }

  const targetColor = hexColors[targetHex];

  if (!targetColor) {
    throw new Error('No target color found');
  }

  return {
    roundNumber,
    clueGiverId: clueGiver.id,
    targetHex,
    targetColor,
    clues: [],
    guesses: [],
    winnerId: null,
    startTime: Date.now(),
    status: 'active',
    maxClues: gameData.settings.maxCluesPerRound,
    timeLimit: gameData.settings.roundTimeLimit
  };
}
