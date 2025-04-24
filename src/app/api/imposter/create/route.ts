import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { db } from "../../../../server/db/index";
import { imposter } from "../../../../server/db/schema";
import { eq } from "drizzle-orm";

export async function POST(req: NextRequest) {
  const body = await req.json() as { host_id: string; category: string; maxPlayers: number; numImposters: number };
  // Expect: { host_id, category, maxPlayers, numImposters }
  const { host_id, category, maxPlayers, numImposters } = body;
  if (!host_id || !category || !maxPlayers || !numImposters) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }
  const now = new Date();
  const game = await db.insert(imposter).values({
    host_id, // host_id is now directly from the request body and must be a UUID
    category,
    max_players: Number(maxPlayers),
    num_imposters: Number(numImposters),
    player_ids: [host_id],
    created_at: now,
    game_data: null,
  }).returning();
  return NextResponse.json({ success: true, game: game[0] });
}
