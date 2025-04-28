import { NextRequest, NextResponse } from "next/server";
import { db } from "~/server/db";
import { password } from "~/server/db/schema";
import { eq } from "drizzle-orm";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const sessionId = req.cookies.get("session_id")?.value;
  if (!sessionId) return NextResponse.json({ error: "No session" }, { status: 401 });

  try {
    // Find game by ID
    const game = await db.query.password.findFirst({
      where: eq(password.id, params.id),
    });

    if (!game) {
      return NextResponse.json({ error: "Game not found" }, { status: 404 });
    }

    // Check if the user is the host
    if (game.host_id !== sessionId) {
      return NextResponse.json({ error: "Only the host can end the round" }, { status: 403 });
    }

    // Check if game data exists
    if (!game.game_data) {
      return NextResponse.json({ error: "Game hasn't been properly initialized" }, { status: 400 });
    }

    const gameData = game.game_data;

    // Check if at least one team is in round-results phase (meaning they guessed correctly)
    const allTeams = Object.keys(gameData.teamPhases || {}).filter(key => key !== "noTeam");
    const anyTeamFinished = allTeams.some(team => gameData.teamPhases?.[team] === "round-results");

    if (!anyTeamFinished) {
      return NextResponse.json({
        error: "No team has completed the round yet. At least one team needs to guess correctly before ending the round."
      }, { status: 400 });
    }

    // For teams that haven't completed yet, record their current progress
    for (const team of allTeams) {
      if (gameData.teamPhases[team] !== "round-results") {
        // Count how many guesses this team has made
        const teamGuesses = gameData.guesses?.[team]?.length || 0;

        // Record their progress
        if (!gameData.roundGuessCount) gameData.roundGuessCount = {};
        gameData.roundGuessCount[team] = teamGuesses;

        // Move all teams to round-results phase
        gameData.teamPhases[team] = "round-results";
      }
    }

    // Calculate scores once all teams have been moved to results
    // Find the minimum number of guesses among teams that guessed correctly
    const teamsWithCorrectGuesses = Object.keys(gameData.roundGuessCount || {}).filter(team => {
      // Check if this team has any correct guess
      return gameData.guesses?.[team]?.some(guess =>
        typeof guess === 'object' && guess.correct
      );
    });

    if (teamsWithCorrectGuesses.length > 0) {
      // Calculate minimum guesses among teams that guessed correctly
      const correctGuessCountEntries = teamsWithCorrectGuesses.map(team => [team, gameData.roundGuessCount?.[team] || 999]);
      const minGuessCount = Math.min(...correctGuessCountEntries.map(([_, count]) => count as number));

      // Find all teams that achieved the minimum count
      const winningTeams = correctGuessCountEntries
        .filter(([_, count]) => count === minGuessCount)
        .map(([team]) => team as string);

      // Award points to the winning teams
      if (!gameData.teamScores) gameData.teamScores = {};
      winningTeams.forEach(team => {
        if (!gameData.teamScores![team]) gameData.teamScores![team] = 0;
        gameData.teamScores![team] += 1;
      });

      // Add round summary to track results
      if (!gameData.roundSummary) gameData.roundSummary = {};
      gameData.roundSummary[gameData.round || 1] = {
        winningTeams,
        minGuesses: minGuessCount,
        teamGuesses: { ...gameData.roundGuessCount }
      };
    }

    // Set global phase to round-results
    gameData.phase = "round-results";

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
    console.error("Error ending round:", error);
    return NextResponse.json(
      { error: "Failed to end round", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
