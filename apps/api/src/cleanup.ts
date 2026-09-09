import { cleanupRuns, sessionArchive, chatMessages, chainReactionGames, gameEncryptionKeys, imposterGames, locationSignalGames, passwordGames, pipsScores, sessions, shadeSignalGames, shikakuScores } from "@games/shared/db";
import { lt, and, count, eq, inArray, ne, sql } from "drizzle-orm";
import { PUZZLES_PER_RUN as ENGINE_SHIKAKU_PUZZLES, validateRankedShikakuRun } from "@games/shared/games/shikaku-engine";
import { PIPS_PUZZLES_PER_RUN as ENGINE_PIPS_PUZZLES, validateRankedPipsRun } from "@games/shared/games/pips-engine";
import { drizzleClient } from "./db-provider";
import { cleanupReportLines, formatCleanupReport } from "./cleanup-report";
import { SHIKAKU_MIN_TIME_MS, SHIKAKU_MAX_TIME_MS, SHIKAKU_MAX_SCORES_PER_SESSION, PIPS_MIN_TOTAL_TIME_MS, PIPS_MIN_SPLIT_TIME_MS, PIPS_MAX_TOTAL_TIME_MS, PIPS_MAX_SCORES_PER_SESSION, PIPS_SPLIT_SUM_TOLERANCE_MS, shikakuMaxScore, isShikakuDifficulty } from "./score-policy";

// ─── Stale game cleanup ────────────────────────────────────
const STALE_MS = 20 * 60 * 1000;   // 20 min idle → end game
const DELETE_MS = 60 * 60 * 1000;  // 1 hr → delete game row
// The archive keeps an ip, so it gets a hard cap rather than living forever.
// ponytail: raw ip with a 30 day cap. If retention ever needs to go longer,
// store an HMAC of it instead and hash the incoming ip in isBanned to match.
const SESSION_ARCHIVE_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

export async function runCleanup(drizzleClient: Parameters<Parameters<typeof import("./db-provider").drizzleClient.transaction>[0]>[0]) {
  const now = Date.now();
  const staleCutoff = now - STALE_MS;
  const deleteCutoff = now - DELETE_MS;

  // ── 1) End stale games (idle > 20min) ──────────────────────
  const endedImposter = await drizzleClient
    .update(imposterGames)
    .set({ phase: "ended", updatedAt: now })
    .where(and(lt(imposterGames.updatedAt, staleCutoff), ne(imposterGames.phase, "ended")))
    .returning({ id: imposterGames.id });

  const endedPassword = await drizzleClient
    .update(passwordGames)
    .set({ phase: "ended", updatedAt: now })
    .where(and(lt(passwordGames.updatedAt, staleCutoff), ne(passwordGames.phase, "ended")))
    .returning({ id: passwordGames.id });

  const endedChain = await drizzleClient
    .update(chainReactionGames)
    .set({ phase: "ended", updatedAt: now })
    .where(and(lt(chainReactionGames.updatedAt, staleCutoff), ne(chainReactionGames.phase, "ended")))
    .returning({ id: chainReactionGames.id });

  const endedShade = await drizzleClient
    .update(shadeSignalGames)
    .set({ phase: "ended", updatedAt: now })
    .where(and(lt(shadeSignalGames.updatedAt, staleCutoff), ne(shadeSignalGames.phase, "ended")))
    .returning({ id: shadeSignalGames.id });

  const endedLocation = await drizzleClient
    .update(locationSignalGames)
    .set({ phase: "ended", updatedAt: now })
    .where(and(lt(locationSignalGames.updatedAt, staleCutoff), ne(locationSignalGames.phase, "ended")))
    .returning({ id: locationSignalGames.id });

  // ── 3) Hard-delete old ended games (1hr+) ──────────────────
  const deletedImposter = await drizzleClient
    .delete(imposterGames)
    .where(and(eq(imposterGames.phase, "ended"), lt(imposterGames.updatedAt, deleteCutoff)))
    .returning({ id: imposterGames.id });

  const deletedPassword = await drizzleClient
    .delete(passwordGames)
    .where(and(eq(passwordGames.phase, "ended"), lt(passwordGames.updatedAt, deleteCutoff)))
    .returning({ id: passwordGames.id });

  const deletedChain = await drizzleClient
    .delete(chainReactionGames)
    .where(and(eq(chainReactionGames.phase, "ended"), lt(chainReactionGames.updatedAt, deleteCutoff)))
    .returning({ id: chainReactionGames.id });

  const deletedShade = await drizzleClient
    .delete(shadeSignalGames)
    .where(and(eq(shadeSignalGames.phase, "ended"), lt(shadeSignalGames.updatedAt, deleteCutoff)))
    .returning({ id: shadeSignalGames.id });

  const deletedLocation = await drizzleClient
    .delete(locationSignalGames)
    .where(and(eq(locationSignalGames.phase, "ended"), lt(locationSignalGames.updatedAt, deleteCutoff)))
    .returning({ id: locationSignalGames.id });

  const allDeletedGameIds = [
    ...deletedImposter.map((g) => g.id),
    ...deletedPassword.map((g) => g.id),
    ...deletedChain.map((g) => g.id),
    ...deletedShade.map((g) => g.id),
    ...deletedLocation.map((g) => g.id),
  ];

  // ── 4) Clean up encryption keys for deleted games ──────────
  let deletedEncryptionKeys = 0;
  if (allDeletedGameIds.length > 0) {
    const deletedKeys = await drizzleClient
      .delete(gameEncryptionKeys)
      .where(inArray(gameEncryptionKeys.gameId, allDeletedGameIds))
      .returning({ id: gameEncryptionKeys.id });
    deletedEncryptionKeys = deletedKeys.length;
  }
  // Also clean any orphaned keys whose game no longer exists
  const orphanedKeys = await drizzleClient.execute(sql`
    DELETE FROM game_encryption_keys
    WHERE game_id NOT IN (
      SELECT id FROM imposter_games
      UNION SELECT id FROM password_games
      UNION SELECT id FROM chain_reaction_games
      UNION SELECT id FROM shade_signal_games
      UNION SELECT id FROM location_signal_games
    )
    RETURNING id
  `);
  const orphanedKeysDeleted = Array.isArray(orphanedKeys) ? orphanedKeys.length : (orphanedKeys.rowCount ?? 0);
  deletedEncryptionKeys += Number(orphanedKeysDeleted);

  // ── 5) Clean up chat messages for deleted games ────────────
  let deletedChatMessages = 0;
  if (allDeletedGameIds.length > 0) {
    const deletedChats = await drizzleClient
      .delete(chatMessages)
      .where(inArray(chatMessages.gameId, allDeletedGameIds))
      .returning({ id: chatMessages.id });
    deletedChatMessages = deletedChats.length;
  }

  // Repair all dangling links, including rooms ended outside cleanup.
  const gameRows = sql`SELECT id, phase::text AS phase FROM imposter_games
    UNION ALL SELECT id, phase::text AS phase FROM password_games
    UNION ALL SELECT id, phase::text AS phase FROM chain_reaction_games
    UNION ALL SELECT id, phase::text AS phase FROM shade_signal_games
    UNION ALL SELECT id, phase::text AS phase FROM location_signal_games`;
  const detachedSessions = await drizzleClient.execute(sql`
    UPDATE sessions SET game_id = NULL, game_type = NULL
    WHERE game_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM (${gameRows}) games WHERE games.id = sessions.game_id AND games.phase <> 'ended'
    ) RETURNING id
  `);
  const orphanedChats = await drizzleClient.execute(sql`
    DELETE FROM chat_messages WHERE NOT EXISTS (
      SELECT 1 FROM (${gameRows}) games WHERE games.id = chat_messages.game_id
    ) RETURNING id
  `);
  deletedChatMessages += orphanedChats.rowCount ?? 0;

  // ── 6) Archive, then delete, stale sessions (1hr+) ─────────
  // Lock the selected rows until their archive and deletion commit together.
  const staleSessions = await drizzleClient
    .select({
      id: sessions.id,
      name: sessions.name,
      avatar: sessions.avatar,
      region: sessions.region,
      ip: sessions.ip,
      createdAt: sessions.createdAt,
      lastSeen: sessions.lastSeen,
    })
    .from(sessions)
    .where(lt(sessions.lastSeen, deleteCutoff))
    .for("update");

  let archivedSessions = 0;
  if (staleSessions.length > 0) {
    await drizzleClient
      .insert(sessionArchive)
      .values(
        staleSessions.map((session) => ({
          id: session.id,
          name: session.name,
          avatar: session.avatar,
          region: session.region,
          ip: session.ip,
          firstSeen: session.createdAt,
          lastSeen: session.lastSeen,
          seenCount: 1,
        }))
      )
      .onConflictDoUpdate({
        target: sessionArchive.id,
        set: {
          // Keep the earliest first_seen and the latest last_seen, and count
          // the visit. A returning id is more interesting than a new one.
          name: sql`excluded.name`,
          avatar: sql`excluded.avatar`,
          region: sql`excluded.region`,
          ip: sql`excluded.ip`,
          firstSeen: sql`least(${sessionArchive.firstSeen}, excluded.first_seen)`,
          lastSeen: sql`greatest(${sessionArchive.lastSeen}, excluded.last_seen)`,
          seenCount: sql`${sessionArchive.seenCount} + 1`,
        },
      });
    archivedSessions = staleSessions.length;
  }

  const deletedSessions = await drizzleClient
    .delete(sessions)
    .where(inArray(sessions.id, staleSessions.map((session) => session.id)))
    .returning({ id: sessions.id });

  // Retention cap. The archive holds an ip, so it must not grow forever.
  const trimmedArchive = await drizzleClient
    .delete(sessionArchive)
    .where(lt(sessionArchive.lastSeen, now - SESSION_ARCHIVE_RETENTION_MS))
    .returning({ id: sessionArchive.id });

  // ── 8) Shikaku: detect and remove suspicious scores ───────
  // Flag scores that exceed the max possible for their time/difficulty
  let shikakuSuspiciousRemoved = 0;
  const allShikakuScoresRaw = await drizzleClient
    .select()
    .from(shikakuScores);

  const suspiciousIds: string[] = [];
  const suspiciousSessions = new Set<string>();
  for (const s of allShikakuScoresRaw) {
    const maxAllowed = shikakuMaxScore(s.timeMs, s.difficulty);
    const minTime = SHIKAKU_MIN_TIME_MS[s.difficulty] ?? 10_000;
    const maxTime = SHIKAKU_MAX_TIME_MS[s.difficulty] ?? 3_600_000;
    // Score exceeds theoretical max (with 5% tolerance for rounding)
    const isInflated = s.score > maxAllowed * 1.05;
    // Impossibly fast
    const isTooFast = s.timeMs < minTime;
    // Unreasonably slow (beyond max allowed time)
    const isTooSlow = s.timeMs > maxTime;
    // Negative/zero score or time
    const isInvalid = !isShikakuDifficulty(s.difficulty) || s.score <= 0 || s.timeMs <= 0
      || s.puzzleCount !== ENGINE_SHIKAKU_PUZZLES || !Number.isInteger(s.seed) || s.seed <= 0;
    // Historical rows can predate replay capture; validate any replay that exists.
    const invalidReplay = s.replayData !== null && isShikakuDifficulty(s.difficulty)
      && !validateRankedShikakuRun({ ...s, difficulty: s.difficulty }).ok;

    if (isInflated || isTooFast || isTooSlow || isInvalid || invalidReplay) {
      suspiciousIds.push(s.id);
      suspiciousSessions.add(s.sessionId);
    }
  }
  if (suspiciousIds.length > 0) {
    await drizzleClient
      .delete(shikakuScores)
      .where(inArray(shikakuScores.id, suspiciousIds));
    shikakuSuspiciousRemoved = suspiciousIds.length;
  }

  const allPipsScores = await drizzleClient.select().from(pipsScores);
  const invalidPips = allPipsScores.filter((score) =>
    score.totalMs < PIPS_MIN_TOTAL_TIME_MS || score.totalMs > PIPS_MAX_TOTAL_TIME_MS
    || [score.easyMs, score.mediumMs, score.hardMs].some((time) => time < PIPS_MIN_SPLIT_TIME_MS)
    || Math.abs(score.easyMs + score.mediumMs + score.hardMs - score.totalMs) > PIPS_SPLIT_SUM_TOLERANCE_MS
    || score.puzzleCount !== ENGINE_PIPS_PUZZLES || score.seed <= 0
    || (score.replayData !== null && !validateRankedPipsRun(score).ok)
  );
  if (invalidPips.length) {
    await drizzleClient.delete(pipsScores).where(inArray(pipsScores.id, invalidPips.map((score) => score.id)));
  }
  // Audit first so invalid scores cannot displace valid personal bests.
  const trimmedShikaku = await drizzleClient.execute(sql`
    DELETE FROM shikaku_scores WHERE id IN (
      SELECT id FROM (SELECT id, row_number() OVER (
        PARTITION BY session_id, difficulty ORDER BY score DESC, created_at ASC, id
      ) AS rank FROM shikaku_scores) ranked WHERE rank > ${SHIKAKU_MAX_SCORES_PER_SESSION}
    ) RETURNING id
  `);
  const trimmedPips = await drizzleClient.execute(sql`
    DELETE FROM pips_scores WHERE id IN (
      SELECT id FROM (SELECT id, row_number() OVER (
        PARTITION BY session_id ORDER BY total_ms ASC, created_at ASC, id
      ) AS rank FROM pips_scores) ranked WHERE rank > ${PIPS_MAX_SCORES_PER_SESSION}
    ) RETURNING id
  `);
  const [pipsCount = { total: 0 }] = await drizzleClient.select({ total: count() }).from(pipsScores);

  // ── 9) Counts for diagnostics ─────────────────────────────
  const [imposterCount = { total: 0 }] = await drizzleClient.select({ total: count() }).from(imposterGames);
  const [passwordCount = { total: 0 }] = await drizzleClient.select({ total: count() }).from(passwordGames);
  const [chainCount = { total: 0 }] = await drizzleClient.select({ total: count() }).from(chainReactionGames);
  const [shadeCount = { total: 0 }] = await drizzleClient.select({ total: count() }).from(shadeSignalGames);
  const [locationCount = { total: 0 }] = await drizzleClient.select({ total: count() }).from(locationSignalGames);
  const [sessionCount = { total: 0 }] = await drizzleClient.select({ total: count() }).from(sessions);
  const [shikakuCount = { total: 0 }] = await drizzleClient.select({ total: count() }).from(shikakuScores);
  const [encKeyCount = { total: 0 }] = await drizzleClient.select({ total: count() }).from(gameEncryptionKeys);

  return {
    ended: {
      imposter: endedImposter.length,
      password: endedPassword.length,
      chainReaction: endedChain.length,
      shadeSignal: endedShade.length,
      locationSignal: endedLocation.length,
    },
    deleted: {
      imposter: deletedImposter.length,
      password: deletedPassword.length,
      chainReaction: deletedChain.length,
      shadeSignal: deletedShade.length,
      locationSignal: deletedLocation.length,
      sessions: deletedSessions.length,
      encryptionKeys: deletedEncryptionKeys,
      chatMessages: deletedChatMessages,
    },
    archive: {
      sessionsArchived: archivedSessions,
      sessionsTrimmed: trimmedArchive.length,
    },
    shikaku: {
      scoresChecked: allShikakuScoresRaw.length,
      scoresTrimmed: trimmedShikaku.rowCount ?? 0,
      suspiciousRemoved: shikakuSuspiciousRemoved,
      suspiciousSessions: suspiciousSessions.size,
    },
    pips: {
      scoresChecked: allPipsScores.length,
      scoresTrimmed: trimmedPips.rowCount ?? 0,
      suspiciousRemoved: invalidPips.length,
    },
    detachedSessions: detachedSessions.rowCount ?? 0,
    cutoffs: {
      stale: new Date(staleCutoff).toISOString(),
      delete: new Date(deleteCutoff).toISOString(),
    },
    totals: {
      imposterGames: imposterCount.total,
      passwordGames: passwordCount.total,
      chainReactionGames: chainCount.total,
      shadeSignalGames: shadeCount.total,
      locationSignalGames: locationCount.total,
      sessions: sessionCount.total,
      pipsScores: pipsCount.total,
      shikakuScores: shikakuCount.total,
      encryptionKeys: encKeyCount.total,
    },
  };
}

export async function recordedCleanup(trigger: string, database = drizzleClient) {
  const id = crypto.randomUUID();
  const startedAt = Date.now();
  let recorded = false;
  try {
    const summary = await database.transaction(async (tx) => {
      const lock = await tx.execute(sql`SELECT pg_try_advisory_xact_lock(714209) AS acquired`);
      if (!lock.rows[0]?.acquired) return null;
      await database.insert(cleanupRuns).values({ id, trigger, startedAt, status: "running" });
      recorded = true;
      const summary = await runCleanup(tx);
      const finishedAt = Date.now();
      const report = cleanupReportLines(summary);
      await tx.update(cleanupRuns).set({ status: "completed", finishedAt, report }).where(eq(cleanupRuns.id, id));
      return summary;
    });
    if (summary) console.log(formatCleanupReport(cleanupReportLines(summary), trigger, Date.now() - startedAt, Boolean((process.stdout.isTTY || process.env.FORCE_COLOR) && !process.env.NO_COLOR)));
    return summary;
  } catch (error) {
    if (recorded) {
      await database.update(cleanupRuns).set({
        status: "failed", finishedAt: Date.now(),
        report: [{ label: "Cleanup failed", value: "Changes rolled back. See server logs for the error.", tone: "error" }],
      }).where(eq(cleanupRuns.id, id));
    }
    throw error;
  }
}
