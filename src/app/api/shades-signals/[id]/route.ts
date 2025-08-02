import { NextRequest, NextResponse } from "next/server";
import { db } from "~/server/db/index";
import { shadesSignals } from "~/server/db/schema";
import { eq } from "drizzle-orm";
import type { ShadesSignalsGameData } from "~/lib/types/shades-signals";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { id } = params;
    const game = await db.query.shadesSignals.findFirst({
      where: eq(shadesSignals.id, id)
    });

    if (!game) {
      return NextResponse.json({ error: "Game not found" }, { status: 404 });
    }

    // Return the game data in the expected format
    const gameData = game.game_data as ShadesSignalsGameData;

    return NextResponse.json({
      success: true,
      game: game,
      gameData: gameData
    });
  } catch (error) {
    console.error("Get game error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
