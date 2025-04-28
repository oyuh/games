import { NextRequest, NextResponse } from "next/server";
import { db } from "~/server/db";
import { password } from "~/server/db/schema";
import { eq } from "drizzle-orm";
import { imposterCategories } from "~/data/categoryList";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const sessionId = req.cookies.get("session_id")?.value;
  if (!sessionId) return NextResponse.json({ error: "No session" }, { status: 401 });

  try {
    // Parse request body
    const { category } = await req.json();
    if (!category) {
      return NextResponse.json({ error: "Category is required" }, { status: 400 });
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

    // Initialize game_data if it doesn't exist
    const gameData = game.game_data || {
      round: 1,
      phase: "category-selection",
      teamPhases: {},
      categoryVotes: {},
      currentCategory: null,
      selectedWords: {},
      currentTeam: null,
      scores: {},
      roundHistory: []
    };

    // Initialize teamPhases if it doesn't exist
    if (!gameData.teamPhases) {
      gameData.teamPhases = {};
      Object.keys(teams).forEach(teamKey => {
        if (teamKey !== "noTeam") {
          gameData.teamPhases[teamKey] = "category-selection";
        }
      });
    }

    // Record the vote
    gameData.categoryVotes = {
      ...(gameData.categoryVotes || {}),
      [sessionId]: category
    };

    // Check if both teammates have voted
    const teammateIds = teams[playerTeam];
    const hasAllTeammatesVoted = teammateIds.every(id =>
      gameData.categoryVotes && id in gameData.categoryVotes
    );

    // If both teammates have voted, check if they voted the same
    if (hasAllTeammatesVoted) {
      const teammateVotes = teammateIds.map(id => gameData.categoryVotes[id]);

      // If they voted the same, use that category
      let chosenCategory: string;
      if (teammateVotes[0] === teammateVotes[1]) {
        chosenCategory = teammateVotes[0];
      } else {
        // If they didn't vote the same, randomly choose one
        const randomIndex = Math.floor(Math.random() * 2);
        chosenCategory = teammateVotes[randomIndex];
      }

      // Find the category key in imposterCategories
      const categoryKey = Object.keys(imposterCategories).find(
        key => imposterCategories[key].displayName === chosenCategory
      );
      if (!categoryKey) {
        return NextResponse.json({ error: "Invalid category selected" }, { status: 400 });
      }
      // Randomly select a word from the category
      const items = imposterCategories[categoryKey].items;
      const randomWord = items[Math.floor(Math.random() * items.length)];

      // Randomly assign clue giver and guesser
      const shuffled = [...teammateIds].sort(() => Math.random() - 0.5);
      const clueGiver = shuffled[0];
      const guesser = shuffled[1];

      // Update per-team round_data
      if (!game.round_data) game.round_data = { perTeam: {} };
      if (!game.round_data.perTeam) game.round_data.perTeam = {};
      game.round_data.perTeam[playerTeam] = {
        category: chosenCategory,
        word: randomWord,
        clueGiver,
        guesser
      };

      // Make sure game_data.round_data exists for team-specific data
      if (!gameData.round_data) gameData.round_data = {};
      // Store the category for this specific team
      gameData.round_data[playerTeam] = {
        category: chosenCategory,
        word: randomWord,
        clueGiver,
        guesser
      };

      // Update teamPhases and global phase
      gameData.teamPhases[playerTeam] = "clue-giving";
      // For backwards compatibility, also update the global phase if all teams are in the same phase
      const allTeamsPhases = Object.entries(gameData.teamPhases)
        .filter(([teamKey]) => teamKey !== "noTeam")
        .map(([_, phase]) => phase);
      if (allTeamsPhases.every(phase => phase === "clue-giving")) {
        gameData.phase = "clue-giving";
      }
      // Also update teamRoles for UI compatibility
      if (!gameData.teamRoles) gameData.teamRoles = {};
      gameData.teamRoles[playerTeam] = { clueGiver, guesser };
      // Store category for this team for legacy compatibility
      if (!gameData.selectedWords) gameData.selectedWords = {};
      gameData.selectedWords[playerTeam] = randomWord;
      // Store category for this team for legacy compatibility
      if (!gameData.currentCategory) gameData.currentCategory = chosenCategory;
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

    return NextResponse.json({
      success: true,
      game: updatedGame
    });
  } catch (error) {
    console.error("Error voting for category:", error);
    return NextResponse.json(
      { error: "Failed to vote for category", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
