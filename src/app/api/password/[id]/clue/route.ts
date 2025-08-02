import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { db } from "~/server/db";
import { password } from "~/server/db/schema";
import { eq } from "drizzle-orm";
import stringSimilarity from 'string-similarity';
import type { PasswordGameData, PasswordRoundData } from "~/lib/types/password";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const sessionId = req.cookies.get("session_id")?.value;
  if (!sessionId) return NextResponse.json({ error: "No session" }, { status: 401 });

  try {
    // Parse request body
    const { clue } = await req.json() as { clue: string };
    if (!clue || typeof clue !== "string") {
      return NextResponse.json({ error: "Clue is required" }, { status: 400 });
    }

    // Validate that clue is a single word
    const trimmedClue = clue.trim();
    if (trimmedClue.includes(" ")) {
      return NextResponse.json({ error: "Clue must be a single word" }, { status: 400 });
    }

    // Find game by ID
    const game = await db.query.password.findFirst({
      where: eq(password.id, params.id),
    });

    if (!game) {
      return NextResponse.json({ error: "Game not found" }, { status: 404 });
    }

    // Make sure the player is in one of the teams
    const teams = game.teams as Record<string, string[]>;
    let playerTeam: string | null = null;

    for (const teamKey in teams) {
      const teamPlayers = teams[teamKey];
      if (teamKey !== "noTeam" && teamPlayers?.includes(sessionId)) {
        playerTeam = teamKey;
        break;
      }
    }

    if (!playerTeam) {
      return NextResponse.json({ error: "You are not in a team" }, { status: 403 });
    }

    // Check if game data exists
    if (!game.game_data) {
      return NextResponse.json({ error: "Game hasn't been properly initialized" }, { status: 400 });
    }

    const gameData = game.game_data as PasswordGameData;
    const roundData = game.round_data as PasswordRoundData | undefined;

    // Verify team is in the clue-giving phase
    if (!gameData.teamPhases || gameData.teamPhases[playerTeam] !== "clue-giving") {
      return NextResponse.json({
        error: "Your team is not in clue giving phase",
        phase: gameData.teamPhases?.[playerTeam]
      }, { status: 400 });
    }

    // Check if team roles are assigned
    if (!gameData.teamRoles?.[playerTeam]) {
      return NextResponse.json({ error: "Team roles haven't been assigned" }, { status: 400 });
    }

    // Check if current user is the clue giver for their team
    if (gameData.teamRoles[playerTeam]?.clueGiver !== sessionId) {
      return NextResponse.json({ error: "Only the clue giver can submit a clue" }, { status: 403 });
    }

    // Check that clue is not too similar to the target word
    let targetWord: string | undefined = undefined;
    const selectedWordEntry = gameData.selectedWords?.[playerTeam];
    if (typeof selectedWordEntry === "string") {
      targetWord = selectedWordEntry;
    }

    // fallback to perTeam round_data
    if (!targetWord && roundData?.perTeam?.[playerTeam]) {
      targetWord = roundData.perTeam[playerTeam]?.word ?? undefined;
    }

    if (targetWord) {
      const similarity = stringSimilarity.compareTwoStrings(
        trimmedClue.toLowerCase(),
        targetWord.toLowerCase()
      );

      // Reject clues that are too similar to the target word
      if (similarity > 0.7) {
        return NextResponse.json({
          error: "Clue is too similar to the word",
          similarity
        }, { status: 400 });
      }
    } else {
      // Enhanced error message for debugging
      return NextResponse.json({
        error: "No target word found for your team. Debug info:",
        checked: {
          selectedWords: gameData.selectedWords?.[playerTeam],
          roundData: roundData?.perTeam?.[playerTeam]
        },
        message: "If you see this error but a word is selected, please check the structure of gameData.selectedWords and game.round_data.perTeam."
      }, { status: 400 });
    }

    // Store the clue for this team
    gameData.clues ??= {};
    gameData.clues[playerTeam] ??= [];
    gameData.clues[playerTeam]?.push(trimmedClue);

    // Update this team's phase to guessing phase
    gameData.teamPhases[playerTeam] = "guessing";

    // For backwards compatibility, also update the global phase if all teams are in the same phase
    const allTeamsPhases = Object.entries(gameData.teamPhases)
      .filter(([teamKey]) => teamKey !== "noTeam")
      .map(([_, phase]) => phase);

    if (allTeamsPhases.every(phase => phase === "guessing")) {
      gameData.phase = "guessing";
    }

    // Update the game in the database
    await db
      .update(password)
      .set({
        game_data: gameData,
      })
      .where(eq(password.id, params.id));

    // Return the updated game
    const updatedGame = await db.query.password.findFirst({
      where: eq(password.id, params.id),
    });

    return NextResponse.json({ success: true, game: updatedGame });
  } catch (error) {
    console.error("Error submitting clue:", error);
    return NextResponse.json(
      { error: "Failed to submit clue", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
