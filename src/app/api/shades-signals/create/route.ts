import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { db } from "~/server/db/index";
import { shadesSignals } from "~/server/db/schema";

function generateGameCode(length = 6) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < length; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

export async function POST(req: NextRequest) {
  const body = await req.json() as { host_id: string; settings?: any };
  const { host_id, settings } = body;
  if (!host_id) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const code = generateGameCode();
  const game = await db.insert(shadesSignals).values({
    host_id,
    player_ids: [host_id],
    game_data: settings || null,
    created_at: now,
    expires_at: expiresAt,
    code,
  }).returning();
  return NextResponse.json({ success: true, game: game[0] });
}
