import { NextRequest, NextResponse } from "next/server";
import { db } from "../../../../../server/db/index";
import { password } from "../../../../../server/db/schema";
import { eq } from "drizzle-orm";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const sessionId = req.cookies.get("session_id")?.value;
  if (!sessionId) return NextResponse.json({ error: "No session" }, { status: 401 });

  const game = await db.query.password.findFirst({ where: eq(password.id, params.id) });
  if (!game) return NextResponse.json({ error: "Game not found" }, { status: 404 });
  if (game.host_id !== sessionId) return NextResponse.json({ error: "Not host" }, { status: 403 });
  if (game.started_at) return NextResponse.json({ error: "Game already started" }, { status: 400 });

  // Ensure all teams have exactly 2 players (this is a requirement for password game)
  const teams = game.teams as Record<string, string[]>;
  for (const teamKey in teams) {
    // Skip "noTeam" which contains players not assigned to teams yet
    if (teamKey === "noTeam") continue;

    if (teams[teamKey].length !== 2) {
      return NextResponse.json(
        { error: "All teams must have exactly 2 players to start the game" },
        { status: 400 }
      );
    }
  }

  // --- TEAM LOGIC START ---
  // Prepare per-team round data structure
  const round_data: Record<string, {
    category: string | null;
    word: string | null;
    guesser: string | null;
    clueGiver: string | null;
  }> = {};
  Object.keys(teams).forEach(teamKey => {
    if (teamKey !== "noTeam") {
      // For now, initialize as null; will be set after voting/selection
      round_data[teamKey] = {
        category: null,
        word: null,
        guesser: teams[teamKey][0] || null,
        clueGiver: teams[teamKey][1] || null
      };
    }
  });
  // --- TEAM LOGIC END ---

  // Initialize game_data for first round
  const initialGameData = {
    round: 1,
    phase: "category-selection", // Initial game phase
    teamPhases: {}, // Track team-specific phases
    categoryVotes: {}, // Track category votes
    currentCategory: null, // legacy, not used with per-team
    selectedWords: {}, // legacy, not used with per-team
    currentTeam: null, // legacy, not used with per-team
    scores: {},
    roundHistory: [],
    round_data, // NEW: per-team round data
    pointsToWin: game.game_data?.pointsToWin || 5 // <-- preserve pointsToWin
  };

  // Initialize scores and team phases for all teams
  const scores = {};
  const teamPhases = {};
  Object.keys(teams).forEach(teamKey => {
    if (teamKey !== "noTeam") {
      scores[teamKey] = 0;
      teamPhases[teamKey] = "category-selection"; // Initial phase for each team
    }
  });

  initialGameData.scores = scores;
  initialGameData.teamPhases = teamPhases;

  // Mark game as started and set initial game data
  await db.update(password)
    .set({
      started_at: new Date(),
      game_data: initialGameData,
    })
    .where(eq(password.id, params.id));

  // Return success response
  return NextResponse.json({ success: true });
}
