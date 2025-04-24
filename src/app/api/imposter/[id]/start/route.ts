import { NextRequest, NextResponse } from "next/server";
import { db } from "../../../../../server/db/index";
import { imposter } from "../../../../../server/db/schema";
import { eq } from "drizzle-orm";
import { imposterCategories } from "../../../../../imposter/imposterWords";

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
  if (imposterCategories[game.category]) {
    const words = imposterCategories[game.category];
    word = words[Math.floor(Math.random() * words.length)];
  } else {
    word = "Mystery";
  }

  // Initialize game_data for rounds and voting
  const initialGameData = {
    round: 1,
    phase: "clue", // "clue" | "vote" | "reveal"
    clues: {}, // { [playerId]: string }
    votes: {}, // { [playerId]: string }
    revealed: false,
    history: [] // store past rounds if needed
  };

  await db.update(imposter)
    .set({
      imposter_ids: imposterIds,
      chosen_word: word,
      started_at: new Date(),
      game_data: initialGameData,
    })
    .where(eq(imposter.id, params.id));

  return NextResponse.json({ success: true });
}
