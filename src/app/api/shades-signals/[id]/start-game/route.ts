import { NextResponse } from 'next/server';
// Corrected import path and ensuring all local types are removed
import type { Game, Player, Round, Clue, GameStatus } from '../../../../../lib/mockDb';
import { getGameFromDb, updateGameInDb } from '../../../../../lib/mockDb';

// Local types like Guess and specific GameStatus values are implicitly covered by importing Game, Round, etc.
// No need to define Player, Guess, Clue, GameStatus, Round, Game locally anymore.

// Mock database - in a real app, this would interact with a persistent database
const mockGamesDB = new Map<string, Game>();

function selectClueGiver(players: Player[], currentRoundNumber: number): string {
  if (!players || players.length === 0) {
    throw new Error("Cannot select clue giver: No players in the game.");
  }
  const adjustedRoundNumber = Math.max(1, currentRoundNumber);
  const clueGiverIndex = (adjustedRoundNumber - 1) % players.length;
  const selectedPlayer = players[clueGiverIndex];
  if (selectedPlayer === undefined) {
    console.warn("selectClueGiver: selectedPlayer was undefined, falling back to first player.");
    if (players[0] !== undefined) {
        return players[0].id;
    }
    throw new Error("Cannot select clue giver: Player array seems sparse or invalid after checks.");
  }
  return selectedPlayer.id;
}

function generateRandomHex(): string {
  return `#${Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0')}`;
}

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const gameId = params.id;

  try {
    const game = await getGameFromDb(gameId);

    if (!game) {
      return NextResponse.json({ message: `Game with ID ${gameId} not found. Ensure it was created first.` }, { status: 404 });
    }

    // Ensure game.status is a valid GameStatus type before comparison
    const gameStatus: GameStatus = game.status;
    if (gameStatus !== 'lobby') {
      return NextResponse.json({ message: 'Game has already started or is finished.' }, { status: 400 });
    }

    if (game.players.length < 2) {
      return NextResponse.json({ message: 'Not enough players to start the game. Minimum 2 players required.' }, { status: 400 });
    }

    const clueGiverId = selectClueGiver(game.players, 1);
    const targetHex = generateRandomHex();

    // Define the activeRound with explicit type for clarity and safety
    const activeRoundForUpdate: { clueGiverId: string; targetHex: string; cluesGiven: Clue[] } = {
      clueGiverId: clueGiverId,
      targetHex: targetHex,
      cluesGiven: [],
    };

    const firstRound: Round = {
      roundNumber: 1,
      clueGiverId: clueGiverId,
      targetHex: targetHex,
      clues: [], // Initialize with empty clues array
      guesses: [], // Initialize with empty guesses array
      startTime: new Date(),
      // endTime will be set when the round concludes
    };

    const gameToUpdate: Game = {
        ...game,
        status: 'active', // Explicitly set as GameStatus
        currentRoundNumber: 1,
        rounds: [firstRound],
        activeRound: activeRoundForUpdate,
        updatedAt: new Date(),
    };

    const savedGame = await updateGameInDb(gameToUpdate);

    if (!savedGame) {
        console.error('Critical error: Failed to update game in mock DB for gameId:', gameId);
        return NextResponse.json({ message: 'Failed to save game updates to the database' }, { status: 500 });
    }

    return NextResponse.json({ message: 'Game started successfully', game: savedGame }, { status: 200 });

  } catch (error) {
    console.error(`Error starting game ${gameId}:`, error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred while starting the game.';
    return NextResponse.json({ message: 'Failed to start game', error: errorMessage }, { status: 500 });
  }
}
