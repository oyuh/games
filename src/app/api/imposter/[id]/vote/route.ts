import { NextRequest, NextResponse } from "next/server";
import { db } from "../../../../../server/db/index";
import { imposter } from "../../../../../server/db/schema";
import { eq } from "drizzle-orm";

export async function POST(
  req: NextRequest,
  context: { params: { id: string } }
) {
  const { params } = context;
  const sessionId = req.cookies.get("session_id")?.value;
  if (!sessionId) return NextResponse.json({ error: "No session" }, { status: 401 });
  const { vote } = await req.json();
  if (!vote || typeof vote !== "string") return NextResponse.json({ error: "Invalid vote" }, { status: 400 });

  const game = await db.query.imposter.findFirst({ where: eq(imposter.id, params.id) });
  if (!game) return NextResponse.json({ error: "Game not found" }, { status: 404 });
  if (!game.game_data || game.game_data.phase !== "vote") return NextResponse.json({ error: "Not accepting votes" }, { status: 400 });

  // Add/update vote for this player
  const votes = { ...(game.game_data.votes || {}) };
  votes[sessionId] = vote;

  // Check if all votes are in
  const allVotesSubmitted = Object.keys(votes).length === game.player_ids.length;
  let newPhase = game.game_data.phase;
  let updatedGameData = { ...game.game_data, votes };

  if (allVotesSubmitted) {
    // Tally votes
    const voteCounts = {};
    Object.values(votes).forEach((v) => {
      voteCounts[v] = (voteCounts[v] || 0) + 1;
    });
    let maxVotes = 0;
    let votedOut = [];
    Object.entries(voteCounts).forEach(([pid, count]) => {
      if (count > maxVotes) {
        maxVotes = count;
        votedOut = [pid];
      } else if (count === maxVotes) {
        votedOut.push(pid);
      }
    });
    // Remove voted out players from player_ids
    const remainingPlayers = game.player_ids.filter((pid) => !votedOut.includes(pid));
    // Remove imposters that were voted out
    const remainingImposters = (game.imposter_ids || []).filter((pid) => !votedOut.includes(pid));

    // Prepare results object for all players
    let results: Record<string, 'win' | 'lose'> = {};

    // Imposter win condition: if imposters >= other players, imposters win
    if (remainingImposters.length > 0 && remainingImposters.length >= (remainingPlayers.length - remainingImposters.length)) {
      // Imposters win
      for (const pid of game.player_ids) {
        if ((game.imposter_ids || []).includes(pid)) {
          results[pid] = 'win';
        } else {
          results[pid] = 'lose';
        }
      }
      newPhase = "reveal";
      updatedGameData = {
        ...game.game_data,
        phase: newPhase,
        votes,
        votedOut,
        revealResult: "imposter_win",
        results,
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

    // If any imposters remain, go to reveal phase (show results for a few seconds)
    if (remainingImposters.length > 0) {
      newPhase = "reveal";
      updatedGameData = {
        ...game.game_data,
        phase: newPhase,
        votes,
        votedOut,
        revealResult: "continue"
      };
      await db.update(imposter)
        .set({
          player_ids: remainingPlayers,
          imposter_ids: remainingImposters,
          game_data: updatedGameData,
        })
        .where(eq(imposter.id, params.id));
      return NextResponse.json({ success: true, nextPhase: newPhase });
    } else {
      // Game over, imposters caught, players win
      for (const pid of game.player_ids) {
        if ((game.imposter_ids || []).includes(pid)) {
          results[pid] = 'lose';
        } else {
          results[pid] = 'win';
        }
      }
      newPhase = "reveal";
      updatedGameData = {
        ...game.game_data,
        phase: newPhase,
        votes,
        votedOut,
        revealResult: "player_win",
        results,
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
  }

  await db.update(imposter)
    .set({ game_data: updatedGameData })
    .where(eq(imposter.id, params.id));
  return NextResponse.json({ success: true });
}
