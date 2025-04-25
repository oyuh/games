import { NextRequest, NextResponse } from "next/server";
import { db } from "~/server/db";
import { password_game } from "~/server/db/schema";
import { eq } from "drizzle-orm";

type Player = { id: string; name: string };
type Team = { id: number; name: string; players: Player[]; score: number };
type TeamData = { teams: Team[] };

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const gameId = searchParams.get("gameId");
  if (!gameId) {
    return NextResponse.json({ error: "Missing gameId" }, { status: 400 });
  }
  const game = await db.query.password_game.findFirst({ where: eq(password_game.id, gameId) });
  if (!game) {
    return NextResponse.json({ error: "Game not found" }, { status: 404 });
  }
  const teamData: TeamData = game.team_data ?? { teams: [] };
  const teams = (teamData.teams ?? []).map((t, idx) => ({
    id: t.id ?? idx,
    name: t.name ?? `Team ${idx + 1}`,
    players: t.players ?? [],
    score: t.score ?? 0,
  }));
  const players = teams.flatMap((t) => t.players.map((p) => ({ ...p, teamId: t.id })));
  return NextResponse.json({
    code: game.code,
    hostId: game.host_id,
    teams,
    players,
  });
}

export async function POST(req: NextRequest) {
  try {
    const { gameId, playerId, playerName, teamId, leaveTeam } = await req.json();
    if (!gameId || !playerId) {
      return NextResponse.json({ error: "Missing gameId or playerId" }, { status: 400 });
    }
    const game = await db.query.password_game.findFirst({ where: eq(password_game.id, gameId) });
    if (!game) return NextResponse.json({ error: "Game not found" }, { status: 404 });
    const teamData: TeamData = game.team_data ?? { teams: [] };
    // Remove player from all teams (for switching or leaving)
    for (const team of teamData.teams) {
      team.players = (team.players ?? []).filter((p) => p.id !== playerId);
    }
    if (!leaveTeam) {
      let targetTeam: Team | undefined;
      if (teamId) {
        targetTeam = teamData.teams.find((t) => t.id === teamId);
      } else {
        targetTeam = teamData.teams.find((t) => (t.players?.length ?? 0) < 2);
      }
      if (!targetTeam) {
        return NextResponse.json({ error: "No available team" }, { status: 400 });
      }
      targetTeam.players = [
        ...(targetTeam.players ?? []),
        { id: playerId, name: playerName ?? "Player" },
      ];
    }
    await db.update(password_game)
      .set({ team_data: teamData })
      .where(eq(password_game.id, gameId));
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed to join/leave team" }, { status: 500 });
  }
}
