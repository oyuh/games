import { NextResponse } from 'next/server';
// TODO: Adjust import path for your Prisma Client instance
import prisma from '@/lib/prisma';

// --- Type Definitions (Keep relevant ones for request/response structure) ---
// Assuming Prisma generates types, but defining request body/player structure explicitly
interface Player {
  id: string;
  name: string;
}

// You might get GameStatus, Round, Game types from your Prisma Client (`import type { Game, Player as PrismaPlayer, GameStatus ... } from '@prisma/client'`)
// For now, defining necessary subset or assuming compatibility.
type GameStatus = 'lobby' | 'active' | 'round_intermission' | 'finished';

// Assume 'players' and 'playerScores' on the Prisma Game model are stored as JSON
// Prisma returns them typically as `JsonValue`, needing assertion or validation.
// Example: type PrismaGame = Omit<PrismaClientGameType, 'players' | 'playerScores'> & { players: Player[], playerScores: Record<string, number> }

// --- End Type Definitions ---

// No Mock Database or local helpers needed anymore

interface JoinRequestBody {
  player: Player; // Expect { id: string, name: string }
}

export async function POST(
  request: Request,
  { params }: { params: { code: string } }
) {
  const gameCode = params.code;

  try {
    const body = await request.json() as JoinRequestBody;
    const { player } = body;

    if (!gameCode || typeof gameCode !== 'string' || gameCode.trim().length === 0) {
      return NextResponse.json({ message: 'Game code missing in URL path.' }, { status: 400 });
    }
    if (!player || typeof player.id !== 'string' || typeof player.name !== 'string' || player.id.trim().length === 0 || player.name.trim().length === 0) {
      return NextResponse.json({ message: 'Valid player ID and name are required in request body.' }, { status: 400 });
    }

    // Find the game using Prisma client (case-insensitive code search might require specific DB setup or fetching then filtering)
    const game = await prisma.game.findUnique({
      where: { code: gameCode.toUpperCase() }, // Assumes `code` field is unique and indexed
      // If code isn't unique or needs case-insensitive search:
      // const games = await prisma.game.findMany({ where: { code: { equals: gameCode, mode: 'insensitive' } } });
      // if (!games || games.length === 0) { /* not found */ } if (games.length > 1) { /* handle collision */ } game = games[0];
    });

    if (!game) {
      return NextResponse.json({ message: `Game not found with code: ${gameCode}` }, { status: 404 });
    }

    // Validate game status - Assuming game.status is a string field
    if ((game.status as GameStatus) !== 'lobby') {
      return NextResponse.json({ message: 'This game has already started or finished.' }, { status: 403 });
    }

    // --- Handle Players and Scores (Assuming JSON storage) ---
    // TODO: Validate the structure of game.players and game.playerScores if fetched from DB as JSON
    let currentPlayers: Player[] = [];
    if (game.players && typeof game.players === 'object' && Array.isArray(game.players)) {
        // Basic check, you might need more robust validation/parsing based on how JSON is stored/retrieved
        currentPlayers = game.players as Player[];
    }
    let currentScores: Record<string, number> = {};
    if (game.playerScores && typeof game.playerScores === 'object' && !Array.isArray(game.playerScores)) {
        currentScores = game.playerScores as Record<string, number>;
    }
    // ---

    const playerAlreadyInGame = currentPlayers.find(p => p.id === player.id);
    if (playerAlreadyInGame) {
      console.log(`Player ${player.id} already in game ${game.code}, returning current game state.`);
      // TODO: Ensure the returned 'game' object has correctly parsed players/scores
      const responseGame = { ...game, players: currentPlayers, playerScores: currentScores };
      return NextResponse.json({ message: 'Player already in game.', game: responseGame }, { status: 200 });
    }

    // --- Handle Max Players (Assuming JSON storage for settings) ---
    let maxPlayers = 10; // Default max players
    if(game.settings && typeof game.settings === 'object' && game.settings !== null && 'maxPlayers' in game.settings && typeof game.settings.maxPlayers === 'number') {
        maxPlayers = game.settings.maxPlayers;
    }
    // ---

    if (currentPlayers.length >= maxPlayers) {
      return NextResponse.json({ message: 'Game is full.' }, { status: 403 });
    }

    // Add the player
    const newPlayer: Player = { id: player.id.trim(), name: player.name.trim() };
    const updatedPlayers = [...currentPlayers, newPlayer];
    const updatedScores = { ...currentScores, [newPlayer.id]: 0 };

    // Update the game in the database using Prisma
    const updatedGame = await prisma.game.update({
      where: { id: game.id },
      data: {
        players: updatedPlayers as any, // Prisma expects JsonValue, casting might be needed or use Prisma types
        playerScores: updatedScores as any, // Prisma expects JsonValue
        updatedAt: new Date(),
      },
    });

    if (!updatedGame) {
      // This case might indicate a concurrent update conflict or DB issue
      console.error(`Failed to update game ${game.id} in DB after player ${player.id} join.`);
      return NextResponse.json({ message: 'Failed to join game due to a database error.' }, { status: 500 });
    }

    // TODO: Ensure the returned 'updatedGame' object has correctly parsed players/scores if Prisma returns JsonValue
    const responseGame = { ...updatedGame, players: updatedPlayers, playerScores: updatedScores };

    console.log(`Player ${player.id} successfully joined game ${updatedGame.code}`);
    return NextResponse.json({ message: 'Successfully joined game!', game: responseGame }, { status: 200 });

  } catch (error) {
    console.error(`Error processing join request for code ${gameCode}:`, error);
    // TODO: Add specific Prisma error handling if needed (e.g., P2002 for unique constraints)
    if (error instanceof SyntaxError) {
        return NextResponse.json({ message: 'Invalid JSON in request body.' }, { status: 400 });
    }
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred.';
    return NextResponse.json({ message: 'Failed to process join request.', error: errorMessage }, { status: 500 });
  }
}
