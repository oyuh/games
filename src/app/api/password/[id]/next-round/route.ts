import { NextRequest, NextResponse } from "next/server";
import { db } from "~/server/db";
import { password } from "~/server/db/schema";
import { eq } from "drizzle-orm";
import { imposterCategories } from "~/data/categoryList";

// Helper function to get random elements from array
function getRandomElements<T>(array: T[], count: number): T[] {
  return shuffle(array).slice(0, count);
}

// Helper function to shuffle arrays
function shuffle<T>(array: T[]): T[] {
  const newArray = [...array];
  for (let i = newArray.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
  }
  return newArray;
}

// Helper function to pick categories for voting
function getRandomCategories(count: number) {
  const allCategoryKeys = Object.keys(imposterCategories);
  const selectedKeys = getRandomElements(allCategoryKeys, count);

  return selectedKeys.map(key => ({
    id: key,
    name: imposterCategories[key].displayName,
    votes: 0
  }));
}

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
      return NextResponse.json({ error: "Only the host can start the next round" }, { status: 403 });
    }

    // Verify game is in the round-results phase (using game_data instead of round_data)
    if (!game.game_data || game.game_data.phase !== "round-results") {
      return NextResponse.json({
        error: "Not in round results phase",
        phase: game.game_data?.phase
      }, { status: 400 });
    }

    // Check if there's a game winner
    if (game.round_data?.gameWinner) {
      return NextResponse.json({
        error: "Game is already finished",
        winner: game.round_data.gameWinner
      }, { status: 400 });
    }

    // Get round data from current game
    const roundData = game.round_data || {};
    // Also get game data which contains the actual state
    const gameData = game.game_data || {};

    // Always preserve pointsToWin
    const pointsToWin = gameData.pointsToWin || game.game_data?.pointsToWin || 5;
    gameData.pointsToWin = pointsToWin;

    // Check for a winner before starting the next round
    let winningTeams: string[] = [];
    if (gameData.teamScores) {
      const maxScore = Math.max(...Object.values(gameData.teamScores));
      if (maxScore >= pointsToWin) {
        winningTeams = Object.entries(gameData.teamScores)
          .filter(([_, score]) => score === maxScore)
          .map(([team]) => team);
        // Set finished_at and winningTeams in game_data
        await db.update(password).set({
          game_data: {
            ...gameData,
            finished_at: new Date().toISOString(),
            winningTeams,
            pointsToWin // ensure it's present in the final state
          }
        }).where(eq(password.id, params.id));
        // Return early with winner info
        return NextResponse.json({
          success: true,
          finished: true,
          winningTeams,
          game: {
            ...game,
            game_data: {
              ...gameData,
              finished_at: new Date().toISOString(),
              winningTeams,
              pointsToWin
            }
          }
        });
      }
    }

    // Archive current round data to history if needed
    const history = [...(gameData.roundHistory || [])];
    const currentRoundSummary = {
      round: gameData.round || 1,
      roundGuessCount: gameData.roundGuessCount || {},
      roundSummary: gameData.roundSummary ? gameData.roundSummary[gameData.round || 1] : null,
      teamScores: gameData.teamScores || {}
    };
    history.push(currentRoundSummary);

    // Set up the next round's turn order
    const teams = game.teams as Record<string, string[]>;
    const teamKeys = Object.keys(teams).filter(key => key !== "noTeam");

    // Set up the new round's per-team data
    const perTeam: Record<string, { category: string | null; word: string | null; guesser: string; clueGiver: string }> = {};
    for (const team of teamKeys) {
      // Rotate roles: swap guesser and clueGiver
      let prevGuesser = roundData.perTeam?.[team]?.guesser || teams[team][0];
      let prevClueGiver = roundData.perTeam?.[team]?.clueGiver || teams[team][1];
      perTeam[team] = {
        category: null,
        word: null,
        guesser: prevClueGiver, // swap
        clueGiver: prevGuesser  // swap
      };
    }

    // Set up the new round data
    const nextRound = (roundData.currentRound || 1) + 1;
    const updatedRoundData = {
      currentRound: nextRound,
      phase: "category_voting",
      history: history,
      teamScores: roundData.teamScores || {},
      votedCategories: {},
      perTeam, // NEW: per-team round data
      turnOrder: roundData.turnOrder || teamKeys,
      // Remove global currentCategory/currentWord/activeTeam
      clues: [],
      guesses: [],
      roundWinner: "",
      gameWinner: ""
    };

    // Update the game in the database with both updated round_data and game_data
    const updatedGameData = {
      ...gameData,
      phase: "category-selection", // Set the correct phase for the UI
      round: nextRound,
      teamPhases: Object.fromEntries(teamKeys.map(team => [team, "category-selection"])),
      categoryVotes: {}, // Clear previous votes
      selectedWords: {}, // Clear previous selected words
      currentCategory: null, // Clear global category (teams will have their own)
      clues: {}, // Reset clues for the new round
      guesses: {}, // Reset guesses for the new round
      roundHistory: history,
      // Update teamRoles to match the swapped roles in perTeam
      teamRoles: Object.fromEntries(teamKeys.map(team => [
        team,
        {
          clueGiver: perTeam[team].clueGiver,
          guesser: perTeam[team].guesser
        }
      ])),
      pointsToWin // ensure it's present in the next round
    };

    await db
      .update(password)
      .set({
        round_data: updatedRoundData,
        game_data: updatedGameData
      })
      .where(eq(password.id, params.id));

    // Return the updated game
    const updatedGame = await db.query.password.findFirst({
      where: eq(password.id, params.id),
    });

    return NextResponse.json({ success: true, game: updatedGame });
  } catch (error) {
    console.error("Error starting next round:", error);
    return NextResponse.json(
      { error: "Failed to start next round", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
