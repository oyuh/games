import { defineMutator } from "@rocicorp/zero";
import { z } from "zod";
import { zql } from "../schema";
import { decryptSecret, encryptSecret, isEncrypted } from "../../crypto";
import { code, now, shuffle, assertCaller, assertHost, assertHostUser, getGameSecretResolver, isServerTx, sanitizeText, resolvePlayerName } from "./helpers";

function toRadians(deg: number) {
  return (deg * Math.PI) / 180;
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371;
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

const PERFECT_KM = 120.7; // 75 miles

function scoreForDistance(km: number): number {
  if (km <= PERFECT_KM) return 5000;
  // Generous exponential decay: ~2500 at ~2000km, still scoring at 5000km+
  return Math.max(0, Math.round(5000 * Math.exp(-(km - PERFECT_KM) / 3000)));
}

async function encryptLocationTarget(ctx: unknown, gameId: string, target: { lat: number; lng: number }) {
  const resolver = getGameSecretResolver(ctx);
  if (!resolver) {
    return { targetLat: target.lat, targetLng: target.lng, encryptedTarget: null as string | null };
  }
  const key = await resolver("location_signal", gameId);
  return {
    targetLat: null as number | null,
    targetLng: null as number | null,
    encryptedTarget: await encryptSecret(JSON.stringify(target), key),
  };
}

async function resolveLocationTarget(
  ctx: unknown,
  gameId: string,
  game: { target_lat?: number | null; target_lng?: number | null; encrypted_target?: string | null }
) {
  if (typeof game.target_lat === "number" && typeof game.target_lng === "number") {
    return { lat: game.target_lat, lng: game.target_lng };
  }
  if (!game.encrypted_target || !isEncrypted(game.encrypted_target)) {
    return null;
  }
  const resolver = getGameSecretResolver(ctx);
  if (!resolver) {
    return null;
  }
  const key = await resolver("location_signal", gameId);
  const decrypted = await decryptSecret(game.encrypted_target, key);
  const parsed = JSON.parse(decrypted) as { lat?: unknown; lng?: unknown };
  if (typeof parsed.lat !== "number" || typeof parsed.lng !== "number") {
    return null;
  }
  return { lat: parsed.lat, lng: parsed.lng };
}

export const locationSignalMutators = {
  create: defineMutator(
    z.object({
      id: z.string(),
      hostId: z.string(),
      roundsPerPlayer: z.number().min(1).max(3).optional(),
      cluePairs: z.number().min(1).max(4).optional(),
    }),
    async ({ args, tx }) => {
      const ts = now();
      const session = await tx.run(zql.sessions.where("id", args.hostId).one());
      const hostName = resolvePlayerName(session?.name, args.hostId);
      await tx.mutate.location_signal_games.insert({
        id: args.id,
        code: code(),
        host_id: args.hostId,
        phase: "lobby",
        players: [{ sessionId: args.hostId, name: hostName, connected: true, totalScore: 0 }],
        leader_id: null,
        leader_order: [],
        current_leader_index: 0,
        target_lat: null,
        target_lng: null,
        clue1: null,
        clue2: null,
        clue3: null,
        clue4: null,
        guesses: [],
        round_history: [],
        spectators: [],
        kicked: [],
        announcement: null,
        settings: {
          clueDurationSec: 45,
          guessDurationSec: 45,
          roundsPerPlayer: args.roundsPerPlayer ?? 1,
          currentRound: 1,
          phaseEndsAt: null,
          cluePairs: args.cluePairs ?? 2,
        },
        is_public: false,
        created_at: ts,
        updated_at: ts,
      });

      await tx.mutate.sessions.upsert({
        id: args.hostId,
        name: hostName,
        game_type: "location_signal",
        game_id: args.id,
        created_at: ts,
        last_seen: ts,
      });
    }
  ),

  join: defineMutator(
    z.object({ gameId: z.string(), sessionId: z.string() }),
    async ({ args, tx, ctx }) => {
      assertCaller(tx, ctx, args.sessionId);
      const ts = now();
      const session = await tx.run(zql.sessions.where("id", args.sessionId).one());
      const sessionName = resolvePlayerName(session?.name, args.sessionId);
      const game = await tx.run(zql.location_signal_games.where("id", args.gameId).one());
      if (!game) throw new Error("Game not found");
      if (game.kicked.includes(args.sessionId)) throw new Error("You have been kicked from this game");
      const existing = game.players.find((p) => p.sessionId === args.sessionId);

      if (game.phase !== "lobby") {
        if (existing) {
          await tx.mutate.location_signal_games.update({
            id: game.id,
            players: game.players.map((p) =>
              p.sessionId === args.sessionId ? { ...p, connected: true, name: resolvePlayerName(session?.name ?? p.name, args.sessionId) } : p
            ),
            updated_at: ts,
          });
        } else if (!game.spectators.some((s) => s.sessionId === args.sessionId)) {
          await tx.mutate.location_signal_games.update({
            id: game.id,
            spectators: [...game.spectators, { sessionId: args.sessionId, name: sessionName }],
            updated_at: ts,
          });
        }
      } else {
        const players = existing
          ? game.players.map((p) =>
              p.sessionId === args.sessionId ? { ...p, connected: true, name: resolvePlayerName(session?.name ?? p.name, args.sessionId) } : p
            )
          : [...game.players, { sessionId: args.sessionId, name: sessionName, connected: true, totalScore: 0 }];

        await tx.mutate.location_signal_games.update({
          id: game.id,
          players,
          updated_at: ts,
        });
      }

      await tx.mutate.sessions.upsert({
        id: args.sessionId,
        name: sessionName,
        game_type: "location_signal",
        game_id: args.gameId,
        created_at: ts,
        last_seen: ts,
      });
    }
  ),

  leave: defineMutator(
    z.object({ gameId: z.string(), sessionId: z.string() }),
    async ({ args, tx, ctx }) => {
      assertCaller(tx, ctx, args.sessionId);
      const ts = now();
      const game = await tx.run(zql.location_signal_games.where("id", args.gameId).one());
      if (!game) return;

      if (game.host_id === args.sessionId) {
        await tx.mutate.location_signal_games.update({
          id: game.id,
          phase: "ended",
          settings: { ...game.settings, phaseEndsAt: null },
          updated_at: ts,
        });
      } else {
        await tx.mutate.location_signal_games.update({
          id: game.id,
          players: game.players.filter((p) => p.sessionId !== args.sessionId),
          spectators: game.spectators.filter((s) => s.sessionId !== args.sessionId),
          updated_at: ts,
        });
      }

      const currentSession = await tx.run(zql.sessions.where("id", args.sessionId).one());
      if (currentSession) {
        await tx.mutate.sessions.update({
          id: args.sessionId,
          game_type: undefined,
          game_id: undefined,
          last_seen: ts,
        });
      }
    }
  ),

  start: defineMutator(
    z.object({ gameId: z.string(), hostId: z.string() }),
    async ({ args, tx, ctx }) => {
      assertHost(tx, ctx, args.hostId, args.hostId);
      const ts = now();
      const game = await tx.run(zql.location_signal_games.where("id", args.gameId).one());
      if (!game) throw new Error("Game not found");
      if (game.host_id !== args.hostId) throw new Error("Only host can start");
      if (game.players.length < 2) throw new Error("Need at least 2 players");

      const leaderOrder = shuffle(game.players).map((p) => p.sessionId);
      await tx.mutate.location_signal_games.update({
        id: game.id,
        phase: "picking",
        leader_order: leaderOrder,
        leader_id: leaderOrder[0] ?? null,
        current_leader_index: 0,
        target_lat: null,
        target_lng: null,
        encrypted_target: null,
        clue1: null,
        clue2: null,
        clue3: null,
        clue4: null,
        guesses: [],
        settings: { ...game.settings, currentRound: 1, phaseEndsAt: null },
        updated_at: ts,
      });
    }
  ),

  setTarget: defineMutator(
    z.object({ gameId: z.string(), sessionId: z.string(), lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }),
    async ({ args, tx, ctx }) => {
      assertCaller(tx, ctx, args.sessionId);
      const ts = now();
      const game = await tx.run(zql.location_signal_games.where("id", args.gameId).one());
      if (!game) throw new Error("Game not found");
      if (game.phase !== "picking") throw new Error("Not in picking phase");
      if (game.leader_id !== args.sessionId) throw new Error("Only the leader can set target");
      const nextTarget = isServerTx(tx)
        ? await encryptLocationTarget(ctx, args.gameId, { lat: args.lat, lng: args.lng })
        : { targetLat: args.lat, targetLng: args.lng, encryptedTarget: null as string | null };

      await tx.mutate.location_signal_games.update({
        id: game.id,
        phase: "clue1",
        target_lat: nextTarget.targetLat,
        target_lng: nextTarget.targetLng,
        encrypted_target: nextTarget.encryptedTarget,
        settings: { ...game.settings, phaseEndsAt: ts + game.settings.clueDurationSec * 1000 },
        updated_at: ts,
      });
    }
  ),

  submitClue: defineMutator(
    z.object({ gameId: z.string(), sessionId: z.string(), round: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]), text: z.string().min(1).max(80) }),
    async ({ args, tx, ctx }) => {
      assertCaller(tx, ctx, args.sessionId);
      const ts = now();
      const game = await tx.run(zql.location_signal_games.where("id", args.gameId).one());
      if (!game) throw new Error("Game not found");
      if (game.leader_id !== args.sessionId) throw new Error("Only leader can submit clues");

      const trimmed = sanitizeText(args.text);
      if (!trimmed) throw new Error("Clue cannot be empty");
      const guessPhase = `guess${args.round}` as const;
      const clueField = `clue${args.round}` as "clue1" | "clue2" | "clue3" | "clue4";
      await tx.mutate.location_signal_games.update({
        id: game.id,
        phase: guessPhase,
        [clueField]: trimmed,
        settings: { ...game.settings, phaseEndsAt: ts + game.settings.guessDurationSec * 1000 },
        updated_at: ts,
      });
    }
  ),

  submitGuess: defineMutator(
    z.object({ gameId: z.string(), sessionId: z.string(), round: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]), lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }),
    async ({ args, tx, ctx }) => {
      assertCaller(tx, ctx, args.sessionId);
      const ts = now();
      const game = await tx.run(zql.location_signal_games.where("id", args.gameId).one());
      if (!game) throw new Error("Game not found");
      const expectedPhase = `guess${args.round}` as const;
      if (game.phase !== expectedPhase) throw new Error("Not in the matching guess phase");
      if (!game.leader_id) throw new Error("No active leader");
      if (args.sessionId === game.leader_id) throw new Error("Leader cannot submit guesses");
      if (!game.players.some((player) => player.sessionId === args.sessionId)) {
        throw new Error("Only players in the game can guess");
      }

      const withoutExisting = game.guesses.filter((g) => !(g.sessionId === args.sessionId && g.round === args.round));
      const guesses = [...withoutExisting, { sessionId: args.sessionId, round: args.round, lat: args.lat, lng: args.lng }];

      // Duel perfect-score shortcut: if there's exactly 1 guesser and they nailed it, skip to reveal
      const guessersCount = game.players.filter((p) => p.sessionId !== game.leader_id).length;
      const isDuel = guessersCount === 1;
      const target = await resolveLocationTarget(ctx, args.gameId, game);
      if (isDuel && target) {
        const km = haversineKm(target.lat, target.lng, args.lat, args.lng);
        if (km <= PERFECT_KM) {
          const scores = game.players.reduce<Record<string, number>>((acc, p) => {
            acc[p.sessionId] = p.totalScore;
            return acc;
          }, {});
          scores[args.sessionId] = (scores[args.sessionId] ?? 0) + 5000;

          const players = game.players.map((player) => ({
            ...player,
            totalScore: scores[player.sessionId] ?? player.totalScore,
          }));

          const nextHistory = [
            ...game.round_history,
            {
              round: game.settings.currentRound,
              leaderId: game.leader_id,
              target,
              clue1: game.clue1, clue2: game.clue2, clue3: game.clue3, clue4: game.clue4,
              guesses,
              scores,
            },
          ];

          await tx.mutate.location_signal_games.update({
            id: game.id,
            guesses,
            phase: "reveal",
            target_lat: target.lat,
            target_lng: target.lng,
            encrypted_target: null,
            players,
            round_history: nextHistory,
            settings: { ...game.settings, phaseEndsAt: null },
            updated_at: ts,
          });
          return;
        }
      }

      // Check if all guessers have submitted for this round
      const roundGuesses = guesses.filter((g) => g.round === args.round);
      const uniqueGuessers = new Set(roundGuesses.map((g) => g.sessionId));
      const allSubmitted = uniqueGuessers.size >= guessersCount;

      // When everyone locks in, set a 5-second grace timer instead of waiting
      let nextPhaseEndsAt = game.settings.phaseEndsAt;
      if (allSubmitted) {
        nextPhaseEndsAt = ts + 5000;
      }

      await tx.mutate.location_signal_games.update({
        id: game.id,
        guesses,
        settings: { ...game.settings, phaseEndsAt: nextPhaseEndsAt },
        updated_at: ts,
      });
    }
  ),

  revealRound: defineMutator(
    z.object({ gameId: z.string(), hostId: z.string() }),
    async ({ args, tx, ctx }) => {
      assertHost(tx, ctx, args.hostId, args.hostId);
      const ts = now();
      const game = await tx.run(zql.location_signal_games.where("id", args.gameId).one());
      if (!game) throw new Error("Game not found");
      if (game.host_id !== args.hostId) throw new Error("Only host can advance");
      const target = await resolveLocationTarget(ctx, args.gameId, game);
      if (!target || !game.leader_id) throw new Error("Round target is missing");

      const cluePairs = game.settings.cluePairs ?? 2;

      // Determine which guess phase we're currently in
      const currentGuessRound =
        game.phase === "guess1" ? 1 :
        game.phase === "guess2" ? 2 :
        game.phase === "guess3" ? 3 :
        game.phase === "guess4" ? 4 : cluePairs;

      // If there are more clue/guess rounds left, advance to next clue phase
      if (currentGuessRound < cluePairs) {
        const nextCluePhase = `clue${currentGuessRound + 1}` as "clue2" | "clue3" | "clue4";
        await tx.mutate.location_signal_games.update({
          id: game.id,
          phase: nextCluePhase,
          settings: { ...game.settings, phaseEndsAt: ts + game.settings.clueDurationSec * 1000 },
          updated_at: ts,
        });
        return;
      }

      // Last guess round — reveal and score
      const bestGuesses = new Map<string, { sessionId: string; round: number; lat: number; lng: number }>();
      for (const g of game.guesses) {
        const existing = bestGuesses.get(g.sessionId);
        if (!existing || g.round > existing.round) {
          bestGuesses.set(g.sessionId, g);
        }
      }

      const scores = { ...(game.players.reduce<Record<string, number>>((acc, p) => {
        acc[p.sessionId] = p.totalScore;
        return acc;
      }, {})) };

      for (const player of game.players) {
        if (player.sessionId === game.leader_id) continue;
        const guess = bestGuesses.get(player.sessionId);
        if (!guess) continue;
        const km = haversineKm(target.lat, target.lng, guess.lat, guess.lng);
        scores[player.sessionId] = (scores[player.sessionId] ?? 0) + scoreForDistance(km);
      }

      const players = game.players.map((player) => ({
        ...player,
        totalScore: scores[player.sessionId] ?? player.totalScore,
      }));

      const nextHistory = [
        ...game.round_history,
        {
          round: game.settings.currentRound,
          leaderId: game.leader_id,
          target,
          clue1: game.clue1,
          clue2: game.clue2,
          clue3: game.clue3,
          clue4: game.clue4,
          guesses: game.guesses,
          scores,
        },
      ];

      await tx.mutate.location_signal_games.update({
        id: game.id,
        phase: "reveal",
        target_lat: target.lat,
        target_lng: target.lng,
        encrypted_target: null,
        players,
        round_history: nextHistory,
        settings: { ...game.settings, phaseEndsAt: null },
        updated_at: ts,
      });
    }
  ),

  nextRound: defineMutator(
    z.object({ gameId: z.string(), hostId: z.string() }),
    async ({ args, tx, ctx }) => {
      assertHost(tx, ctx, args.hostId, args.hostId);
      const ts = now();
      const game = await tx.run(zql.location_signal_games.where("id", args.gameId).one());
      if (!game) throw new Error("Game not found");
      if (game.host_id !== args.hostId) throw new Error("Only host can advance");

      const maxRounds = Math.max(1, game.settings.roundsPerPlayer) * Math.max(1, game.leader_order.length);
      const nextRoundNum = game.settings.currentRound + 1;
      if (nextRoundNum > maxRounds) {
        await tx.mutate.location_signal_games.update({
          id: game.id,
          phase: "finished",
          settings: { ...game.settings, phaseEndsAt: null },
          updated_at: ts,
        });
        return;
      }

      const nextLeaderIndex = (game.current_leader_index + 1) % game.leader_order.length;
      const nextLeaderId = game.leader_order[nextLeaderIndex] ?? null;

      await tx.mutate.location_signal_games.update({
        id: game.id,
        phase: "picking",
        current_leader_index: nextLeaderIndex,
        leader_id: nextLeaderId,
        target_lat: null,
        target_lng: null,
        encrypted_target: null,
        clue1: null,
        clue2: null,
        clue3: null,
        clue4: null,
        guesses: [],
        settings: {
          ...game.settings,
          currentRound: nextRoundNum,
          phaseEndsAt: null,
        },
        updated_at: ts,
      });
    }
  ),

  advanceTimer: defineMutator(
    z.object({ gameId: z.string() }),
    async ({ args, tx, ctx }) => {
      const game = await tx.run(zql.location_signal_games.where("id", args.gameId).one());
      if (!game) return;
      assertHostUser(tx, ctx, game.host_id);
      const phaseEnd = game.settings.phaseEndsAt;
      if (!phaseEnd || phaseEnd > now()) return;

      const cluePairs = game.settings.cluePairs ?? 2;

      if (game.phase.startsWith("clue")) {
        // Leader didn't submit clue in time — skip to guess phase anyway
        const clueRound = Number(game.phase.replace("clue", ""));
        const guessPhase = `guess${clueRound}` as typeof game.phase;
        await tx.mutate.location_signal_games.update({
          id: game.id,
          phase: guessPhase,
          settings: { ...game.settings, phaseEndsAt: now() + game.settings.guessDurationSec * 1000 },
          updated_at: now(),
        });
      } else if (game.phase.startsWith("guess")) {
        const guessRound = Number(game.phase.replace("guess", ""));

        if (guessRound < cluePairs) {
          // Not last guess round — advance to next clue phase
          const nextCluePhase = `clue${guessRound + 1}` as typeof game.phase;
          await tx.mutate.location_signal_games.update({
            id: game.id,
            phase: nextCluePhase,
            settings: { ...game.settings, phaseEndsAt: now() + game.settings.clueDurationSec * 1000 },
            updated_at: now(),
          });
        } else {
          // Last guess round — score and go to reveal
          const target = await resolveLocationTarget(ctx, args.gameId, game);
          if (!target || !game.leader_id) {
            // Missing target — skip to reveal anyway
            await tx.mutate.location_signal_games.update({
              id: game.id,
              phase: "reveal",
              settings: { ...game.settings, phaseEndsAt: now() + 10000 },
              updated_at: now(),
            });
            return;
          }

          const bestGuesses = new Map<string, { sessionId: string; round: number; lat: number; lng: number }>();
          for (const g of game.guesses) {
            const existing = bestGuesses.get(g.sessionId);
            if (!existing || g.round > existing.round) {
              bestGuesses.set(g.sessionId, g);
            }
          }

          const scores = { ...(game.players.reduce<Record<string, number>>((acc, p) => {
            acc[p.sessionId] = p.totalScore;
            return acc;
          }, {})) };

          for (const player of game.players) {
            if (player.sessionId === game.leader_id) continue;
            const guess = bestGuesses.get(player.sessionId);
            if (!guess) continue;
            const km = haversineKm(target.lat, target.lng, guess.lat, guess.lng);
            scores[player.sessionId] = (scores[player.sessionId] ?? 0) + scoreForDistance(km);
          }

          const players = game.players.map((player) => ({
            ...player,
            totalScore: scores[player.sessionId] ?? player.totalScore,
          }));

          const nextHistory = [
            ...game.round_history,
            {
              round: game.settings.currentRound,
              leaderId: game.leader_id,
              target,
              clue1: game.clue1,
              clue2: game.clue2,
              clue3: game.clue3,
              clue4: game.clue4,
              guesses: game.guesses,
              scores,
            },
          ];

          await tx.mutate.location_signal_games.update({
            id: game.id,
            phase: "reveal",
            target_lat: target.lat,
            target_lng: target.lng,
            encrypted_target: null,
            players,
            round_history: nextHistory,
            settings: { ...game.settings, phaseEndsAt: now() + 10000 },
            updated_at: now(),
          });
        }
      } else if (game.phase === "reveal") {
        // Auto-advance: start next round or finish
        const totalRounds = game.leader_order.length * Math.max(1, game.settings.roundsPerPlayer);
        const nextRound = game.settings.currentRound + 1;

        if (nextRound > totalRounds) {
          await tx.mutate.location_signal_games.update({
            id: game.id,
            phase: "finished",
            settings: { ...game.settings, phaseEndsAt: null },
            updated_at: now(),
          });
          return;
        }

        const nextLeaderIndex = (game.current_leader_index + 1) % game.leader_order.length;
        const nextLeaderId = game.leader_order[nextLeaderIndex] ?? null;

        await tx.mutate.location_signal_games.update({
          id: game.id,
          phase: "picking",
          current_leader_index: nextLeaderIndex,
          leader_id: nextLeaderId,
          target_lat: null,
          target_lng: null,
          encrypted_target: null,
          clue1: null,
          clue2: null,
          clue3: null,
          clue4: null,
          guesses: [],
          settings: {
            ...game.settings,
            currentRound: nextRound,
            phaseEndsAt: null,
          },
          updated_at: now(),
        });
      }
    }
  ),

  kick: defineMutator(
    z.object({ gameId: z.string(), hostId: z.string(), targetId: z.string() }),
    async ({ args, tx, ctx }) => {
      assertHost(tx, ctx, args.hostId, args.hostId);
      const game = await tx.run(zql.location_signal_games.where("id", args.gameId).one());
      if (!game) throw new Error("Game not found");
      if (game.host_id !== args.hostId) throw new Error("Only host can kick");
      if (args.targetId === args.hostId) throw new Error("Cannot kick yourself");

      await tx.mutate.location_signal_games.update({
        id: game.id,
        players: game.players.filter((p) => p.sessionId !== args.targetId),
        spectators: game.spectators.filter((s) => s.sessionId !== args.targetId),
        kicked: [...game.kicked, args.targetId],
        updated_at: now(),
      });
      await tx.mutate.sessions.update({
        id: args.targetId,
        game_type: undefined,
        game_id: undefined,
        last_seen: now(),
      });
    }
  ),

  announce: defineMutator(
    z.object({ gameId: z.string(), hostId: z.string(), text: z.string().min(1).max(200) }),
    async ({ args, tx, ctx }) => {
      assertHost(tx, ctx, args.hostId, args.hostId);
      const game = await tx.run(zql.location_signal_games.where("id", args.gameId).one());
      if (!game) throw new Error("Game not found");
      if (game.host_id !== args.hostId) throw new Error("Only host can announce");
      const cleanText = sanitizeText(args.text);
      if (!cleanText) throw new Error("Announcement cannot be empty");
      await tx.mutate.location_signal_games.update({
        id: game.id,
        announcement: { text: cleanText, ts: now() },
        updated_at: now(),
      });
    }
  ),

  endGame: defineMutator(
    z.object({ gameId: z.string(), hostId: z.string() }),
    async ({ args, tx, ctx }) => {
      assertHost(tx, ctx, args.hostId, args.hostId);
      const game = await tx.run(zql.location_signal_games.where("id", args.gameId).one());
      if (!game) throw new Error("Game not found");
      if (game.host_id !== args.hostId) throw new Error("Only host can end game");

      await tx.mutate.location_signal_games.update({
        id: game.id,
        phase: "ended",
        settings: { ...game.settings, phaseEndsAt: null },
        updated_at: now(),
      });
      const gameSessions = await tx.run(
        zql.sessions.where("game_type", "location_signal").where("game_id", game.id)
      );
      for (const s of gameSessions) {
        await tx.mutate.sessions.update({
          id: s.id,
          game_type: undefined,
          game_id: undefined,
          last_seen: now(),
        });
      }
    }
  ),

  joinAsSpectator: defineMutator(
    z.object({ gameId: z.string(), sessionId: z.string() }),
    async ({ args, tx, ctx }) => {
      assertCaller(tx, ctx, args.sessionId);
      const session = await tx.run(zql.sessions.where("id", args.sessionId).one());
      const sessionName = resolvePlayerName(session?.name, args.sessionId);
      const game = await tx.run(zql.location_signal_games.where("id", args.gameId).one());
      if (!game) throw new Error("Game not found");
      if (game.phase === "ended" || game.phase === "finished") throw new Error("Game has ended");
      if (game.kicked.includes(args.sessionId)) throw new Error("You have been kicked");
      if (game.players.some((p) => p.sessionId === args.sessionId)) throw new Error("Already in game");
      if (game.spectators.find((s) => s.sessionId === args.sessionId)) return;

      await tx.mutate.location_signal_games.update({
        id: game.id,
        spectators: [...game.spectators, { sessionId: args.sessionId, name: sessionName }],
        updated_at: now(),
      });
      await tx.mutate.sessions.upsert({
        id: args.sessionId,
        name: sessionName,
        game_type: "location_signal",
        game_id: game.id,
        created_at: now(),
        last_seen: now(),
      });
    }
  ),

  leaveSpectator: defineMutator(
    z.object({ gameId: z.string(), sessionId: z.string() }),
    async ({ args, tx, ctx }) => {
      assertCaller(tx, ctx, args.sessionId);
      const game = await tx.run(zql.location_signal_games.where("id", args.gameId).one());
      if (!game) return;
      await tx.mutate.location_signal_games.update({
        id: game.id,
        spectators: game.spectators.filter((s) => s.sessionId !== args.sessionId),
        updated_at: now(),
      });
      await tx.mutate.sessions.update({
        id: args.sessionId,
        game_type: undefined,
        game_id: undefined,
        last_seen: now(),
      });
    }
  ),

  removeSpectator: defineMutator(
    z.object({ gameId: z.string(), hostId: z.string(), targetId: z.string() }),
    async ({ args, tx, ctx }) => {
      assertHost(tx, ctx, args.hostId, args.hostId);
      const game = await tx.run(zql.location_signal_games.where("id", args.gameId).one());
      if (!game) throw new Error("Game not found");
      if (game.host_id !== args.hostId) throw new Error("Only host can remove spectators");

      await tx.mutate.location_signal_games.update({
        id: game.id,
        spectators: game.spectators.filter((s) => s.sessionId !== args.targetId),
        updated_at: now(),
      });
      await tx.mutate.sessions.update({
        id: args.targetId,
        game_type: undefined,
        game_id: undefined,
        last_seen: now(),
      });
    }
  ),

  resetToLobby: defineMutator(
    z.object({ gameId: z.string(), hostId: z.string() }),
    async ({ args, tx, ctx }) => {
      assertHost(tx, ctx, args.hostId, args.hostId);
      const game = await tx.run(zql.location_signal_games.where("id", args.gameId).one());
      if (!game) throw new Error("Game not found");
      if (game.host_id !== args.hostId) throw new Error("Only host can reset");

      const players = game.players.map((p) => ({ ...p, totalScore: 0 }));
      await tx.mutate.location_signal_games.update({
        id: game.id,
        phase: "lobby",
        players,
        leader_id: null,
        leader_order: [],
        current_leader_index: 0,
        target_lat: null,
        target_lng: null,
        encrypted_target: null,
        clue1: null,
        clue2: null,
        clue3: null,
        clue4: null,
        guesses: [],
        round_history: [],
        spectators: [],
        settings: {
          ...game.settings,
          currentRound: 1,
          phaseEndsAt: null,
        },
        updated_at: now(),
      });
    }
  ),

  setPublic: defineMutator(
    z.object({ gameId: z.string(), hostId: z.string(), isPublic: z.boolean() }),
    async ({ args, tx, ctx }) => {
      assertHost(tx, ctx, args.hostId, args.hostId);
      const game = await tx.run(zql.location_signal_games.where("id", args.gameId).one());
      if (!game || game.host_id !== args.hostId) throw new Error("Only host can change visibility");
      if (game.phase === "ended") throw new Error("Game has ended");
      await tx.mutate.location_signal_games.update({
        id: game.id,
        is_public: args.isPublic,
        updated_at: now(),
      });
    }
  ),
};
