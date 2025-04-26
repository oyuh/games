// This script updates the expiration for sessions and imposter games if their game_data hasn't changed in 5-10 minutes.
// Run with: npx tsx src/scripts/session-and-game-expiration.ts

import { db } from '../server/db/index';
import { sessions, imposter, password_game } from '../server/db/schema';
import { eq, and, isNotNull, lt } from 'drizzle-orm';

const FIVE_MINUTES = 5 * 60 * 1000;
const TEN_MINUTES = 10 * 60 * 1000;
const NOW = new Date();

// Helper to stringify game_data for comparison
function safeStringify(obj: any) {
  try {
    return JSON.stringify(obj);
  } catch {
    return '';
  }
}

// In-memory cache for last seen game_data
const lastSeen: Record<string, { data: string; lastChanged: number }> = {};

async function processTable(table: any, tableName: string) {
  // Get all rows with non-null game_data
  const rows = await db.select().from(table).where(isNotNull(table.game_data));
  for (const row of rows) {
    const id = row.id;
    const dataStr = safeStringify(row.game_data);
    const cache = lastSeen[`${tableName}:${id}`];
    const now = Date.now();
    if (!cache || cache.data !== dataStr) {
      // Data changed, update cache and clear expiration
      lastSeen[`${tableName}:${id}`] = { data: dataStr, lastChanged: now };
      // Only clear expiration if it's set to expire soon
      if (row.expires_at && new Date(row.expires_at).getTime() - now < TEN_MINUTES) {
        await db.update(table).set({ expires_at: null }).where(eq(table.id, id));
        console.log(`[${tableName}] Cleared expiration for id=${id}`);
      }
    } else {
      // Data unchanged, check if it's stale
      const since = now - cache.lastChanged;
      if (since > FIVE_MINUTES) {
        const newExpires = new Date(now + FIVE_MINUTES);
        if (!row.expires_at || new Date(row.expires_at).getTime() > newExpires.getTime()) {
          await db.update(table).set({ expires_at: newExpires }).where(eq(table.id, id));
          console.log(`[${tableName}] Set expires_at for id=${id} to ${newExpires.toISOString()}`);
        }
      }
    }
  }
}

async function cleanupExpiredData() {
  const now = new Date();
  let deletedCount = 0;

  console.log(`[${now.toISOString()}] Starting cleanup of expired data`);

  // Delete expired sessions
  try {
    const expiredSessions = await db
      .delete(sessions)
      .where(lt(sessions.expires_at, now))
      .returning({ id: sessions.id });

    console.log(`Deleted ${expiredSessions.length} expired sessions`);
    deletedCount += expiredSessions.length;
  } catch (error) {
    console.error("Error deleting expired sessions:", error);
  }

  // Delete expired imposter games
  try {
    const expiredImposterGames = await db
      .delete(imposter)
      .where(lt(imposter.expires_at, now))
      .returning({ id: imposter.id });

    console.log(`Deleted ${expiredImposterGames.length} expired imposter games`);
    deletedCount += expiredImposterGames.length;
  } catch (error) {
    console.error("Error deleting expired imposter games:", error);
  }

  // Delete expired password games
  try {
    const expiredPasswordGames = await db
      .delete(password_game)
      .where(lt(password_game.expires_at, now))
      .returning({ id: password_game.id });

    console.log(`Deleted ${expiredPasswordGames.length} expired password games`);
    deletedCount += expiredPasswordGames.length;
  } catch (error) {
    console.error("Error deleting expired password games:", error);
  }

  return {
    timestamp: now.toISOString(),
    deletedCount,
    success: true
  };
}

// Export for API route
export { cleanupExpiredData };

async function main() {
  await processTable(sessions, 'sessions');
  await processTable(imposter, 'imposter');
  console.log('Session and game expiration check complete.');

  const cleanupResult = await cleanupExpiredData();
  console.log(`Cleanup complete: ${cleanupResult.deletedCount} items deleted`);
}

main().catch((err) => {
  console.error('Error in expiration script:', err);
  process.exit(1);
});
