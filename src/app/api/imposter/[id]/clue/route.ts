import { NextRequest, NextResponse } from "next/server";
import { db } from "../../../../../server/db/index";
import { imposter } from "../../../../../server/db/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import shuffle from "lodash.shuffle";

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

  // Check if we're in the clue phase
  if (game.game_data.phase !== "clue") {
    return NextResponse.json({ error: "Not accepting clues", phase: game.game_data.phase }, { status: 400 });
  }

  // --- Random clue order logic ---
  let { clues = {}, round = 1 } = game.game_data;

  if (!game.player_ids || !Array.isArray(game.player_ids) || game.player_ids.length === 0) {
    return NextResponse.json({ error: "No players in game" }, { status: 400 });
  }

  // If this is the start of a new clue round, generate a random clue order (imposter can't go first)
  let clueOrder = Array.isArray(game.game_data.clueOrder) ? [...game.game_data.clueOrder] : [];
  if (!clueOrder || clueOrder.length === 0) {
    const imposters = Array.isArray(game.imposter_ids) ? game.imposter_ids : [];
    let nonImposters = game.player_ids.filter((id: string) => !imposters.includes(id));
    let impostersList = game.player_ids.filter((id: string) => imposters.includes(id));
    let shuffled = shuffle(game.player_ids);
    // If an imposter is first, swap with a non-imposter
    if (imposters.includes(shuffled[0]) && nonImposters.length > 0) {
      const firstNonImposterIdx = shuffled.findIndex(id => !imposters.includes(id));
      if (firstNonImposterIdx > 0) {
        // Swap
        const tmp = shuffled[0];
        shuffled[0] = shuffled[firstNonImposterIdx];
        shuffled[firstNonImposterIdx] = tmp;
      }
    }
    clueOrder = shuffled;
  }

  // Find players who haven't submitted a clue yet, in clueOrder
  const playersYetToClue = clueOrder.filter((id: string) => !clues[id]);

  // If all have submitted, move to shouldVote phase
  if (playersYetToClue.length === 0) {
    try {
      await db.update(imposter)
        .set({ game_data: { ...game.game_data, phase: "shouldVote", currentTurnPlayerId: null, clueOrder } })
        .where(eq(imposter.id, params.id));
      return NextResponse.json({ success: true, phase: "shouldVote" });
    } catch (error) {
      console.error("Database error when moving to shouldVote phase:", error);
      return NextResponse.json({ error: "Server error when updating game state" }, { status: 500 });
    }
  }

  // If this player already submitted, block
  if (clues[sessionId]) {
    return NextResponse.json({ error: "Clue already submitted" }, { status: 400 });
  }

  // Determine whose turn it is (first in playersYetToClue)
  let currentTurnPlayerId = game.game_data.currentTurnPlayerId;
  const expectedTurnPlayerId = playersYetToClue[0];

  if (currentTurnPlayerId !== expectedTurnPlayerId) {
    currentTurnPlayerId = expectedTurnPlayerId;
  }

  // If it's not this player's turn but there's a player disconnection detected, allow them to submit anyway
  const isPlayerDisconnected = !!game.game_data.playerDetectedDisconnected;
  const isDisconnectedPlayersTurn = game.game_data.playerDetectedDisconnected === currentTurnPlayerId;

  // Only enforce turn order if there's no disconnection situation
  if (currentTurnPlayerId !== sessionId && !(isPlayerDisconnected && isDisconnectedPlayersTurn)) {
    return NextResponse.json({
      error: "Not your turn to submit a clue",
      currentTurnPlayerId,
      yourId: sessionId
    }, { status: 403 });
  }

  // Accept the clue
  clues[sessionId] = clue;
  if (!clueOrder.includes(sessionId)) clueOrder.push(sessionId);

  // After this, check if more players remain
  const remaining = clueOrder.filter((id: string) => !clues[id]);
  let nextTurnPlayerId = null;
  let newPhase = game.game_data.phase;

  if (remaining.length === 0) {
    newPhase = "shouldVote";
  } else {
    nextTurnPlayerId = remaining[0];
  }

  try {
    await db.update(imposter)
      .set({
        game_data: {
          ...game.game_data,
          clues,
          clueOrder,
          currentTurnPlayerId: nextTurnPlayerId,
          phase: newPhase,
          round: round ?? 1
        }
      })
      .where(eq(imposter.id, params.id));
    return NextResponse.json({ success: true, nextTurnPlayerId, phase: newPhase });
  } catch (error) {
    console.error("Database error when updating clue submission:", error);
    return NextResponse.json({ error: "Server error while saving your clue" }, { status: 500 });
  }
}
