import { NextRequest, NextResponse } from "next/server";
import { db } from "~/server/db";
import { password_game } from "~/server/db/schema";
import { eq } from "drizzle-orm";
import { imposterCategories } from "~/data/categoryList";

function getNextClueGiverIdx(team, prevIdx) {
  if (!team.players || team.players.length === 0) return 0;
  return (typeof prevIdx === "number" ? (prevIdx + 1) : 0) % team.players.length;
}

export async function POST(req: NextRequest) {
  const { gameId } = await req.json();
  if (!gameId) return NextResponse.json({ error: "Missing gameId" }, { status: 400 });
  const game = await db.query.password_game.findFirst({ where: eq(password_game.id, gameId) });
  if (!game) return NextResponse.json({ error: "Game not found" }, { status: 404 });

  // Get category and pointsToWin
  const category = game.category || game.game_data?.category || "Animals";
  const pointsToWin = game.game_data?.pointsToWin || 5;
  const teamData = game.team_data ?? { teams: [] };
  const teams = teamData.teams ?? [];

  // Add a phase for picking a category before each round
  if (!game.game_data?.phase || game.game_data?.phase === "category-pick") {
    // Set phase to category-pick and assign leader to pick
    teams.forEach(team => {
      if (!team.leaderId && team.players?.length > 0) {
        team.leaderId = team.players[0].id;
      }
    });
    const gameData = { ...game.game_data, phase: "category-pick", state: "lobby", pointsToWin };
    await db.update(password_game)
      .set({ game_data: gameData, team_data: teamData })
      .where(eq(password_game.id, gameId));
    return NextResponse.json({ success: true, phase: "category-pick", leaders: teams.map(t => ({ teamId: t.id, leaderId: t.leaderId })) });
  }

  // --- Add round recap and history tracking ---
  // If the previous round just finished, add it to history before starting a new round
  let gameData = { ...game.game_data, pointsToWin };
  let roundNum = (game.round_data?.round ?? 0) + 1;
  if (game.round_data && game.round_data.finished) {
    // Add previous round to history
    if (!gameData.history) gameData.history = [];
    gameData.history.push({
      round: game.round_data.round,
      secretWord: game.round_data.secretWord,
      clueGivers: game.round_data.clueGivers,
      guesses: game.round_data.guesses,
      winner: game.round_data.winner,
      teams: (game.team_data?.teams ?? []).map(t => ({
        id: t.id,
        players: t.players,
        clueGiverId: t.clueGiverId,
        roundPoints: t.roundPoints,
        score: t.score,
        leaderId: t.leaderId,
        category: t.category,
      })),
    });
    // Set phase to 'recap' before next round
    gameData.phase = "recap";
    await db.update(password_game)
      .set({ game_data: gameData })
      .where(eq(password_game.id, gameId));
    return NextResponse.json({ success: true, phase: "recap", recap: gameData.history[gameData.history.length - 1] });
  }

  // Assign team leader if not set (first player in each team)
  teams.forEach(team => {
    if (!team.leaderId && team.players?.length > 0) {
      team.leaderId = team.players[0].id;
    }
  });

  // Pick a random word from the leader's chosen category (or default)
  const wordList = imposterCategories[category] || imposterCategories["Animals"];
  const secretWord = wordList[Math.floor(Math.random() * wordList.length)];

  // Rotate clue-givers for each team
  const clueGivers = {};
  teams.forEach(team => {
    const prevIdx = typeof team.clueGiverIdx === "number" ? team.clueGiverIdx : -1;
    const nextIdx = getNextClueGiverIdx(team, prevIdx);
    team.clueGiverIdx = nextIdx;
    team.clueGiverId = team.players?.[nextIdx]?.id;
    clueGivers[team.id] = team.clueGiverId;
  });

  // Reset round guesses and points
  const roundGuesses = {};
  teams.forEach(team => {
    roundGuesses[team.id] = [];
    team.roundPoints = 0;
  });

  // Prepare round_data
  const roundData = {
    round: roundNum,
    secretWord,
    clueGivers, // { teamId: playerId }
    guesses: roundGuesses, // { teamId: [guesses] }
    winner: null,
    finished: false,
  };

  // Set phase to round
  gameData = { ...gameData, state: "started", phase: "round" };

  await db.update(password_game)
    .set({
      game_data: gameData,
      team_data: teamData,
      round_data: roundData,
    })
    .where(eq(password_game.id, gameId));

  return NextResponse.json({ success: true, round: roundNum, secretWord, clueGivers });
}
