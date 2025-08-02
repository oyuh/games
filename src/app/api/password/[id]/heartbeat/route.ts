import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { db } from "~/server/db";
import { password } from "~/server/db/schema";
import { eq } from "drizzle-orm";
import type { PasswordGameData, HeartbeatResponse } from "~/lib/types/password";

const HEARTBEAT_TIMEOUT = 30000; // 30 seconds

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

    // Make sure the player is in the game
    const teams = game.teams as Record<string, string[]>;
    let playerFound = false;

    for (const teamKey in teams) {
      const teamPlayers = teams[teamKey];
      if (teamPlayers?.includes(sessionId)) {
        playerFound = true;
        break;
      }
    }

    if (!playerFound) {
      return NextResponse.json({ error: "Player not in game" }, { status: 403 });
    }

    // Initialize game data with proper typing
    const gameData = (game.game_data ?? {}) as PasswordGameData;
    gameData.heartbeats ??= {};

    // Update player's heartbeat timestamp
    gameData.heartbeats[sessionId] = Date.now();

    // Check for disconnected players (only during active gameplay)
    const activePlayerIds = new Set<string>();
    const disconnectedPlayers: string[] = [];

    if (game.started_at && !game.finished_at) {
      const currentTime = Date.now();

      // Check all players in teams
      for (const teamKey in teams) {
        const teamPlayers = teams[teamKey];
        if (teamPlayers) {
          for (const playerId of teamPlayers) {
            const lastHeartbeat = gameData.heartbeats?.[playerId] ?? 0;
            if (currentTime - lastHeartbeat > HEARTBEAT_TIMEOUT) {
              disconnectedPlayers.push(playerId);
            } else {
              activePlayerIds.add(playerId);
            }
          }
        }
      }

      // If players have disconnected, initiate voting to remove them
      if (disconnectedPlayers.length > 0) {
        gameData.disconnectionVotes ??= {};

        // Start votes for disconnected players
        for (const disconnectedPlayerId of disconnectedPlayers) {
          gameData.disconnectionVotes[disconnectedPlayerId] ??= {
            votes: [],
            startTime: currentTime,
            targetPlayer: disconnectedPlayerId
          };
        }

        // Check if voting should conclude (after 15 seconds)
        const votesToRemove: string[] = [];
        for (const [targetPlayer, voteData] of Object.entries(gameData.disconnectionVotes)) {
          if (currentTime - voteData.startTime > 15000) { // 15 seconds
            // Remove the disconnected player automatically
            votesToRemove.push(targetPlayer);

            // Remove from teams
            for (const teamKey in teams) {
              const teamPlayers = teams[teamKey];
              if (teamPlayers) {
                teams[teamKey] = teamPlayers.filter(id => id !== targetPlayer);
              }
            }

            // Update host if needed
            let newHostId = game.host_id;
            if (game.host_id === targetPlayer) {
              const remainingPlayers = Object.values(teams).flat();
              newHostId = remainingPlayers.length > 0 ? (remainingPlayers[0] ?? game.host_id) : game.host_id;
            }

            // Update game state
            await db.update(password).set({
              teams,
              host_id: newHostId,
              game_data: gameData
            }).where(eq(password.id, params.id));
          }
        }

        // Clean up completed votes
        for (const targetPlayer of votesToRemove) {
          if (gameData.disconnectionVotes) {
            delete gameData.disconnectionVotes[targetPlayer];
          }
        }
      }
    }

    // Update the game with new heartbeat data
    await db
      .update(password)
      .set({
        game_data: gameData
      })
      .where(eq(password.id, params.id));

    const response: HeartbeatResponse = {
      success: true,
      activePlayerIds: Array.from(activePlayerIds),
      disconnectedPlayers,
      heartbeatReceived: true
    };

    return NextResponse.json(response);

  } catch (error) {
    console.error("Error in heartbeat:", error);
    return NextResponse.json(
      { error: "Failed to process heartbeat", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
