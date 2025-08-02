import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { db } from "../../../../../server/db/index";
import { imposter } from "../../../../../server/db/schema";
import { eq } from "drizzle-orm";

// Heartbeat timeout in milliseconds (45 seconds - increased for better reliability)
const HEARTBEAT_TIMEOUT = 45000;
// Grace period for initial heartbeats (90 seconds)
const INITIAL_HEARTBEAT_GRACE_PERIOD = 90000;
// Maximum time allowed for inactive (unfocused window) state before considered disconnected
const INACTIVE_TIMEOUT = 1200000; // 20 minutes (increased from 10 minutes to further reduce false alarms)

interface HeartbeatRequestBody {
  activeState?: 'active' | 'inactive';
  lastActiveTimestamp?: number;
  vote?: 'continue' | 'end';
  disconnectedPlayerId?: string;
}

interface GameData {
  phase?: string;
  activePlayers?: string[];
  playerDetectedDisconnected?: string;
  disconnectionVotes?: Record<string, 'continue' | 'end'>;
  heartbeats?: Record<string, {
    timestamp: number;
    activeState: 'active' | 'inactive';
    lastActiveTimestamp: number;
  }>;
  [key: string]: unknown;
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const sessionId = req.cookies.get("session_id")?.value;
  if (!sessionId) return NextResponse.json({ error: "No session" }, { status: 401 });

  try {
    const body = await req.json() as HeartbeatRequestBody;
    const { activeState, lastActiveTimestamp, vote, disconnectedPlayerId } = body;

    const game = await db.query.imposter.findFirst({ where: eq(imposter.id, params.id) });
    if (!game) return NextResponse.json({ error: "Game not found" }, { status: 404 });

    // If this is a disconnection vote
    if (vote && disconnectedPlayerId) {
      const gameData = (game.game_data ?? {}) as GameData;
      const disconnectionVotes = { ...(gameData.disconnectionVotes ?? {}) };
      disconnectionVotes[sessionId] = vote;

      // Count votes from active players only
      const activePlayers = gameData.activePlayers ?? game.player_ids ?? [];
      const activeVotes = Object.fromEntries(
        Object.entries(disconnectionVotes).filter(([pid]) => activePlayers.includes(pid))
      );

      const totalActive = activePlayers.length;
      const votesCounted = Object.keys(activeVotes).length;
      const continueVotes = Object.values(activeVotes).filter(v => v === 'continue').length;
      const endVotes = Object.values(activeVotes).filter(v => v === 'end').length;

      // Check if all active players have voted
      if (votesCounted >= totalActive) {
        // Majority decision or tie goes to continue
        const shouldContinue = continueVotes >= endVotes;

        if (shouldContinue) {
          // Remove disconnected player and continue
          const updatedPlayerIds = game.player_ids.filter(pid => pid !== disconnectedPlayerId);
          const updatedImposterIds = (game.imposter_ids ?? []).filter(pid => pid !== disconnectedPlayerId);

          const updatedGameData: GameData = {
            ...gameData,
            playerDetectedDisconnected: undefined,
            disconnectionVotes: {},
            activePlayers: (gameData.activePlayers ?? []).filter(pid => pid !== disconnectedPlayerId)
          };

          await db.update(imposter)
            .set({
              player_ids: updatedPlayerIds,
              imposter_ids: updatedImposterIds,
              game_data: updatedGameData
            })
            .where(eq(imposter.id, params.id));

          return NextResponse.json({
            success: true,
            disconnectionResolved: true,
            continueGame: true,
            votesCounted,
            totalPlayers: totalActive
          });
        } else {
          // End game
          const updatedGameData: GameData = {
            ...gameData,
            phase: "ended",
            revealResult: "player_left",
            playerLeft: { id: disconnectedPlayerId, timestamp: new Date().toISOString() },
            disconnectionVotes: {}
          };

          await db.update(imposter)
            .set({
              game_data: updatedGameData,
              expires_at: new Date(Date.now() + 60 * 60 * 1000) // 1 hour
            })
            .where(eq(imposter.id, params.id));

          return NextResponse.json({
            success: true,
            disconnectionResolved: true,
            continueGame: false,
            votesCounted,
            totalPlayers: totalActive
          });
        }
      } else {
        // Still waiting for votes
        await db.update(imposter)
          .set({
            game_data: {
              ...gameData,
              disconnectionVotes
            }
          })
          .where(eq(imposter.id, params.id));

        return NextResponse.json({
          success: true,
          disconnectionInProgress: true,
          votesCounted,
          totalPlayers: totalActive,
          playerId: disconnectedPlayerId
        });
      }
    }

    // Regular heartbeat logic
    const now = Date.now();
    const gameData = (game.game_data ?? {}) as GameData;
    const heartbeats = { ...(gameData.heartbeats ?? {}) };

    // Update this player's heartbeat
    heartbeats[sessionId] = {
      timestamp: now,
      activeState: activeState ?? 'active',
      lastActiveTimestamp: lastActiveTimestamp ?? now
    };

    // Check for disconnected players
    let playerDetectedDisconnected = gameData.playerDetectedDisconnected;

    if (!playerDetectedDisconnected && game.player_ids) {
      for (const playerId of game.player_ids) {
        const playerHeartbeat = heartbeats[playerId];
        if (!playerHeartbeat) {
          // No heartbeat recorded yet, give grace period
          if (game.started_at && (now - new Date(game.started_at).getTime()) > INITIAL_HEARTBEAT_GRACE_PERIOD) {
            playerDetectedDisconnected = playerId;
            break;
          }
        } else {
          const timeSinceLastHeartbeat = now - playerHeartbeat.timestamp;
          const timeSinceLastActive = now - (playerHeartbeat.lastActiveTimestamp ?? playerHeartbeat.timestamp);

          // Check if player is disconnected
          if (timeSinceLastHeartbeat > HEARTBEAT_TIMEOUT ||
              (playerHeartbeat.activeState === 'inactive' && timeSinceLastActive > INACTIVE_TIMEOUT)) {
            playerDetectedDisconnected = playerId;
            break;
          }
        }
      }
    }

    // Update game data
    const updatedGameData: GameData = {
      ...gameData,
      heartbeats,
      playerDetectedDisconnected
    };

    await db.update(imposter)
      .set({ game_data: updatedGameData })
      .where(eq(imposter.id, params.id));

    const response: Record<string, unknown> = { success: true };

    if (playerDetectedDisconnected && playerDetectedDisconnected !== sessionId) {
      response.playerDisconnected = true;
      response.playerId = playerDetectedDisconnected;
    }

    return NextResponse.json(response);

  } catch (error) {
    console.error("Heartbeat error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
