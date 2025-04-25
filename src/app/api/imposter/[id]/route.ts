import { NextRequest, NextResponse } from "next/server";
import { db } from "../../../../server/db/index";
import { imposter, sessions } from "../../../../server/db/schema";
import { eq, inArray } from "drizzle-orm";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const game = await db.query.imposter.findFirst({ where: eq(imposter.id, params.id) });
  if (!game) return NextResponse.json({ error: "Game not found" }, { status: 404 });

  // Collect all unique IDs from player_ids, imposter_ids, and all clues/votes/history
  const allIdsSet = new Set<string>([...(game.player_ids || []), ...(game.imposter_ids || [])]);
  const addIdsFromObj = (obj?: Record<string, any>) => {
    if (obj) for (const k of Object.keys(obj)) allIdsSet.add(k);
  };
  const addIdsFromArr = (arr?: string[]) => {
    if (arr) for (const k of arr) allIdsSet.add(k);
  };
  const gd = game.game_data;
  if (gd) {
    addIdsFromObj(gd.clues);
    addIdsFromObj(gd.votes);
    addIdsFromObj(gd.shouldVoteVotes);
    addIdsFromArr(gd.clueOrder);
    addIdsFromArr(gd.votedOut);
    if (Array.isArray(gd.history)) {
      for (const round of gd.history) {
        addIdsFromObj(round?.clues);
        addIdsFromObj(round?.votes);
        addIdsFromObj(round?.shouldVoteVotes);
        addIdsFromArr(round?.clueOrder);
        addIdsFromArr(round?.votedOut);
      }
    }
  }
  const allIds = Array.from(allIdsSet);
  let playerNames: Record<string, string> = {};
  if (allIds.length > 0) {
    const players = await db.query.sessions.findMany({
      where: inArray(sessions.id, allIds),
      columns: { id: true, entered_name: true },
    });
    for (const p of players) {
      playerNames[p.id] = p.entered_name || "Unknown";
    }
    // Fallback for missing names
    for (const id of allIds) {
      if (!playerNames[id]) playerNames[id] = "Unknown";
    }
  }

  return NextResponse.json({
    game: {
      id: game.id,
      code: game.code, // <-- Add this line to include the join code
      host_id: game.host_id,
      category: game.category,
      max_players: game.max_players,
      num_imposters: game.num_imposters,
      player_ids: game.player_ids,
      started_at: game.started_at,
      imposter_ids: game.imposter_ids,
      chosen_word: game.chosen_word,
      game_data: game.game_data, // <-- add game_data for round/phase logic
      playerNames, // <-- add playerNames mapping directly to game object
    },
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const sessionId = req.cookies.get("session_id")?.value;
  if (!sessionId) return NextResponse.json({ error: "No session" }, { status: 401 });
  // Add player to game if not already present
  const game = await db.query.imposter.findFirst({ where: eq(imposter.id, params.id) });
  if (!game) return NextResponse.json({ error: "Game not found" }, { status: 404 });
  // Prevent joining if game already started
  if (game.started_at) {
    return NextResponse.json({ error: "Game already in progress" }, { status: 403 });
  }
  if (game.player_ids.includes(sessionId)) {
    return NextResponse.json({ success: true, alreadyJoined: true });
  }
  await db.update(imposter)
    .set({ player_ids: [...game.player_ids, sessionId] })
    .where(eq(imposter.id, params.id));
  return NextResponse.json({ success: true });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const sessionId = req.cookies.get("session_id")?.value;
  if (!sessionId) return NextResponse.json({ error: "No session" }, { status: 401 });
  const game = await db.query.imposter.findFirst({ where: eq(imposter.id, params.id) });
  if (!game) return NextResponse.json({ error: "Game not found" }, { status: 404 });
  if (game.host_id !== sessionId) return NextResponse.json({ error: "Not host" }, { status: 403 });
  // Do not delete the game here. Only allow deletion if you want to manually clean up.
  // await db.delete(imposter).where(eq(imposter.id, params.id));
  return NextResponse.json({ success: true, deleted: false });
}

export async function POST_start(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const sessionId = req.cookies.get("session_id")?.value;
  if (!sessionId) return NextResponse.json({ error: "No session" }, { status: 401 });
  const game = await db.query.imposter.findFirst({ where: eq(imposter.id, params.id) });
  if (!game) return NextResponse.json({ error: "Game not found" }, { status: 404 });
  if (game.host_id !== sessionId) return NextResponse.json({ error: "Not host" }, { status: 403 });
  // Mark game as started (set started_at)
  await db.update(imposter)
    .set({ started_at: new Date() })
    .where(eq(imposter.id, params.id));
  return NextResponse.json({ success: true });
}
