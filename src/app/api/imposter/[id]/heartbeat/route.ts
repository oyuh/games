import { NextRequest, NextResponse } from "next/server";
import { db } from "../../../../../server/db/index";
import { imposter, sessions } from "../../../../../server/db/schema";
import { eq } from "drizzle-orm";
import { setGameExpiration, updatePlayerGameStats } from "../../../../../lib/game-statistics";

// Heartbeat timeout in milliseconds (45 seconds - increased for better reliability)
const HEARTBEAT_TIMEOUT = 45000;
// Grace period for initial heartbeats (90 seconds)
const INITIAL_HEARTBEAT_GRACE_PERIOD = 90000;
// Number of consecutive missed heartbeats to consider a player disconnected
const MISSED_HEARTBEATS_THRESHOLD = 3;

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const sessionId = req.cookies.get("session_id")?.value;
  if (!sessionId) return NextResponse.json({ error: "No session" }, { status: 401 });

  // Get the game data
  const game = await db.query.imposter.findFirst({ where: eq(imposter.id, params.id) });
  if (!game) return NextResponse.json({ error: "Game not found" }, { status: 404 });

  // Get player name for the heartbeat
  const session = await db.query.sessions.findFirst({ where: eq(sessions.id, sessionId) });
  if (!session) return NextResponse.json({ error: "Session not found" }, { status: 404 });

  // Initialize or update the heartbeats object
  const currentTime = Date.now();
  const heartbeats = game.game_data?.heartbeats || {};
  const firstHeartbeatTime = game.game_data?.firstHeartbeatTime || currentTime;
  const missedHeartbeatsCount = game.game_data?.missedHeartbeatsCount || {};
  const disconnectionVotes = game.game_data?.disconnectionVotes || {};

  // Check if we're in a disconnection confirmation phase
  const playerDetectedDisconnected = game.game_data?.playerDetectedDisconnected;

  // Update this player's heartbeat timestamp
  heartbeats[sessionId] = currentTime;

  // Get all players who have been voted out (across all rounds)
  const votedOutPlayers = new Set<string>();

  // Add players from current round's votedOut array
  if (Array.isArray(game.game_data?.votedOut)) {
    game.game_data.votedOut.forEach(pid => votedOutPlayers.add(pid));
  }

  // Add players from history's votedOut arrays
  if (Array.isArray(game.game_data?.history)) {
    for (const round of game.game_data.history) {
      if (Array.isArray(round.votedOut)) {
        round.votedOut.forEach(pid => votedOutPlayers.add(pid));
      }
    }
  }

  // If this is a disconnection vote
  const { vote, disconnectedPlayerId } = await req.json().catch(() => ({ vote: null, disconnectedPlayerId: null }));

  if (vote !== null && disconnectedPlayerId && playerDetectedDisconnected) {
    // Record this player's vote
    disconnectionVotes[sessionId] = vote;

    // Count votes
    const voteCount = Object.values(disconnectionVotes).reduce((count: number, v: string) =>
      count + (v === 'continue' ? 1 : 0), 0);
    const endCount = Object.values(disconnectionVotes).reduce((count: number, v: string) =>
      count + (v === 'end' ? 1 : 0), 0);

    // See if we have enough votes (more than half of active players)
    const activePlayers = game.player_ids?.filter(id => !votedOutPlayers.has(id) && id !== disconnectedPlayerId) || [];
    const totalActiveVotes = voteCount + endCount;

    if (totalActiveVotes >= activePlayers.length / 2) {
      // We have enough votes to make a decision
      if (voteCount > endCount) {
        // Continue the game without the disconnected player
        const updatedPlayerIds = game.player_ids?.filter(id => id !== disconnectedPlayerId) || [];

        const updatedGameData = {
          ...game.game_data,
          playerDetectedDisconnected: null,
          disconnectionVotes: {},
          playerLeft: null,
          heartbeats,
          missedHeartbeatsCount,
          firstHeartbeatTime
        };

        await db.update(imposter)
          .set({
            game_data: updatedGameData,
            player_ids: updatedPlayerIds
          })
          .where(eq(imposter.id, params.id));

        return NextResponse.json({
          success: true,
          disconnectionResolved: true,
          continueGame: true
        });
      } else {
        // End the game as requested
        const missingPlayerName = game.playerNames?.[disconnectedPlayerId] || "Unknown player";

        const updatedGameData = {
          ...game.game_data,
          phase: "ended",
          playerLeft: {
            id: disconnectedPlayerId,
            name: missingPlayerName,
            timestamp: new Date().toISOString(),
            disconnected: true,
            votedToEnd: true
          },
          revealResult: "player_left",
          playerDetectedDisconnected: null,
          disconnectionVotes: {},
          heartbeats,
          missedHeartbeatsCount,
          firstHeartbeatTime
        };

        // Update the game with the player left status
        await db.update(imposter)
          .set({
            game_data: updatedGameData
          })
          .where(eq(imposter.id, params.id));

        // Set game expiration to one hour from now
        await setGameExpiration(params.id, imposter);

        // Update player statistics for all players - the game was left early
        // No one wins in this case
        await Promise.all((game.player_ids || []).map(async (pid: string) => {
          // We'll count this as a loss for everyone
          await updatePlayerGameStats(pid, 'imposter', false);
        }));

        return NextResponse.json({
          success: true,
          disconnectionResolved: true,
          continueGame: false,
          playerLeft: true,
          playerId: disconnectedPlayerId
        });
      }
    }

    // Not enough votes yet, just update the game with new votes
    const updatedGameData = {
      ...game.game_data,
      disconnectionVotes,
      heartbeats,
      missedHeartbeatsCount,
      firstHeartbeatTime
    };

    await db.update(imposter)
      .set({ game_data: updatedGameData })
      .where(eq(imposter.id, params.id));

    return NextResponse.json({
      success: true,
      disconnectionInProgress: true,
      votesCounted: totalActiveVotes,
      totalPlayers: activePlayers.length
    });
  }

  // If we're in a disconnection confirmation phase, just update heartbeat and return
  if (playerDetectedDisconnected) {
    const updatedGameData = {
      ...game.game_data,
      heartbeats
    };

    await db.update(imposter)
      .set({ game_data: updatedGameData })
      .where(eq(imposter.id, params.id));

    return NextResponse.json({
      success: true,
      disconnectionInProgress: true,
      disconnectedPlayerId: playerDetectedDisconnected
    });
  }

  // Only check for disconnections after the grace period
  // and if the game is in progress
  const gracePeriodElapsed = (currentTime - firstHeartbeatTime) > INITIAL_HEARTBEAT_GRACE_PERIOD;
  const gameInProgress = game.started_at && game.game_data?.phase !== "ended" &&
                        game.game_data?.revealResult !== "player_left";

  // Only track active players (not voted out)
  const activePlayers = (game.player_ids || []).filter(id => !votedOutPlayers.has(id));
  const missingPlayers = [];

  if (gracePeriodElapsed && gameInProgress) {
    for (const playerId of activePlayers) {
      const lastHeartbeat = heartbeats[playerId];
      // Only consider a player missing if they had at least one heartbeat before
      // and their last heartbeat was too long ago
      if (lastHeartbeat && (currentTime - lastHeartbeat > HEARTBEAT_TIMEOUT)) {
        // Increment missed heartbeats count
        missedHeartbeatsCount[playerId] = (missedHeartbeatsCount[playerId] || 0) + 1;

        // Only mark as missing if they've missed multiple consecutive heartbeats
        if (missedHeartbeatsCount[playerId] >= MISSED_HEARTBEATS_THRESHOLD) {
          missingPlayers.push(playerId);
        }
      } else if (lastHeartbeat) {
        // Reset missed heartbeats count if they sent a heartbeat
        missedHeartbeatsCount[playerId] = 0;
      }
    }
  }

  // If we have missing players and we should check for them
  if (missingPlayers.length > 0 && gameInProgress) {
    // Get the name of the first missing player
    const missingPlayerId = missingPlayers[0];
    const missingPlayerName = game.playerNames?.[missingPlayerId] || "Unknown player";

    // Instead of ending the game immediately, set it to a disconnection confirmation phase
    const updatedGameData = {
      ...game.game_data,
      playerDetectedDisconnected: missingPlayerId,
      disconnectionVotes: {},
      heartbeats,
      missedHeartbeatsCount,
      firstHeartbeatTime
    };

    // Update the game state to reflect potential player disconnection
    await db.update(imposter)
      .set({
        game_data: updatedGameData
      })
      .where(eq(imposter.id, params.id));

    return NextResponse.json({
      success: true,
      playerDisconnected: true,
      playerId: missingPlayerId,
      playerName: missingPlayerName
    });
  }

  // Otherwise just update the heartbeats
  const updatedGameData = {
    ...game.game_data,
    heartbeats,
    missedHeartbeatsCount,
    firstHeartbeatTime: game.game_data?.firstHeartbeatTime || currentTime
  };

  await db.update(imposter)
    .set({ game_data: updatedGameData })
    .where(eq(imposter.id, params.id));

  return NextResponse.json({
    success: true,
    activePlayerCount: activePlayers.length
  });
}
