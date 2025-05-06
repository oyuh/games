import { NextRequest, NextResponse } from "next/server";
import { db } from "~/server/db/index";
import { shadesSignals } from "~/server/db/schema"; // <-- FIX THIS PATH if incorrect
import { eq } from "drizzle-orm";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { id } = params;
  const { player_id } = await req.json();
  if (!player_id) return NextResponse.json({ error: "Missing player_id" }, { status: 400 });
  const game = await db.query.shadesSignals.findFirst({ where: eq(shadesSignals.id, id) });
  if (!game) return NextResponse.json({ error: "Game not found" }, { status: 404 });
  if (game.player_ids.includes(player_id)) return NextResponse.json({ game });
  const updated = await db.update(shadesSignals)
    .set({ player_ids: [...game.player_ids, player_id] })
    .where(eq(shadesSignals.id, id))
    .returning();
  return NextResponse.json({ game: updated[0] });
}
