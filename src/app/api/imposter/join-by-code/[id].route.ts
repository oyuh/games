// In src/app/api/imposter/join-by-code/[code]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { db } from "../../../../server/db/index";
import { imposter } from "../../../../server/db/schema";
import { eq } from "drizzle-orm";

export async function POST(req: NextRequest, { params }: { params: { code: string } }) {
  const sessionId = req.cookies.get("session_id")?.value;
  if (!sessionId) return NextResponse.json({ error: "No session" }, { status: 401 });
  const game = await db.query.imposter.findFirst({ where: eq(imposter.code, params.code.toUpperCase()) });
  if (!game) return NextResponse.json({ error: "Game not found" }, { status: 404 });
  if (game.started_at) {
    return NextResponse.json({ error: "Game is in progress" }, { status: 403 });
  }
  if (!game.player_ids.includes(sessionId)) {
    // Set expiration date one hour from now
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 1);

    await db.update(imposter)
      .set({
        player_ids: [...game.player_ids, sessionId],
        expires_at: expiresAt
      })
      .where(eq(imposter.id, game.id));
  }
  return NextResponse.json({ success: true, id: game.id });
}
