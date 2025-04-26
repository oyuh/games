import { NextRequest, NextResponse } from "next/server";
import { db } from "../../../../../server/db/index";
import { imposter } from "../../../../../server/db/schema";
import { eq } from "drizzle-orm";
import shuffle from "lodash.shuffle";

// Add a type for game_data to ensure type safety
interface ImposterGameData {
  phase?: string;
  round?: number;
  clues?: Record<string, string>;
  clueOrder?: string[];
  currentTurnPlayerId?: string | null;
  activePlayers?: string[];
  firstClueAt?: string;
  playerDetectedDisconnected?: string;
}

export async function POST(req: NextRequest, context: object) {
  const { params } = context as { params: { id: string } };
  const sessionId = req.cookies.get("session_id")?.value;
  if (!sessionId) return NextResponse.json({ error: "No session" }, { status: 401 });

  // Safely parse the request body with error handling
  let clue;
  try {
    const body = await req.json();
    clue = body.clue;
  } catch (error) {
    return NextResponse.json({ error: "Invalid request format" }, { status: 400 });
  }

  if (!clue || typeof clue !== "string") {
    return NextResponse.json({ error: "Invalid clue" }, { status: 400 });
  }

  // Safely fetch and validate game data
  const game = await db.query.imposter.findFirst({ where: eq(imposter.id, params.id) });
  if (!game) return NextResponse.json({ error: "Game not found" }, { status: 404 });

  // Gracefully handle missing game data
  if (!game.game_data) {
    return NextResponse.json({ error: "Invalid game data" }, { status: 400 });
  }

  const gameData = game.game_data as ImposterGameData;

  // Check if we're in the clue phase
  if (gameData.phase !== "clue") {
    return NextResponse.json({ error: "Not accepting clues", phase: gameData.phase }, { status: 400 });
  }

  // --- Clue submission logic ---
  let clues = gameData.clues || {};
  const round = gameData.round || 1;

  if (!game.player_ids || !Array.isArray(game.player_ids) || game.player_ids.length === 0) {
    return NextResponse.json({ error: "No players in game" }, { status: 400 });
  }

  // Block clue submission if player is not in player_ids
  if (!game.player_ids.includes(sessionId)) {
    return NextResponse.json({ error: "You are out" }, { status: 403 });
  }

  // If this player already submitted, block
  if (clues[sessionId]) {
    return NextResponse.json({ error: "Clue already submitted" }, { status: 400 });
  }

  // If this is the first clue submitted this round, initialize/enforce the clue order
  let clueOrder = Array.isArray(gameData.clueOrder) && gameData.clueOrder.length > 0
    ? [...gameData.clueOrder]
    : [];

  // Generate clue order if needed (beginning of round)
  if (clueOrder.length === 0) {
    const imposters = Array.isArray(game.imposter_ids) ? game.imposter_ids : [];
    const players = [...game.player_ids];

    // Keep shuffling until a non-imposter is first, or force a non-imposter to the front
    let randomizedOrder = shuffle(players);
    let maxShuffle = 10;
    while (imposters.includes(randomizedOrder[0]) && maxShuffle-- > 0) {
      randomizedOrder = shuffle(players);
    }
    if (imposters.includes(randomizedOrder[0])) {
      // Force a non-imposter to the front if possible
      const firstNonImposter = randomizedOrder.find(pid => !imposters.includes(pid));
      if (firstNonImposter) {
        randomizedOrder = [firstNonImposter, ...randomizedOrder.filter(pid => pid !== firstNonImposter)];
      }
    }
    // Final check: if all are imposters (shouldn't happen), just use the order
    clueOrder = randomizedOrder;
  }

  // Start tracking active players for this round (players who submit clues)
  let activePlayers = Array.isArray(gameData.activePlayers) ? [...gameData.activePlayers] : [];

  // Add this player to active players list since they're submitting a clue
  if (!activePlayers.includes(sessionId)) {
    activePlayers.push(sessionId);
  }

  // Determine current turn player
  const playersYetToClue = clueOrder.filter(id => !clues[id]);
  const currentTurnPlayerId = playersYetToClue.length > 0 ? playersYetToClue[0] : null;

  // Create a flag to determine if we should enforce turn order
  // We'll relax the turn order enforcement if:
  // 1. It's not the first submission of the round (allow catching up)
  // 2. The player is already in the queue but missed their turn
  // 3. It's the first round (more flexible on first round)
  const isFirstRound = round === 1;
  const isFirstSubmission = Object.keys(clues).length === 0;
  const playerMissedTurn = clueOrder.indexOf(sessionId) < clueOrder.indexOf(currentTurnPlayerId);

  // Only enforce turn order for the first player in each round
  // After that, let anyone submit in any order to prevent deadlocks
  const shouldEnforceTurnOrder = isFirstSubmission && !isFirstRound;

  // If enforcing turn order and it's not this player's turn
  if (shouldEnforceTurnOrder && currentTurnPlayerId !== sessionId) {
    return NextResponse.json({
      error: "Not your turn to submit a clue",
      currentTurnPlayerId,
      yourId: sessionId
    }, { status: 403 });
  }

  // Accept the clue
  clues = { ...clues, [sessionId]: clue };

  // Handle game state update
  const remaining = clueOrder.filter(id => !clues[id]);
  let nextTurnPlayerId = null;
  let newPhase = "clue";

  // If this was the first submission, record the timestamp
  const firstClueAt = Object.keys(clues).length === 1 ? new Date().toISOString() : gameData.firstClueAt;

  if (remaining.length === 0) {
    // All players have submitted clues
    // Randomize clue order for next round
    newPhase = "shouldVote";
    nextTurnPlayerId = null;
  } else {
    // Still waiting on more players
    nextTurnPlayerId = remaining[0];
  }

  try {
    const updatedGameData: ImposterGameData = {
      ...gameData,
      clues,
      clueOrder,
      currentTurnPlayerId: nextTurnPlayerId,
      phase: newPhase,
      round,
      firstClueAt,
      activePlayers // Store active players for this round
    };

    await db.update(imposter)
      .set({ game_data: updatedGameData })
      .where(eq(imposter.id, params.id));

    return NextResponse.json({
      success: true,
      nextTurnPlayerId,
      phase: newPhase,
      cluesSubmitted: Object.keys(clues).length,
      totalPlayers: clueOrder.length
    });
  } catch (error) {
    console.error("Database error when updating clue submission:", error);
    return NextResponse.json({ error: "Server error while saving your clue" }, { status: 500 });
  }
}
