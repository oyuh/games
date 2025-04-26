import { db } from "../server/db/index";
import { sessions } from "../server/db/schema";
import { eq } from "drizzle-orm";

/**
 * Game statistics interface for tracking player performance
 */
interface GameStats {
  imposter?: {
    played: number;
    won: number;
    winRate: number;
  };
  password?: {
    played: number;
    won: number;
    winRate: number;
  };
  lastPlayed: string;
  totalGames: number;
  totalWins: number;
  overallWinRate: number;
}

/**
 * Updates a player's game statistics when a game is completed
 *
 * @param sessionId The player's session ID
 * @param gameType The type of game ('imposter' or 'password')
 * @param won Whether the player won the game
 * @returns Whether the update was successful
 */
export async function updatePlayerGameStats(
  sessionId: string,
  gameType: 'imposter' | 'password',
  won: boolean
): Promise<boolean> {
  try {
    // Get current session data
    const session = await db.query.sessions.findFirst({
      where: eq(sessions.id, sessionId)
    });

    if (!session) return false;

    // Initialize or get existing game_data
    const game_data = session.game_data || {};
    const stats: GameStats = game_data.stats || {
      imposter: { played: 0, won: 0, winRate: 0 },
      password: { played: 0, won: 0, winRate: 0 },
      lastPlayed: new Date().toISOString(),
      totalGames: 0,
      totalWins: 0,
      overallWinRate: 0
    };

    // Make sure the specific game type stats exist
    if (!stats[gameType]) {
      stats[gameType] = { played: 0, won: 0, winRate: 0 };
    }

    // Update game-specific stats
    stats[gameType].played++;
    if (won) stats[gameType].won++;
    stats[gameType].winRate = Math.round((stats[gameType].won / stats[gameType].played) * 100);

    // Update overall stats
    stats.totalGames++;
    if (won) stats.totalWins++;
    stats.overallWinRate = Math.round((stats.totalWins / stats.totalGames) * 100);
    stats.lastPlayed = new Date().toISOString();

    // Update session with new stats
    const updatedGameData = { ...game_data, stats };

    // Set new expiration an hour from now
    const expires = new Date(Date.now() + (60 * 60 * 1000));

    // Update the session
    await db.update(sessions)
      .set({
        game_data: updatedGameData,
        expires_at: expires
      })
      .where(eq(sessions.id, sessionId));

    return true;
  } catch (error) {
    console.error("Error updating player game stats:", error);
    return false;
  }
}

/**
 * Updates game expiration time when a game is completed
 *
 * @param gameId The ID of the completed game
 * @param gameTable The database table for the game ('imposter' or 'password_game')
 */
export async function setGameExpiration(
  gameId: string,
  gameTable: typeof import("../server/db/schema").imposter | typeof import("../server/db/schema").password_game
): Promise<void> {
  try {
    // Set expiration to one hour from now
    const expires = new Date(Date.now() + (60 * 60 * 1000));

    // Update the game with the expiration time and mark as finished
    await db.update(gameTable)
      .set({
        expires_at: expires,
        finished_at: new Date()
      })
      .where(eq(gameTable.id, gameId));

  } catch (error) {
    console.error("Error setting game expiration:", error);
  }
}
