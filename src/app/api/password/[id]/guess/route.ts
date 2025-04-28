import { NextRequest, NextResponse } from "next/server";
import { db } from "~/server/db";
import { password } from "~/server/db/schema";
import { eq } from "drizzle-orm";
import stringSimilarity from 'string-similarity';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const sessionId = req.cookies.get("session_id")?.value;
  if (!sessionId) return NextResponse.json({ error: "No session" }, { status: 401 });

  try {
    // Parse request body
    const { guess } = await req.json();
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

    // Make sure the player is in one of the teams
    const teams = game.teams as Record<string, string[]>;
    let playerTeam = null;

    for (const teamKey in teams) {
      if (teamKey !== "noTeam" && teams[teamKey].includes(sessionId)) {
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

    const gameData = game.game_data;

    // Verify team is in the guessing phase
    if (!gameData.teamPhases || gameData.teamPhases[playerTeam] !== "guessing") {
      return NextResponse.json({
        error: "Your team is not in guessing phase",
        phase: gameData.teamPhases?.[playerTeam]
      }, { status: 400 });
    }

    // Check if team roles are assigned
    if (!gameData.teamRoles || !gameData.teamRoles[playerTeam]) {
      return NextResponse.json({ error: "Team roles haven't been assigned" }, { status: 400 });
    }

    // Check if current user is the guesser for their team
    if (gameData.teamRoles[playerTeam].guesser !== sessionId) {
      return NextResponse.json({ error: "Only the guesser can submit a guess" }, { status: 403 });
    }

    // Get target word for this team
    let targetWord: string | undefined = undefined;
    const selectedWordEntry = gameData.selectedWords?.[playerTeam];
    if (typeof selectedWordEntry === "string") {
      targetWord = selectedWordEntry;
    } else if (selectedWordEntry && typeof selectedWordEntry === "object" && selectedWordEntry.word) {
      targetWord = selectedWordEntry.word;
    }
    // fallback to perTeam round_data
    if (!targetWord && game.round_data && game.round_data.perTeam && game.round_data.perTeam[playerTeam]) {
      targetWord = game.round_data.perTeam[playerTeam].word;
    }
    if (!targetWord) {
      return NextResponse.json({
        error: "No target word found for your team. Debug info:",
        checked: {
          selectedWords: gameData.selectedWords?.[playerTeam],
          roundData: game.round_data?.perTeam?.[playerTeam]
        },
        message: "If you see this error but a word is selected, please check the structure of gameData.selectedWords and game.round_data.perTeam."
      }, { status: 400 });
    }

    // Store the guess for this team
    if (!gameData.guesses) gameData.guesses = {};
    if (!gameData.guesses[playerTeam]) gameData.guesses[playerTeam] = [];

    const trimmedGuess = guess.trim().toLowerCase();
    const normalizedTargetWord = targetWord.toLowerCase();

    // Improved similarity check that handles phrases better
    let similarity = stringSimilarity.compareTwoStrings(
      trimmedGuess,
      normalizedTargetWord
    );

    // Special handling for multi-word phrases
    if (normalizedTargetWord.includes(" ")) {
      // Split the target into individual words
      const targetWords = normalizedTargetWord.split(/\s+/);

      // Check if any single word in the target matches with high similarity
      for (const word of targetWords) {
        if (word.length > 2) { // Only check meaningful words (not "a", "of", etc)
          const wordSimilarity = stringSimilarity.compareTwoStrings(
            trimmedGuess,
            word
          );
          // If there's a very strong match to one meaningful word in the phrase
          if (wordSimilarity >= 0.9) {
            similarity = Math.max(similarity, 0.8); // Consider it close enough
            break;
          }
        }
      }
    }

    // Record the guess along with similarity score
    gameData.guesses[playerTeam].push({
      word: trimmedGuess,
      similarity,
      correct: trimmedGuess === normalizedTargetWord || similarity >= 0.8
    });

    let isCorrect = false;
    let isCloseEnough = false;

    // Check if guess matches target word exactly or is close enough (80% similar)
    if (trimmedGuess === normalizedTargetWord || similarity >= 0.8) {
      isCorrect = true;
      isCloseEnough = similarity >= 0.8 && trimmedGuess !== normalizedTargetWord;
      // Track the number of guesses it took this team to get the correct answer
      const numGuesses = gameData.guesses[playerTeam].length;
      if (!gameData.roundGuessCount) gameData.roundGuessCount = {};
      gameData.roundGuessCount[playerTeam] = numGuesses;
      gameData.teamPhases[playerTeam] = "round-results";
    } else {
      // Not correct, transition back to clue-giving phase
      gameData.teamPhases[playerTeam] = "clue-giving";
    }

    // --- IMPROVED ROUND END LOGIC: Ensure all teams get equal number of turns ---
    const allTeams = Object.keys(teams).filter(key => key !== "noTeam");

    // Initialize tracking for current round if needed
    if (!gameData.currentRoundState) {
      gameData.currentRoundState = {
        targetGuessCount: 1,        // All teams should reach this many guesses
        teamsFinished: [],          // Teams that have completed their turns for this count
        anyCorrectGuess: false      // Whether any team has guessed correctly
      };
    }

    // Track the current guess count for this team
    const currentTeamGuessCount = gameData.guesses[playerTeam]?.length || 0;

    // Check if this team has reached or exceeded the target guess count
    if (currentTeamGuessCount >= gameData.currentRoundState.targetGuessCount &&
        !gameData.currentRoundState.teamsFinished.includes(playerTeam)) {
      gameData.currentRoundState.teamsFinished.push(playerTeam);
    }

    // Check if this team's guess was correct
    if (isCorrect && !gameData.currentRoundState.anyCorrectGuess) {
      gameData.currentRoundState.anyCorrectGuess = true;
    }

    // Check if all teams have completed their turns for the current target count
    const allTeamsFinishedCurrentTarget = allTeams.length > 0 &&
      gameData.currentRoundState.teamsFinished.length === allTeams.length;

    // Maximum allowed guesses per round (default: 5)
    const maxAllowedGuesses = gameData.maxGuessesPerRound || 5;

    // Detect if we should end the round:
    // 1. All teams have completed their current target count of guesses AND at least one team guessed correctly
    // 2. OR all teams have reached the maximum allowed guesses
    const reachedMaxGuesses = gameData.currentRoundState.targetGuessCount >= maxAllowedGuesses;

    if (allTeamsFinishedCurrentTarget) {
      if (gameData.currentRoundState.anyCorrectGuess || reachedMaxGuesses) {
        // End the round!

        // Identify teams with correct guesses
        const teamsWithCorrectGuesses = allTeams.filter(team => {
          const teamGuesses = gameData.guesses?.[team] || [];
          return teamGuesses.some(g =>
            (typeof g === 'object' && g.correct) ||
            (typeof g === 'string' && g === normalizedTargetWord)
          );
        });

        // Award points to teams that guessed correctly
        if (!gameData.teamScores) gameData.teamScores = {};
        teamsWithCorrectGuesses.forEach(team => {
          if (!gameData.teamScores![team]) gameData.teamScores![team] = 0;
          gameData.teamScores![team] += 1;
        });

        // Add round summary
        if (!gameData.roundGuessCount) gameData.roundGuessCount = {};
        if (!gameData.roundSummary) gameData.roundSummary = {};
        gameData.roundSummary[gameData.round || 1] = {
          winningTeams: teamsWithCorrectGuesses,
          teamGuesses: { ...gameData.roundGuessCount }
        };

        // Move all teams to round-results phase
        for (const team of allTeams) {
          gameData.teamPhases[team] = "round-results";
        }

        // Change global phase to round-results
        gameData.phase = "round-results";

        // Reset the currentRoundState for the next round
        gameData.currentRoundState = null;
      } else {
        // No team has guessed correctly yet, but all have taken their turns.
        // Increase the target count and reset the teams finished list.
        gameData.currentRoundState.targetGuessCount++;
        gameData.currentRoundState.teamsFinished = [];
      }
    }
    // --- END IMPROVED ROUND END LOGIC ---

    // --- WIN LOGIC: Set finished_at and winningTeams if a team reaches points to win ---
    if (!gameData.teamScores) gameData.teamScores = {};
    const pointsToWin = typeof gameData.pointsToWin === 'number' ? gameData.pointsToWin : Number(gameData.pointsToWin) || 5;
    const maxScore = Math.max(...Object.values(gameData.teamScores));
    let gameFinished = false;
    let finishedAt: string | undefined = undefined;
    if (maxScore >= pointsToWin) {
      const winningTeams = Object.entries(gameData.teamScores)
        .filter(([_, score]) => score === maxScore)
        .map(([team]) => team);
      gameData.winningTeams = winningTeams;
      gameFinished = true;
      // Set finished_at at both game_data level and top level, as ISO string
      finishedAt = typeof gameData.finished_at === 'string' ? gameData.finished_at : new Date().toISOString();
      gameData.finished_at = finishedAt;
    }
    // --- END WIN LOGIC ---

    // Update the game in the database
    await db
      .update(password)
      .set({
        game_data: gameData,
        // If game is finished, also update the top-level finished_at field
        ...(gameFinished ? { finished_at: finishedAt } : {})
      })
      .where(eq(password.id, params.id));

    // Return the updated game
    const updatedGame = await db.query.password.findFirst({
      where: eq(password.id, params.id),
    });

    return NextResponse.json({
      success: true,
      correct: isCorrect,
      game: updatedGame
    });
  } catch (error) {
    console.error("Error submitting guess:", error);
    return NextResponse.json(
      { error: "Failed to submit guess", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
