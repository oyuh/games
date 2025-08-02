import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { db } from "~/server/db";
import { password } from "~/server/db/schema";
import { eq } from "drizzle-orm";
import stringSimilarity from "string-similarity";
import type { PasswordGameData, PasswordRoundData } from "~/lib/types/password";

interface RequestBody {
  guess: string;
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
    const { guess } = body;
    if (!guess || typeof guess !== "string") {
      return NextResponse.json({ error: "Guess is required" }, { status: 400 });
    }

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

    const gameData = game.game_data as PasswordGameData;
    const roundData = game.round_data as PasswordRoundData | undefined;

    // Make sure the player is in one of the teams
    const teams = game.teams as Record<string, string[]>;
    const playerTeam = Object.entries(teams).find(([_, players]) => players?.includes(sessionId))?.[0];

    if (!playerTeam) {
      return NextResponse.json({ error: "You are not in a team" }, { status: 400 });
    }

    // Check if team roles are assigned
    if (!gameData.teamRoles?.[playerTeam]) {
      return NextResponse.json({ error: "Team roles haven't been assigned" }, { status: 400 });
    }

    // Check if current user is the guesser for their team
    if (gameData.teamRoles[playerTeam]?.guesser !== sessionId) {
      return NextResponse.json({ error: "Only the guesser can submit a guess" }, { status: 403 });
    }

    // Get target word for this team
    let targetWord: string | undefined;
    const selectedWordEntry = gameData.selectedWords?.[playerTeam];
    if (typeof selectedWordEntry === "string") {
      targetWord = selectedWordEntry;
    }

    // fallback to perTeam round_data
    if (!targetWord && roundData?.perTeam?.[playerTeam]?.word) {
      targetWord = roundData.perTeam[playerTeam]?.word ?? undefined;
    }

    if (!targetWord) {
      return NextResponse.json({
        error: "No target word found for your team. Debug info:",
        checked: {
          selectedWords: gameData.selectedWords?.[playerTeam],
          roundData: roundData?.perTeam?.[playerTeam]
        },
        message: "If you see this error but a word is selected, please check the structure of gameData.selectedWords and game.round_data.perTeam."
      }, { status: 400 });
    }

    // Store the guess for this team
    gameData.guesses ??= {};
    gameData.guesses[playerTeam] ??= [];
    gameData.roundGuessCount ??= {};
    gameData.roundGuessCount[playerTeam] ??= 0;

    const trimmedGuess = guess.trim().toLowerCase();
    const normalizedTargetWord = targetWord.toLowerCase();

    // Improved similarity check that handles phrases better
    const similarityScore = stringSimilarity.compareTwoStrings(
      trimmedGuess,
      normalizedTargetWord
    );

    // Store the guess and increment the guess count
    gameData.guesses[playerTeam]?.push(guess);
    gameData.roundGuessCount[playerTeam] += 1;

    // Update game data with the new guess
    await db.update(password)
      .set({ game_data: gameData })
      .where(eq(password.id, params.id));

    return NextResponse.json({
      success: true,
      similarity: similarityScore,
      correct: similarityScore > 0.8
    });
  } catch (error) {
    console.error("Error submitting guess:", error);
    return NextResponse.json(
      { error: "Failed to submit guess", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
