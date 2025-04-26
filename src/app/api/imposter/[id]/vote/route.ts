import { NextRequest, NextResponse } from "next/server";
import { db } from "../../../../../server/db/index";
import { imposter } from "../../../../../server/db/schema";
import { eq } from "drizzle-orm";
import { updatePlayerGameStats, setGameExpiration } from "../../../../../lib/game-statistics";

// Add a type for game_data to ensure type safety
interface ImposterGameData {
  round?: number;
  phase?: string;
  clues?: Record<string, string>;
  clueOrder?: string[];
  votes?: Record<string, string>;
  votedOut?: string[];
  revealResult?: string;
  history?: Array<{
    round?: number;
    clues?: Record<string, string>;
    clueOrder?: string[];
    votes?: Record<string, string>;
    votedOut?: string[];
    revealResult?: string;
  }>;
  results?: Record<string, 'win' | 'lose'>;
}

export async function POST(
  req: NextRequest,
  context: { params: { id: string } }
) {
  const { params } = context;
  const sessionId = req.cookies.get("session_id")?.value;
  if (!sessionId) return NextResponse.json({ error: "No session" }, { status: 401 });
  const body = (await req.json()) as { vote: string };
  const { vote } = body;
  if (!vote || typeof vote !== "string") return NextResponse.json({ error: "Invalid vote" }, { status: 400 });

  const game = await db.query.imposter.findFirst({ where: eq(imposter.id, params.id) });
  if (!game) return NextResponse.json({ error: "Game not found" }, { status: 404 });
  const gameData = (game.game_data || {}) as ImposterGameData;
  if (!gameData.phase || gameData.phase !== "vote") return NextResponse.json({ error: "Not accepting votes" }, { status: 400 });

  // Add/update vote for this player
  const votes: Record<string, string> = { ...(gameData.votes ?? {}) };
  votes[sessionId] = vote;

  // Check if all votes are in
  const allVotesSubmitted = Object.keys(votes).length === game.player_ids.length;
  let newPhase = gameData.phase;
  let updatedGameData: ImposterGameData = { ...gameData, votes };

  if (allVotesSubmitted) {
    // Tally votes
    const voteCounts: Record<string, number> = {};
    for (const v of Object.values(votes)) {
      voteCounts[v] = (voteCounts[v] ?? 0) + 1;
    }
    let maxVotes = 0;
    let votedOut: string[] = [];
    for (const [pid, count] of Object.entries(voteCounts)) {
      if (count > maxVotes) {
        maxVotes = count;
        votedOut = [pid];
      } else if (count === maxVotes) {
        votedOut.push(pid);
      }
    }
    // Remove voted out players from player_ids
    const remainingPlayers = game.player_ids.filter((pid: string) => !votedOut.includes(pid));
    // Remove imposters that were voted out
    const remainingImposters = (game.imposter_ids ?? []).filter((pid: string) => !votedOut.includes(pid));

    // Prepare results object for all players
    const results: Record<string, 'win' | 'lose'> = {};

    // Imposter win condition: if imposters >= other players, imposters win
    if (remainingImposters.length > 0 && remainingImposters.length >= (remainingPlayers.length - remainingImposters.length)) {
      for (const pid of game.player_ids) {
        if ((game.imposter_ids ?? []).includes(pid)) {
          results[pid] = 'win';
        } else {
          results[pid] = 'lose';
        }
      }
      newPhase = "reveal";
      updatedGameData = {
        ...gameData,
        phase: newPhase,
        votes,
        votedOut,
        revealResult: "imposter_win",
        results,
      };

      // Update the game with results
      await db.update(imposter)
        .set({
          player_ids: remainingPlayers,
          imposter_ids: remainingImposters,
          game_data: updatedGameData,
        })
        .where(eq(imposter.id, params.id));

      // Update game expiration time - game is finished
      await setGameExpiration(params.id, imposter);

      // Update player statistics for all players
      await Promise.all(game.player_ids.map(async (pid) => {
        const isImposter = (game.imposter_ids ?? []).includes(pid);
        // Imposters win, others lose
        await updatePlayerGameStats(pid, 'imposter', isImposter);
      }));

      return NextResponse.json({ success: true, nextPhase: newPhase });
    }

    // Player win condition: all imposters voted out
    if (remainingImposters.length === 0) {
      for (const pid of game.player_ids) {
        if ((game.imposter_ids ?? []).includes(pid)) {
          results[pid] = 'lose';
        } else {
          results[pid] = 'win';
        }
      }
      newPhase = "reveal";
      updatedGameData = {
        ...gameData,
        phase: newPhase,
        votes,
        votedOut,
        revealResult: "player_win",
        results,
      };

      // Update the game with results
      await db.update(imposter)
        .set({
          player_ids: remainingPlayers,
          imposter_ids: remainingImposters,
          game_data: updatedGameData,
        })
        .where(eq(imposter.id, params.id));

      // Update game expiration time - game is finished
      await setGameExpiration(params.id, imposter);

      // Update player statistics for all players
      await Promise.all(game.player_ids.map(async (pid) => {
        const isImposter = (game.imposter_ids ?? []).includes(pid);
        // Non-imposters win, imposters lose
        await updatePlayerGameStats(pid, 'imposter', !isImposter);
      }));

      return NextResponse.json({ success: true, nextPhase: newPhase });
    }

    // If game is not over, start a new round (reset clues, votes, etc.)
    // Log the completed round to history before resetting
    const prevRound = {
      round: gameData.round ?? 1,
      clues: { ...(gameData.clues ?? {}) },
      clueOrder: Array.isArray(gameData.clueOrder) ? [...gameData.clueOrder] : [],
      votes: { ...votes },
      votedOut: [...votedOut],
      revealResult: "continue",
    };
    const history = Array.isArray(gameData.history) ? [...gameData.history, prevRound] : [prevRound];
    newPhase = "clue";
    updatedGameData = {
      ...gameData,
      phase: newPhase,
      round: (gameData.round ?? 1) + 1,
      clues: {},
      clueOrder: [],
      votes: {},
      votedOut: [],
      revealResult: undefined,
      history,
    };
    await db.update(imposter)
      .set({
        player_ids: remainingPlayers,
        imposter_ids: remainingImposters,
        game_data: updatedGameData,
      })
      .where(eq(imposter.id, params.id));
    return NextResponse.json({ success: true, nextPhase: newPhase });
  }

  await db.update(imposter)
    .set({ game_data: updatedGameData })
    .where(eq(imposter.id, params.id));
  return NextResponse.json({ success: true });
}
