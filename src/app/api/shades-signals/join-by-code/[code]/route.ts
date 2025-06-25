import { NextResponse } from 'next/server';
// import prisma from '@/lib/prisma';
import { db } from '~/server/db/index';
import { shadesSignals } from '~/server/db/schema';
import { eq } from 'drizzle-orm';

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

    // Find the game using Drizzle ORM (case-insensitive code search might require specific DB setup or fetching then filtering)
    const game = await db.query.shadesSignals.findFirst({
      where: (fields, { eq }) => eq(fields.code, gameCode.toUpperCase()),
    });

    if (!game) {
      return NextResponse.json({ message: `Game not found with code: ${gameCode}` }, { status: 404 });
    }

    // Extract game_data fields with type safety
    type GameData = {
      players?: Player[];
      playerScores?: Record<string, number>;
      status?: GameStatus;
      settings?: { maxPlayers?: number };
      [key: string]: unknown;
    };
    const gameData: GameData = (game.game_data ?? {}) as GameData;
    const currentPlayers: Player[] = Array.isArray(gameData.players) ? gameData.players : [];
    const currentScores: Record<string, number> = typeof gameData.playerScores === 'object' && gameData.playerScores !== null ? gameData.playerScores : {};
    const status: GameStatus = gameData.status ?? 'lobby';
    const settings = typeof gameData.settings === 'object' && gameData.settings !== null ? gameData.settings as { maxPlayers?: number } : {};

    if (status !== 'lobby') {
      return NextResponse.json({ message: 'This game has already started or finished.' }, { status: 403 });
    }

    // --- Handle Max Players (Assuming JSON storage for settings) ---
    let maxPlayers = 10; // Default max players
    if (typeof settings.maxPlayers === 'number') {
      maxPlayers = settings.maxPlayers;
    }
    // ---

    if (currentPlayers.length >= maxPlayers) {
      return NextResponse.json({ message: 'Game is full.' }, { status: 403 });
    }

    // Add the player
    const newPlayer: Player = { id: player.id.trim(), name: player.name.trim() };
    const updatedPlayers = [...currentPlayers, newPlayer];
    const updatedScores = { ...currentScores, [newPlayer.id]: 0 };

    // Update the game in the database using Drizzle ORM
    const updatedGameArr = await db.update(shadesSignals)
      .set({
        // Add/merge game_data if needed
        game_data: {
          ...(game.game_data ?? {}),
          players: updatedPlayers,
          playerScores: updatedScores,
        },
        // updatedAt: new Date(), // Add this if you have an updatedAt field
      })
      .where(eq(shadesSignals.id, game.id))
      .returning();
    const updatedGame = updatedGameArr[0];

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
