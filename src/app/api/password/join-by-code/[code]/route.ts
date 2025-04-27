import { NextRequest, NextResponse } from "next/server";
import { db } from "~/server/db";
import { password_game } from "~/server/db/schema";
import { eq } from "drizzle-orm";

export async function POST(req: NextRequest, { params }: { params: { code: string } }) {
  const sessionId = req.cookies.get("session_id")?.value;
  let enteredName = req.cookies.get("entered_name")?.value;
  if (!sessionId) {
    return NextResponse.json({ error: "No session" }, { status: 401 });
  }
  // If enteredName is not in cookies, look it up from the sessions table
  if (!enteredName) {
    const session = await db.query.sessions.findFirst({ where: eq(password_game.id, sessionId) });
    enteredName = session?.entered_name;
  }
  if (!enteredName) {
    return NextResponse.json({ error: "No name" }, { status: 401 });
  }
  const code = params.code.toUpperCase();
  const game = await db.query.password_game.findFirst({ where: eq(password_game.code, code) });
  if (!game) return NextResponse.json({ error: "Game not found" }, { status: 404 });
  // Optionally, auto-assign to a team with a slot if not already in a team
  let teamData = game.team_data ?? { teams: [] };
  let alreadyJoined = false;
  for (const team of teamData.teams) {
    if (team.players.some((p: any) => p.id === sessionId)) {
      alreadyJoined = true;
      break;
    }
  }
  if (!alreadyJoined) {
    // Find a team with a slot
    const targetTeam = teamData.teams.find((t: any) => (t.players?.length ?? 0) < 2);
    if (targetTeam) {
      targetTeam.players = [
        ...(targetTeam.players ?? []),
        { id: sessionId, name: enteredName },
      ];
      await db.update(password_game)
        .set({ team_data: teamData })
        .where(eq(password_game.id, game.id));
    }
  }

  // Add player to the game if not already in
  if (!game.player_ids.includes(sessionId)) {
    // Set expiration date one hour from now
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 1);

    await db.update(password_game)
      .set({
        player_ids: [...game.player_ids, sessionId],
        expires_at: expiresAt
      })
      .where(eq(password_game.id, game.id));
  }

  return NextResponse.json({ success: true, id: game.id });
}
