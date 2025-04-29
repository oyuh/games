import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { db } from "../../../../server/db/index";
import { imposter } from "../../../../server/db/schema";
import { eq } from "drizzle-orm";

function generateGameCode(length = 6) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < length; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

export async function POST(req: NextRequest) {
  const body = await req.json() as { host_id: string; category: string; maxPlayers: number; numImposters: number };
  // Expect: { host_id, category, maxPlayers, numImposters }
  const { host_id, category, maxPlayers, numImposters } = body;
  if (!host_id || !category || !maxPlayers || !numImposters) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000); // Set expiration to 24 hours from creation
  const code = generateGameCode();
  const game = await db.insert(imposter).values({
    host_id, // host_id is now directly from the request body and must be a UUID
    category,
    max_players: Number(maxPlayers),
    num_imposters: Number(numImposters),
    player_ids: [host_id],
    created_at: now,
    expires_at: expiresAt, // Add expiration date
    game_data: null,
    code,
  }).returning();
  return NextResponse.json({ success: true, game: game[0] });
}
