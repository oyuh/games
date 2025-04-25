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
  const { clue } = await req.json();
  if (!clue || typeof clue !== "string") return NextResponse.json({ error: "Invalid clue" }, { status: 400 });
  const game = await db.query.imposter.findFirst({ where: eq(imposter.id, params.id) });
  if (!game) return NextResponse.json({ error: "Game not found" }, { status: 404 });
  if (!game.game_data || game.game_data.phase !== "clue") return NextResponse.json({ error: "Not accepting clues" }, { status: 400 });

  // --- Random clue order logic ---
  let { clues, round } = game.game_data;
  if (!game.player_ids || !Array.isArray(game.player_ids) || game.player_ids.length === 0) {
    return NextResponse.json({ error: "No players in game" }, { status: 400 });
  }
  if (!clues || typeof clues !== "object") clues = {};

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
    await db.update(imposter)
      .set({ game_data: { ...game.game_data, phase: "shouldVote", currentTurnPlayerId: null, clueOrder } })
      .where(eq(imposter.id, params.id));
    return NextResponse.json({ success: true, phase: "shouldVote" });
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
  if (currentTurnPlayerId !== sessionId) {
    return NextResponse.json({ error: "Not your turn to submit a clue", currentTurnPlayerId }, { status: 403 });
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

  await db.update(imposter)
    .set({ game_data: { ...game.game_data, clues, clueOrder, currentTurnPlayerId: nextTurnPlayerId, phase: newPhase, round: round ?? 1 } })
    .where(eq(imposter.id, params.id));
  return NextResponse.json({ success: true, nextTurnPlayerId, phase: newPhase });
}
