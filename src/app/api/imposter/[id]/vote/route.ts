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
  activePlayers?: string[];
  history?: Array<{
    round?: number;
    clues?: Record<string, string>;
    clueOrder?: string[];
    votes?: Record<string, string>;
    votedOut?: string[];
    revealResult?: string;
    activePlayers?: string[];
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

  // Block voting if player is not in player_ids
  if (!game.player_ids.includes(sessionId)) {
    return NextResponse.json({ error: "You are out" }, { status: 403 });
  }

  // Remove voted out players from remainingPlayers
  const votedOutSet = new Set(gameData.votedOut || []);
  const remainingPlayers = game.player_ids.filter(pid => !votedOutSet.has(pid));
  const remainingImposters = (game.imposter_ids ?? []).filter(pid => remainingPlayers.includes(pid));
  let results: Record<string, 'win' | 'lose'> = {};

  // --- Remove voted out players from the game ---
  // If there are any voted out players, update player_ids in the DB
  if (gameData.votedOut && gameData.votedOut.length > 0) {
    await db.update(imposter)
      .set({ player_ids: remainingPlayers })
      .where(eq(imposter.id, params.id));
    // If the current session is voted out, return a special response
    if (gameData.votedOut.includes(sessionId)) {
      return NextResponse.json({ kicked: true });
    }
  }

  // Add/update vote for this player
  const votes: Record<string, string> = { ...(gameData.votes ?? {}) };
  votes[sessionId] = vote;

  // Get the active players who participated in this round
  // If not specifically tracked, fall back to players who submitted clues
  const activePlayers = gameData.activePlayers || Object.keys(gameData.clues || {});

  // Count only votes from active players
  const activeVotes = Object.entries(votes)
    .filter(([pid]) => activePlayers.includes(pid))
    .reduce((obj, [pid, vote]) => {
      obj[pid] = vote;
      return obj;
    }, {} as Record<string, string>);

  // Check if all active players have voted
  const allActiveVoted = Object.keys(activeVotes).length >= activePlayers.length;

  let newPhase = gameData.phase;
  let updatedGameData: ImposterGameData = {
    ...gameData,
    votes,
    activePlayers // Ensure we store active players
  };

  if (allActiveVoted) {
    // Tally votes (only count votes from active players)
    const voteCounts: Record<string, number> = {};
    Object.entries(votes)
      .filter(([pid]) => activePlayers.includes(pid))
      .forEach(([_, votedFor]) => {
        voteCounts[votedFor] = (voteCounts[votedFor] ?? 0) + 1;
      });

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

    // Remove voted out player from player_ids, clueOrder, and activePlayers for next round
    let updatedPlayerIds = game.player_ids;
    let nextClueOrder = gameData.clueOrder || [];
    let nextActivePlayers = gameData.activePlayers || [];
    let nextImposterIds = game.imposter_ids;
    if (votedOut.length === 1) {
      updatedPlayerIds = game.player_ids.filter(pid => !votedOut.includes(pid));
      nextClueOrder = (gameData.clueOrder || []).filter(pid => !votedOut.includes(pid));
      nextActivePlayers = (gameData.activePlayers || []).filter(pid => !votedOut.includes(pid));
      nextImposterIds = (game.imposter_ids || []).filter(pid => updatedPlayerIds.includes(pid));
    }

    // Calculate remaining imposters and non-imposters
    const remainingImposters = (game.imposter_ids || []).filter(pid => updatedPlayerIds.includes(pid));
    const remainingNonImposters = updatedPlayerIds.filter(pid => !remainingImposters.includes(pid));

    // Only push one history entry per round
    const prevRound = {
      round: gameData.round ?? 1,
      clues: { ...(gameData.clues ?? {}) },
      clueOrder: Array.isArray(gameData.clueOrder) ? [...gameData.clueOrder] : [],
      votes: { ...votes },
      votedOut: Array.isArray(votedOut) ? [...votedOut] : [],
      revealResult: votedOut.length > 1 ? "tie" : votedOut.length === 1 ? "continue" : undefined,
      activePlayers: Array.isArray(activePlayers) ? [...activePlayers] : []
    };
    const history = Array.isArray(gameData.history) ? [...gameData.history, prevRound] : [prevRound];

    // If there is a tie, go back to clues, no one is voted out
    if (votedOut.length > 1) {
      const nextGameData = {
        ...gameData,
        phase: "clue",
        round: (gameData.round ?? 1) + 1,
        clues: {},
        clueOrder: nextClueOrder,
        votes: {},
        votedOut: [],
        revealResult: undefined,
        activePlayers: nextActivePlayers,
        history
      };
      await db.update(imposter)
        .set({
          game_data: nextGameData
        })
        .where(eq(imposter.id, params.id));
      return NextResponse.json({ success: true, nextPhase: "clue" });
    }

    // Check win conditions after removing voted out player
    if (remainingImposters.length === 0) {
      // Players win
      const results: Record<string, 'win' | 'lose'> = {};
      for (const pid of game.player_ids) {
        if ((game.imposter_ids ?? []).includes(pid)) {
          results[pid] = 'lose';
        } else {
          results[pid] = 'win';
        }
      }
      const updatedGameData: ImposterGameData = {
        ...gameData,
        phase: "reveal",
        votes,
        votedOut,
        revealResult: "player_win",
        results,
        gameFinished: true,
        history
      };
      await db.update(imposter)
        .set({
          player_ids: updatedPlayerIds,
          imposter_ids: nextImposterIds,
          game_data: updatedGameData
        })
        .where(eq(imposter.id, params.id));
      await setGameExpiration(params.id, imposter);
      await Promise.all(game.player_ids.map(async (pid) => {
        const isImposter = (game.imposter_ids ?? []).includes(pid);
        await updatePlayerGameStats(pid, 'imposter', !isImposter);
      }));
      return NextResponse.json({ success: true, nextPhase: "reveal" });
    }
    if (remainingImposters.length >= remainingNonImposters.length) {
      // Imposters win
      const results: Record<string, 'win' | 'lose'> = {};
      for (const pid of game.player_ids) {
        if ((game.imposter_ids ?? []).includes(pid)) {
          results[pid] = 'win';
        } else {
          results[pid] = 'lose';
        }
      }
      const updatedGameData: ImposterGameData = {
        ...gameData,
        phase: "reveal",
        votes,
        votedOut,
        revealResult: "imposter_win",
        results,
        gameFinished: true,
        history
      };
      await db.update(imposter)
        .set({
          player_ids: updatedPlayerIds,
          imposter_ids: nextImposterIds,
          game_data: updatedGameData
        })
        .where(eq(imposter.id, params.id));
      await setGameExpiration(params.id, imposter);
      await Promise.all(game.player_ids.map(async (pid) => {
        const isImposter = (game.imposter_ids ?? []).includes(pid);
        await updatePlayerGameStats(pid, 'imposter', isImposter);
      }));
      return NextResponse.json({ success: true, nextPhase: "reveal" });
    }

    // Otherwise, start a new round (reset clues, votes, etc.)
    const nextGameData = {
      ...gameData,
      phase: "clue",
      round: (gameData.round ?? 1) + 1,
      clues: {},
      clueOrder: nextClueOrder,
      votes: {},
      votedOut: [],
      revealResult: undefined,
      activePlayers: nextActivePlayers,
      history
    };
    await db.update(imposter)
      .set({
        player_ids: updatedPlayerIds,
        imposter_ids: nextImposterIds,
        game_data: nextGameData
      })
      .where(eq(imposter.id, params.id));
    return NextResponse.json({ success: true, nextPhase: "clue" });
  }

  await db.update(imposter)
    .set({ game_data: updatedGameData })
    .where(eq(imposter.id, params.id));
  return NextResponse.json({
    success: true,
    voteStats: {
      activeVotesCount: Object.keys(activeVotes).length,
      totalActive: activePlayers.length
    }
  });
}
