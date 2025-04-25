import { NextRequest, NextResponse } from "next/server";
import { db } from "~/server/db";
import { password_game } from "~/server/db/schema";
import { eq } from "drizzle-orm";

export async function POST(req: NextRequest) {
  const { gameId, playerId, guess } = await req.json();
  if (!gameId || !playerId || !guess) {
    return NextResponse.json({ error: "Missing gameId, playerId, or guess" }, { status: 400 });
  }
  const game = await db.query.password_game.findFirst({ where: eq(password_game.id, gameId) });
  if (!game) return NextResponse.json({ error: "Game not found" }, { status: 404 });
  const teamData = game.team_data ?? { teams: [] };
  const roundData = game.round_data ?? {};
  const gameData = game.game_data ?? {};
  const pointsToWin = gameData.pointsToWin || 5;
  const secretWord = roundData.secretWord;
  const teams = teamData.teams ?? [];

  // Find the player's team
  const team = teams.find(t => t.players.some((p: any) => p.id === playerId));
  if (!team) return NextResponse.json({ error: "Player not in a team" }, { status: 400 });
  const clueGiverId = roundData.clueGivers?.[team.id];
  if (clueGiverId === playerId) {
    return NextResponse.json({ error: "Clue-giver cannot guess" }, { status: 403 });
  }

  // Add guess to round guesses
  roundData.guesses = roundData.guesses || {};
  roundData.guesses[team.id] = roundData.guesses[team.id] || [];
  roundData.guesses[team.id].push(guess);

  // Check if guess is correct
  let roundFinished = false;
  let winnerTeamId = null;
  if (guess.trim().toLowerCase() === secretWord.trim().toLowerCase()) {
    roundFinished = true;
    roundData.finished = true;
    // Count guesses for each team
    const teamGuessCounts = teams.map(t => ({
      id: t.id,
      count: (roundData.guesses[t.id] || []).length,
    }));
    // Find the team with the fewest guesses (lowest count wins)
    const minCount = Math.min(...teamGuessCounts.map(t => t.count));
    const winners = teamGuessCounts.filter(t => t.count === minCount);
    // If tie, all tied teams get a point
    winners.forEach(w => {
      const winnerTeam = teams.find(t => t.id === w.id);
      if (winnerTeam) {
        winnerTeam.score = (winnerTeam.score || 0) + 1;
      }
    });
    roundData.winner = winners.length === 1 ? winners[0].id : winners.map(w => w.id);
    // Check for game end
    const winningTeam = teams.find(t => (t.score || 0) >= pointsToWin);
    if (winningTeam) {
      gameData.state = "finished";
      gameData.winner = winningTeam.id;
    }
  } else {
    // Incorrect guess: increment team's round points
    team.roundPoints = (team.roundPoints || 0) + 1;
  }

  await db.update(password_game)
    .set({
      team_data: teamData,
      round_data: roundData,
      game_data: gameData,
    })
    .where(eq(password_game.id, gameId));

  return NextResponse.json({
    correct: roundFinished,
    finished: roundFinished,
    winner: roundData.winner || null,
    guesses: roundData.guesses,
    teamScores: teams.map(t => ({ id: t.id, score: t.score || 0 })),
    state: gameData.state,
  });
}
