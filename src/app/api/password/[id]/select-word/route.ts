import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { db } from "~/server/db";
import { password } from "~/server/db/schema";
import { eq } from "drizzle-orm";
import { imposterCategories } from "~/data/categoryList";

interface Game {
  id: string;
  game_data: unknown;
  round_data: unknown;
  teams: Record<string, string[]>;
}

interface RequestBody {
  word: unknown;
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const sessionId = req.cookies.get("session_id")?.value;
  if (!sessionId) return NextResponse.json({ error: "No session" }, { status: 401 });

  try {
    // Parse request body
    const body = await req.json() as RequestBody;
    if (!body.word || typeof body.word !== "string") {
      return NextResponse.json({ error: "Word is required" }, { status: 400 });
    }
    const word = body.word;

    // Find game by ID
    const game = await db.query.password.findFirst({
      where: eq(password.id, params.id),
    });

    if (!game) {
      return NextResponse.json({ error: "Game not found" }, { status: 404 });
    }

    // Check if game data exists
    if (!game.game_data) {
      return NextResponse.json({ error: "Game hasn't been properly initialized" }, { status: 400 });
    }

    // Type assertions for dynamic JSON fields
    interface GameData {
      teamPhases: Record<string, string>;
      teamRoles: Record<string, { clueGiver: string; guesser: string }>;
      selectedWords: Record<string, { word: string }>;
      phase: string;
      currentRound?: number;
      rounds?: RoundData[];
    }

    interface RoundData {
      perTeam: Record<string, { word: string }>;
      phase: string;
      startTime?: string;
      endTime?: string;
    }

    const gameData = game.game_data as GameData;
    const roundData = (game.round_data ?? {}) as RoundData;
    const teams = game.teams as Record<string, string[]>;

    // Use nullish coalescing for safer property access
    const teamPhases = gameData.teamPhases ?? {};
    const teamRoles = gameData.teamRoles ?? {};
    const selectedWords = gameData.selectedWords ?? {};

    // Make sure the player is in one of the teams
    const playerTeam = Object.entries(teams).find(([_, players]) => players.includes(sessionId))?.[0];

    if (!playerTeam) {
      return NextResponse.json({ error: "You are not in a team" }, { status: 400 });
    }

    // Verify team is in the word-selection phase
    if (teamPhases[playerTeam] !== "word-selection") {
      return NextResponse.json({
        error: "Your team is not in word selection phase",
        phase: teamPhases[playerTeam]
      }, { status: 400 });
    }

    // Check if team roles are assigned
    if (!teamRoles[playerTeam]) {
      const teamMembers = teams[playerTeam] ?? [];
      if (teamMembers.length < 2) {
        return NextResponse.json({ error: "Not enough team members to assign roles" }, { status: 400 });
      }
      const randomIndex = Math.floor(Math.random() * 2);
      teamRoles[playerTeam] = {
        clueGiver: teamMembers[randomIndex] ?? "",
        guesser: teamMembers[1 - randomIndex] ?? ""
      };
    }

    // Check if current user is the clue giver for their team
    if (teamRoles[playerTeam]?.clueGiver !== sessionId) {
      return NextResponse.json({ error: "Only the clue giver can select a word" }, { status: 403 });
    }

    // Store selected word for this team
    selectedWords[playerTeam] ??= { word: "" };
    selectedWords[playerTeam].word = word;

    // Ensure perTeam and perTeam[playerTeam] are initialized
    roundData.perTeam ??= {};
    roundData.perTeam[playerTeam] ??= { word: "" };
    roundData.perTeam[playerTeam].word = word;

    // Update this team's phase to clue-giving phase
    teamPhases[playerTeam] = "clue-giving";

    // For backwards compatibility, also update the global phase if all teams are in the same phase
    const allTeamsPhases = Object.entries(teamPhases)
      .filter(([teamKey]) => teamKey !== "noTeam")
      .map(([_, phase]) => phase);

    if (allTeamsPhases.every(phase => phase === "clue-giving")) {
      gameData.phase = "clue-giving";
    }

    // Update the game in the database
    await db
      .update(password)
      .set({
        game_data: gameData,
        round_data: roundData, // <-- persist round_data changes too
      })
      .where(eq(password.id, params.id));

    // Return the updated game
    const updatedGame = await db.query.password.findFirst({
      where: eq(password.id, params.id),
    });

    return NextResponse.json({ success: true, game: updatedGame });
  } catch (error) {
    console.error("Error selecting word:", error);
    return NextResponse.json(
      { error: "Failed to select word", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
