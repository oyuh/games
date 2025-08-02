import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { db } from "../../../../../server/db/index";
import { imposter } from "../../../../../server/db/schema";
import { eq } from "drizzle-orm";

// Define a type for game_data for type safety
interface ImposterGameData {
  round: number;
  phase: string;
  clues: Record<string, string>;
  clueOrder?: string[];
  votes: Record<string, string>;
  shouldVoteVotes: Record<string, 'yay' | 'nay'>;
  revealed: boolean;
  activePlayers?: string[];
  votedOut?: string[];
  history: Array<{
    round: number;
    clues: Record<string, string>;
    clueOrder?: string[];
    clueSenders?: string[];
    votes: Record<string, string>;
    voteVoters?: string[];
    shouldVoteVotes: Record<string, 'yay' | 'nay'>;
    shouldVoteVoters?: string[];
    phase: string;
    activePlayers?: string[];
  }>;
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const sessionId = req.cookies.get("session_id")?.value;
  if (!sessionId) return NextResponse.json({ error: "No session" }, { status: 401 });

  let shouldVote: 'yay' | 'nay';
  try {
    const body = await req.json() as { shouldVote?: unknown };
    if (typeof body.shouldVote === 'string' && (body.shouldVote === 'yay' || body.shouldVote === 'nay')) {
      shouldVote = body.shouldVote;
    } else {
      return NextResponse.json({ error: "Invalid vote" }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: "Invalid request format" }, { status: 400 });
  }

  if (shouldVote !== "yay" && shouldVote !== "nay") {
    return NextResponse.json({ error: "Invalid vote" }, { status: 400 });
  }

  // Fetch the game with a transaction to prevent race conditions
  const game = await db.query.imposter.findFirst({ where: eq(imposter.id, params.id) });
  if (!game) return NextResponse.json({ error: "Game not found" }, { status: 404 });

  const gameData = game.game_data as ImposterGameData;
  if (!gameData || gameData.phase !== "shouldVote") {
    return NextResponse.json({
      error: "Not accepting shouldVote votes",
      phase: gameData?.phase
    }, { status: 400 });
  }

  // Block should-vote if player is not in current player_ids
  if (!game.player_ids.includes(sessionId)) {
    return NextResponse.json({ error: "You are not in this game" }, { status: 403 });
  }

  // Block should-vote if player is in votedOut
  if (Array.isArray(gameData.votedOut) && gameData.votedOut.includes(sessionId)) {
    return NextResponse.json({ error: "You have been voted out" }, { status: 403 });
  }

  // Add/update shouldVote for this player
  const shouldVoteVotes = { ...(gameData.shouldVoteVotes ?? {}) };
  shouldVoteVotes[sessionId] = shouldVote;

  // Use the tracked active players or fallback to clue submitters if not available
  const activePlayers =
    Array.isArray(gameData.activePlayers) && gameData.activePlayers.length > 0
      ? gameData.activePlayers
      : Object.keys(gameData.clues ?? {});

  // Only count votes from active players
  const activeVotes = Object.fromEntries(
    Object.entries(shouldVoteVotes).filter(([pid]) => activePlayers.includes(pid))
  );

  // Calculate if we have enough votes
  const votedCount = Object.keys(activeVotes).length;
  const totalActive = activePlayers.length;

  // All active players have voted if all active players have submitted a vote
  const allActiveVoted = votedCount >= totalActive && totalActive > 0;

  let newPhase = gameData.phase;

  if (allActiveVoted) {
    // Count only votes from active players for decision making
    const yayCount = Object.entries(activeVotes)
      .filter(([_, vote]) => vote === "yay")
      .length;
    const nayCount = Object.entries(activeVotes)
      .filter(([_, vote]) => vote === "nay")
      .length;

    let result;
    if (yayCount === nayCount) {
      result = "yay";
    } else {
      result = yayCount > nayCount ? "yay" : "nay";
    }

    if (result === "yay") {
      // Only push to history if actually moving to vote phase
      const currentRoundData = {
        round: gameData.round ?? 1,
        clues: { ...(gameData.clues ?? {}) },
        clueOrder: gameData.clueOrder ? [...gameData.clueOrder] : undefined,
        clueSenders: Object.keys(gameData.clues ?? {}),
        votes: { ...(gameData.votes ?? {}) },
        voteVoters: Object.keys(gameData.votes ?? {}),
        shouldVoteVotes: { ...shouldVoteVotes },
        shouldVoteVoters: Object.keys(shouldVoteVotes),
        phase: "shouldVote",
        activePlayers: [...activePlayers]
      };
      const history = Array.isArray(gameData.history) ? [...gameData.history, currentRoundData] : [currentRoundData];
      newPhase = "vote";
      return await db.update(imposter)
        .set({
          game_data: {
            ...gameData,
            shouldVoteVotes: {}, // Always clear for new phase
            phase: newPhase,
            history,
            // Track active players for this voting round
            activePlayers
          }
        })
        .where(eq(imposter.id, params.id))
        .then(() => NextResponse.json({ success: true, nextPhase: newPhase }));
    } else {
      // Do NOT push to history if skipping voting, just reset for a new round
      newPhase = "clue";
      return await db.update(imposter)
        .set({
          game_data: {
            ...gameData,
            clues: {}, // Clear clues for new round
            votes: {}, // Clear votes for new round
            shouldVoteVotes: {}, // Clear shouldVoteVotes for new round
            clueOrder: [], // Reset clue order for new round
            phase: newPhase,
            round: (gameData.round ?? 1) + 1,
            // Keep history unchanged
            // Keep activePlayers for next round (don't reset to empty)
            activePlayers
          }
        })
        .where(eq(imposter.id, params.id))
        .then(() => NextResponse.json({ success: true, nextPhase: newPhase }));
    }
  }

  // Not all active players have voted yet, just update the current player's vote
  await db.update(imposter)
    .set({
      game_data: {
        ...gameData,
        shouldVoteVotes
      }
    })
    .where(eq(imposter.id, params.id));

  return NextResponse.json({
    success: true,
    nextPhase: newPhase,
    voteStats: {
      votedCount,
      totalActive,
      yayCount: Object.values(activeVotes).filter(vote => vote === "yay").length,
      nayCount: Object.values(activeVotes).filter(vote => vote === "nay").length
    }
  });
}
