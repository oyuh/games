import { generateGameKey } from "@games/shared";
import { gameEncryptionKeys } from "@games/shared/db";
import { and, eq } from "drizzle-orm";
import { drizzleClient, type Db } from "./db-provider";

export type GameType = "imposter" | "password" | "chain_reaction" | "shade_signal" | "location_signal";

/**
 * The game's encryption key, created on first use. Callers inside a
 * transaction pass it as `db`: taking a second pool connection while holding
 * one is how concurrent mutations deadlock the pool.
 */
export async function getOrCreateGameKey(gameType: GameType, gameId: string, db: Db = drizzleClient) {
  const [existing] = await db
    .select({ key: gameEncryptionKeys.encryptionKey })
    .from(gameEncryptionKeys)
    .where(and(eq(gameEncryptionKeys.gameType, gameType), eq(gameEncryptionKeys.gameId, gameId)))
    .limit(1);

  let key = existing?.key;
  if (!key) {
    key = await generateGameKey();
    await db
      .insert(gameEncryptionKeys)
      .values({
        id: crypto.randomUUID(),
        gameType,
        gameId,
        encryptionKey: key,
        createdAt: Date.now(),
      })
      .onConflictDoNothing({ target: [gameEncryptionKeys.gameType, gameEncryptionKeys.gameId] });

    const [inserted] = await db
      .select({ key: gameEncryptionKeys.encryptionKey })
      .from(gameEncryptionKeys)
      .where(and(eq(gameEncryptionKeys.gameType, gameType), eq(gameEncryptionKeys.gameId, gameId)))
      .limit(1);
    key = inserted?.key;
  }

  if (!key) {
    throw new Error("Key unavailable");
  }

  return key;
}
