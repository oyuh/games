import { NextRequest, NextResponse } from "next/server";
import { db } from "../../../../../server/db/index";
import { imposter } from "../../../../../server/db/schema";
import { eq } from "drizzle-orm";
import { imposterCategories } from "../../../../../data/categoryList";
import shuffle from "lodash.shuffle";

function getRandomElements<T>(arr: T[], n: number): T[] {
  const shuffled = arr.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, n);
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const sessionId = req.cookies.get("session_id")?.value;
  if (!sessionId) return NextResponse.json({ error: "No session" }, { status: 401 });

  const game = await db.query.imposter.findFirst({ where: eq(imposter.id, params.id) });
  if (!game) return NextResponse.json({ error: "Game not found" }, { status: 404 });
  if (game.host_id !== sessionId) return NextResponse.json({ error: "Not host" }, { status: 403 });
  if (game.started_at) return NextResponse.json({ error: "Game already started" }, { status: 400 });

  // Pick imposters
  const imposterIds = getRandomElements(game.player_ids, game.num_imposters);

  // Pick a word from the category
  let word = "";
  // Make category lookup case-insensitive and fallback to a valid category
  let categoryKey = Object.keys(imposterCategories).find(
    k => k.toLowerCase() === (game.category || "").toLowerCase()
  );
  if (!categoryKey) {
    // fallback: try to match by displayName
    categoryKey = Object.keys(imposterCategories).find(
      k => imposterCategories[k].displayName.toLowerCase() === (game.category || "").toLowerCase()
    );
  }
  if (categoryKey && imposterCategories[categoryKey]?.items?.length) {
    const words = imposterCategories[categoryKey].items;
    word = words[Math.floor(Math.random() * words.length)];
  } else {
    word = "Mystery";
  }

  // Create randomized player order for clue submissions
  // This ensures randomized order instead of always favoring the host
  const playerOrder = shuffle([...game.player_ids]);

  // Ensure no imposter is in the first position
  const firstPlayerIsImposter = imposterIds.includes(playerOrder[0]);
  if (firstPlayerIsImposter) {
    // Find first non-imposter to swap with
    for (let i = 1; i < playerOrder.length; i++) {
      if (!imposterIds.includes(playerOrder[i])) {
        // Swap the imposter with a non-imposter
        [playerOrder[0], playerOrder[i]] = [playerOrder[i], playerOrder[0]];
        break;
      }
    }
  }

  // DEBUG LOG: Game starting
  console.log('[DEBUG] Starting game', {
    gameId: params.id,
    host: sessionId,
    imposterIds,
    word,
    playerOrder
  });

  // Initialize game_data for rounds and voting
  const initialGameData = {
    round: 1,
    phase: "clue", // "clue" | "vote" | "reveal"
    clues: {}, // { [playerId]: string }
    votes: {}, // { [playerId]: string }
    revealed: false,
    history: [], // store past rounds if needed
    clueOrder: playerOrder, // Add randomized player order for clue submissions
    currentTurnPlayerId: playerOrder[0], // Set the first player to submit a clue
    activePlayers: []
  };

  await db.update(imposter)
    .set({
      imposter_ids: imposterIds,
      chosen_word: word,
      started_at: new Date(),
      game_data: initialGameData,
    })
    .where(eq(imposter.id, params.id));

  // DEBUG LOG: Game data after start
  console.log('[DEBUG] Game data after start', {
    gameId: params.id,
    gameData: initialGameData
  });

  return NextResponse.json({ success: true });
}
