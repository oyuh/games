import { NextRequest, NextResponse } from "next/server";
import { db } from "../../../../../server/db/index";
import { imposter } from "../../../../../server/db/schema";
import { eq } from "drizzle-orm";

// Define a type for game_data for type safety
interface ImposterGameData {
  round: number;
  phase: string;
  clues: Record<string, string>;
  votes: Record<string, string>;
  shouldVoteVotes: Record<string, 'yay' | 'nay'>;
  revealed: boolean;
  history: Array<{
    round: number;
    clues: Record<string, string>;
    clueSenders: string[];
    votes: Record<string, string>;
    voteVoters: string[];
    shouldVoteVotes: Record<string, 'yay' | 'nay'>;
    shouldVoteVoters: string[];
  }>;
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const sessionId = req.cookies.get("session_id")?.value;
  if (!sessionId) return NextResponse.json({ error: "No session" }, { status: 401 });
  const { shouldVote } = await req.json(); // shouldVote: 'yay' | 'nay'
  if (shouldVote !== "yay" && shouldVote !== "nay") return NextResponse.json({ error: "Invalid vote" }, { status: 400 });

  const game = await db.query.imposter.findFirst({ where: eq(imposter.id, params.id) });
  if (!game) return NextResponse.json({ error: "Game not found" }, { status: 404 });
  const gameData = game.game_data as ImposterGameData;
  if (!gameData || gameData.phase !== "shouldVote") return NextResponse.json({ error: "Not accepting shouldVote votes" }, { status: 400 });

  // Add/update shouldVote for this player
  const shouldVoteVotes = { ...(gameData.shouldVoteVotes ?? {}) };
  shouldVoteVotes[sessionId] = shouldVote;

  // Check if all players have voted
  const allVoted = Object.keys(shouldVoteVotes).length === game.player_ids.length;
  let newPhase = gameData.phase;
  if (allVoted) {
    const yayCount = Object.values(shouldVoteVotes).filter(v => v === "yay").length;
    const nayCount = Object.values(shouldVoteVotes).filter(v => v === "nay").length;
    if (yayCount > nayCount) {
      newPhase = "vote";
    } else {
      // Reset clues, votes, shouldVoteVotes, and increment round
      newPhase = "clue";
      // Log the completed round to history before resetting
      const prevRound = {
        round: gameData.round ?? 1,
        clues: { ...(gameData.clues ?? {}) },
        clueSenders: Object.keys(gameData.clues ?? {}),
        votes: { ...(gameData.votes ?? {}) },
        voteVoters: Object.keys(gameData.votes ?? {}),
        shouldVoteVotes: { ...(gameData.shouldVoteVotes ?? {}) },
        shouldVoteVoters: Object.keys(gameData.shouldVoteVotes ?? {})
      };
      const history = Array.isArray(gameData.history) ? [...gameData.history, prevRound] : [prevRound];
      return await db.update(imposter)
        .set({ game_data: { ...gameData, clues: {}, votes: {}, shouldVoteVotes: {}, phase: newPhase, round: (gameData.round ?? 1) + 1, history } })
        .where(eq(imposter.id, params.id))
        .then(() => NextResponse.json({ success: true, nextPhase: newPhase }));
    }
  }

  await db.update(imposter)
    .set({ game_data: { ...gameData, shouldVoteVotes, phase: newPhase } })
    .where(eq(imposter.id, params.id));
  return NextResponse.json({ success: true, nextPhase: newPhase });
}
