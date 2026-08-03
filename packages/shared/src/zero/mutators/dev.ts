/**
 * Dev-only mutators for driving a lobby without real players.
 *
 * These deliberately contain NO game logic of their own. Every action routes
 * through the real game mutator, so a lobby full of bots hits exactly the same
 * validation, scoring and phase transitions a lobby of humans would. If a game
 * rule changes, these follow it for free.
 *
 * Blocked in production by the `dev.` gate in apps/api/src/index.ts, the same
 * gate that already covers `demo.`.
 */
import { defineMutator, type Transaction } from "@rocicorp/zero";
import { z } from "zod";
import { zql } from "../schema";
import { now, randomPlayerName, pickRandom, pickChain, isClueTooSimilar } from "./helpers";
import { imposterMutators } from "./imposter";
import { passwordMutators, resolveActiveRoundWord } from "./password";
import { chainReactionMutators } from "./chain-reaction";
import { shadeSignalMutators } from "./shade-signal";
import { locationSignalMutators } from "./location-signal";

const BOT_PREFIX = "bot-";

/** Bots are identified purely by their session id prefix, so nothing else in the schema had to change. */
export const isDevBot = (sessionId: string) => sessionId.startsWith(BOT_PREFIX);

const newBotId = () => `${BOT_PREFIX}${Math.random().toString(36).slice(2, 10)}`;

const gameTypeSchema = z.enum([
  "imposter",
  "password",
  "chain_reaction",
  "shade_signal",
  "location_signal"
]);

const target = z.object({ gameId: z.string(), gameType: gameTypeSchema });

/**
 * Real mutators check `ctx.userId` against the session id in their args. A bot
 * has no browser session to prove, so it gets an anon context. That is the same
 * escape hatch the guards already use when zero-cache doesn't forward the
 * identity header. `resolveGameSecretKey` is preserved so encrypted words still
 * decrypt for the bots that need to read them.
 */
function botCtx(ctx: unknown) {
  const base = ctx && typeof ctx === "object" ? ctx : {};
  return { ...base, userId: "anon" };
}

/** Filler text. No color names, so shade signal's "no color names" rule stays happy. */
const BOT_WORDS = [
  "Whisper", "Velvet", "Thunder", "Meadow", "Lantern", "Harbor",
  "Comet", "Puzzle", "Anchor", "Prism", "Cabin", "Signal"
];

const joinFor = {
  imposter: imposterMutators.join,
  password: passwordMutators.join,
  chain_reaction: chainReactionMutators.join,
  shade_signal: shadeSignalMutators.join,
  location_signal: locationSignalMutators.join
} as const;

const leaveFor = {
  imposter: imposterMutators.leave,
  password: passwordMutators.leave,
  chain_reaction: chainReactionMutators.leave,
  shade_signal: shadeSignalMutators.leave,
  location_signal: locationSignalMutators.leave
} as const;

const removeSpectatorFor = {
  imposter: imposterMutators.removeSpectator,
  password: passwordMutators.removeSpectator,
  chain_reaction: chainReactionMutators.removeSpectator,
  shade_signal: shadeSignalMutators.removeSpectator,
  location_signal: locationSignalMutators.removeSpectator
} as const;

const createFor = {
  imposter: imposterMutators.create,
  password: passwordMutators.create,
  chain_reaction: chainReactionMutators.create,
  shade_signal: shadeSignalMutators.create,
  location_signal: locationSignalMutators.create
} as const;

const startFor = {
  imposter: imposterMutators.start,
  password: passwordMutators.start,
  chain_reaction: chainReactionMutators.start,
  shade_signal: shadeSignalMutators.start,
  location_signal: locationSignalMutators.start
} as const;

const kickFor = {
  imposter: imposterMutators.kick,
  password: passwordMutators.kick,
  chain_reaction: chainReactionMutators.kick,
  shade_signal: shadeSignalMutators.kick,
  location_signal: locationSignalMutators.kick
} as const;

const endGameFor = {
  imposter: imposterMutators.endGame,
  password: passwordMutators.endGame,
  chain_reaction: chainReactionMutators.endGame,
  shade_signal: shadeSignalMutators.endGame,
  location_signal: locationSignalMutators.endGame
} as const;

/** What `.fn` accepts (widened by Zero); reads need the concrete `Transaction`. */
type Tx = Parameters<typeof imposterMutators.join.fn>[0]["tx"];
type ReadTx = Transaction;
type DevGameType = z.infer<typeof gameTypeSchema>;

/** The handful of fields the dev tools read, shared across all five game tables. */
type GameRow = {
  host_id: string;
  phase: string;
  players?: Array<{ sessionId: string }>;
  teams?: Array<{ members: string[] }>;
  spectators?: Array<{ sessionId: string }>;
};

/** Each table is a distinct type to Zero, so the read is branched once here. */
async function loadGame(tx: ReadTx, gameType: DevGameType, gameId: string) {
  const row = gameType === "imposter"
    ? await tx.run(zql.imposter_games.where("id", gameId).one())
    : gameType === "password"
    ? await tx.run(zql.password_games.where("id", gameId).one())
    : gameType === "chain_reaction"
    ? await tx.run(zql.chain_reaction_games.where("id", gameId).one())
    : gameType === "shade_signal"
    ? await tx.run(zql.shade_signal_games.where("id", gameId).one())
    : await tx.run(zql.location_signal_games.where("id", gameId).one());
  return (row ?? undefined) as GameRow | undefined;
}

/** A bot doing something a human wouldn't be allowed to yet is normal, so keep going. */
async function attempt(run: () => Promise<unknown>) {
  try {
    await run();
  } catch {
    // Phase flipped mid-loop, or this bot had nothing valid to do. Not a failure.
  }
}

/** Creates bot sessions and walks them through the game's real join mutator. */
async function addBots(tx: ReadTx, ctx: unknown, gameType: DevGameType, gameId: string, count: number) {
  const ts = now();
  for (let i = 0; i < count; i++) {
    const sessionId = newBotId();
    await tx.mutate.sessions.upsert({
      id: sessionId,
      name: randomPlayerName(),
      activity: gameType,
      created_at: ts,
      last_seen: ts
    });
    await attempt(() =>
      joinFor[gameType].fn({ args: { gameId, sessionId }, tx: tx as Tx, ctx: botCtx(ctx) })
    );
  }
}

/** Round number encoded in phases like "clue2" / "guess3". */
const phaseRound = (phase: string) => Number(phase.slice(-1)) as 1 | 2 | 3 | 4;

export const devMutators = {
  /**
   * Adds `count` bots to a lobby by running the game's real join mutator, so
   * team assignment, kick lists, player caps and spectator fallback all behave.
   */
  fillLobby: defineMutator(
    target.extend({ count: z.number().min(1).max(12) }),
    async ({ args, tx, ctx }) => {
      await addBots(tx, ctx, args.gameType, args.gameId, args.count);
    }
  ),

  /**
   * Creates a game that a BOT hosts, so the human who joins next is an ordinary
   * player. That is the only way to exercise being kicked, being removed as a
   * spectator, or watching a host start a game you do not control.
   */
  createHosted: defineMutator(
    z.object({ id: z.string(), gameType: gameTypeSchema, bots: z.number().min(1).max(12) }),
    async ({ args, tx, ctx }) => {
      const ts = now();
      const hostId = newBotId();
      await tx.mutate.sessions.upsert({
        id: hostId,
        name: randomPlayerName(),
        activity: args.gameType,
        created_at: ts,
        last_seen: ts
      });
      // Every create takes just id + hostId; the rest of its options default.
      await createFor[args.gameType].fn({
        args: { id: args.id, hostId },
        tx: tx as Tx,
        ctx: botCtx(ctx)
      });
      // The host counts as the first bot.
      await addBots(tx, ctx, args.gameType, args.id, args.bots - 1);
    }
  ),

  /**
   * Performs a host-only action as the game's actual (bot) host. The host id is
   * read from the game rather than passed in, both because the caller is not
   * the host and because `hostId` in mutator args is rewritten to the caller by
   * the API's identity guard.
   */
  asHost: defineMutator(
    target.extend({
      action: z.enum(["start", "kick", "removeSpectator", "endGame"]),
      targetId: z.string().optional()
    }),
    async ({ args, tx, ctx }) => {
      const game = await loadGame(tx, args.gameType, args.gameId);
      if (!game) return;
      const shared = { gameId: args.gameId, hostId: game.host_id };
      const bot = botCtx(ctx);
      const t = tx as Tx;

      if (args.action === "start") {
        await startFor[args.gameType].fn({ args: shared, tx: t, ctx: bot });
        return;
      }
      if (args.action === "endGame") {
        await endGameFor[args.gameType].fn({ args: shared, tx: t, ctx: bot });
        return;
      }

      // kick and removeSpectator both need someone to act on.
      if (!args.targetId) return;
      const withTarget = { ...shared, targetId: args.targetId };
      if (args.action === "kick") {
        await kickFor[args.gameType].fn({ args: withTarget, tx: t, ctx: bot });
        return;
      }
      await removeSpectatorFor[args.gameType].fn({ args: withTarget, tx: t, ctx: bot });
    }
  ),

  /**
   * Removes every bot from the game via the real leave / removeSpectator
   * mutators, then drops their sessions. Spectators matter because games move
   * eliminated players there, so a bot can outlive the players array.
   */
  clearBots: defineMutator(target, async ({ args, tx, ctx }) => {
    const row = await loadGame(tx, args.gameType, args.gameId);
    if (!row) return;

    // Password keeps players in teams; every other game has a flat players array.
    const playerIds = (row.teams
      ? row.teams.flatMap((team) => team.members)
      : (row.players ?? []).map((p) => p.sessionId)).filter(isDevBot);
    const spectatorIds = (row.spectators ?? []).map((s) => s.sessionId).filter(isDevBot);

    for (const sessionId of playerIds) {
      await attempt(() =>
        leaveFor[args.gameType].fn({
          args: { gameId: args.gameId, sessionId },
          tx: tx as Tx,
          ctx: botCtx(ctx)
        })
      );
    }

    for (const sessionId of spectatorIds) {
      await attempt(() =>
        removeSpectatorFor[args.gameType].fn({
          args: { gameId: args.gameId, hostId: row.host_id, targetId: sessionId },
          tx: tx as Tx,
          ctx: botCtx(ctx)
        })
      );
    }

    for (const sessionId of [...playerIds, ...spectatorIds]) {
      await tx.mutate.sessions.delete({ id: sessionId });
    }
  }),

  /**
   * Expires the current phase timer. Pair this with the game's own
   * `advanceTimer` mutator, which is what actually performs the transition,
   * so phase logic is never reimplemented here.
   */
  expirePhase: defineMutator(target, async ({ args, tx }) => {
    const id = args.gameId;
    const ts = now();

    if (args.gameType === "imposter") {
      const g = await tx.run(zql.imposter_games.where("id", id).one());
      if (g) await tx.mutate.imposter_games.update({ id, settings: { ...g.settings, phaseEndsAt: 1 }, updated_at: ts });
      return;
    }
    if (args.gameType === "password") {
      const g = await tx.run(zql.password_games.where("id", id).one());
      if (g) await tx.mutate.password_games.update({ id, settings: { ...g.settings, roundEndsAt: 1 }, updated_at: ts });
      return;
    }
    if (args.gameType === "chain_reaction") {
      const g = await tx.run(zql.chain_reaction_games.where("id", id).one());
      if (g) await tx.mutate.chain_reaction_games.update({ id, settings: { ...g.settings, phaseEndsAt: 1 }, updated_at: ts });
      return;
    }
    if (args.gameType === "shade_signal") {
      const g = await tx.run(zql.shade_signal_games.where("id", id).one());
      if (g) await tx.mutate.shade_signal_games.update({ id, settings: { ...g.settings, phaseEndsAt: 1 }, updated_at: ts });
      return;
    }
    const g = await tx.run(zql.location_signal_games.where("id", id).one());
    if (g) await tx.mutate.location_signal_games.update({ id, settings: { ...g.settings, phaseEndsAt: 1 }, updated_at: ts });
  }),

  /**
   * Every bot takes the action its current phase expects. Bots play to make the
   * game move: they guess correctly where the answer is knowable, so a phase
   * completes instead of stalling on the timer.
   */
  botAct: defineMutator(target, async ({ args, tx, ctx }) => {
    const bot = botCtx(ctx);
    const t = tx as Tx;
    const gameId = args.gameId;

    if (args.gameType === "imposter") {
      const game = await tx.run(zql.imposter_games.where("id", gameId).one());
      if (!game) return;

      if (game.phase === "playing") {
        const done = new Set(game.clues.map((c) => c.sessionId));
        for (const p of game.players) {
          if (!isDevBot(p.sessionId) || p.eliminated || done.has(p.sessionId)) continue;
          await attempt(() =>
            imposterMutators.submitClue.fn({
              args: { gameId, sessionId: p.sessionId, text: pickRandom(BOT_WORDS) },
              tx: t,
              ctx: bot
            })
          );
        }
        return;
      }

      if (game.phase === "voting") {
        const voted = new Set(game.votes.map((v) => v.voterId));
        const active = game.players.filter((p) => !p.eliminated);
        for (const p of active) {
          if (!isDevBot(p.sessionId) || voted.has(p.sessionId)) continue;
          const targets = active.filter((other) => other.sessionId !== p.sessionId);
          if (targets.length === 0) continue;
          await attempt(() =>
            imposterMutators.submitVote.fn({
              args: { gameId, voterId: p.sessionId, targetId: pickRandom(targets).sessionId },
              tx: t,
              ctx: bot
            })
          );
        }
      }
      return;
    }

    if (args.gameType === "password") {
      const game = await tx.run(zql.password_games.where("id", gameId).one());
      if (!game || game.phase !== "playing") return;

      for (const round of game.active_rounds) {
        const team = game.teams[round.teamIndex];
        if (!team) continue;
        const word = await resolveActiveRoundWord(ctx, gameId, round);

        // Clue givers first, then the guesser, so the round has clues on it
        // by the time it resolves.
        for (const memberId of team.members) {
          if (!isDevBot(memberId) || memberId === round.guesserId) continue;
          const clue = BOT_WORDS.find((w) => !word || !isClueTooSimilar(w, word));
          if (!clue) continue;
          await attempt(() =>
            passwordMutators.submitClue.fn({
              args: { gameId, sessionId: memberId, clue },
              tx: t,
              ctx: bot
            })
          );
        }

        if (isDevBot(round.guesserId) && word) {
          await attempt(() =>
            passwordMutators.submitGuess.fn({
              args: { gameId, sessionId: round.guesserId, guess: word },
              tx: t,
              ctx: bot
            })
          );
        }
      }
      return;
    }

    if (args.gameType === "chain_reaction") {
      const game = await tx.run(zql.chain_reaction_games.where("id", gameId).one());
      if (!game) return;

      if (game.phase === "submitting") {
        for (const p of game.players) {
          if (!isDevBot(p.sessionId) || game.submitted_chains[p.sessionId]) continue;
          await attempt(() =>
            chainReactionMutators.submitChain.fn({
              args: {
                gameId,
                sessionId: p.sessionId,
                words: pickChain(game.settings.chainLength, game.settings.category)
              },
              tx: t,
              ctx: bot
            })
          );
        }
        return;
      }

      if (game.phase === "playing") {
        for (const p of game.players) {
          if (!isDevBot(p.sessionId)) continue;
          const slots = game.chain[p.sessionId] ?? [];
          const index = slots.findIndex((s) => !s.revealed);
          if (index === -1) continue;
          await attempt(() =>
            chainReactionMutators.guess.fn({
              args: { gameId, sessionId: p.sessionId, wordIndex: index, guess: slots[index]!.word },
              tx: t,
              ctx: bot
            })
          );
        }
      }
      return;
    }

    if (args.gameType === "shade_signal") {
      const game = await tx.run(zql.shade_signal_games.where("id", gameId).one());
      if (!game || !game.leader_id) return;
      const leaderIsBot = isDevBot(game.leader_id);

      if (game.phase === "picking" && leaderIsBot) {
        await attempt(() =>
          shadeSignalMutators.setTarget.fn({
            args: {
              gameId,
              sessionId: game.leader_id!,
              row: Math.floor(Math.random() * game.grid_rows),
              col: Math.floor(Math.random() * game.grid_cols)
            },
            tx: t,
            ctx: bot
          })
        );
        return;
      }

      if ((game.phase === "clue1" || game.phase === "clue2") && leaderIsBot) {
        await attempt(() =>
          shadeSignalMutators.submitClue.fn({
            args: { gameId, sessionId: game.leader_id!, text: pickRandom(BOT_WORDS) },
            tx: t,
            ctx: bot
          })
        );
        return;
      }

      if (game.phase === "guess1" || game.phase === "guess2") {
        const round = game.phase === "guess1" ? 1 : 2;
        for (const p of game.players) {
          if (!isDevBot(p.sessionId) || p.sessionId === game.leader_id) continue;
          const already = game.guesses.some((g) => g.sessionId === p.sessionId && g.round === round);
          if (already) continue;
          await attempt(() =>
            shadeSignalMutators.submitGuess.fn({
              args: {
                gameId,
                sessionId: p.sessionId,
                row: Math.floor(Math.random() * game.grid_rows),
                col: Math.floor(Math.random() * game.grid_cols)
              },
              tx: t,
              ctx: bot
            })
          );
        }
      }
      return;
    }

    // location_signal
    const game = await tx.run(zql.location_signal_games.where("id", gameId).one());
    if (!game || !game.leader_id) return;
    const leaderIsBot = isDevBot(game.leader_id);

    if (game.phase === "picking" && leaderIsBot) {
      await attempt(() =>
        locationSignalMutators.setTarget.fn({
          args: {
            gameId,
            sessionId: game.leader_id!,
            lat: Math.random() * 140 - 70,
            lng: Math.random() * 360 - 180
          },
          tx: t,
          ctx: bot
        })
      );
      return;
    }

    if (game.phase.startsWith("clue") && leaderIsBot) {
      await attempt(() =>
        locationSignalMutators.submitClue.fn({
          args: { gameId, sessionId: game.leader_id!, round: phaseRound(game.phase), text: pickRandom(BOT_WORDS) },
          tx: t,
          ctx: bot
        })
      );
      return;
    }

    if (game.phase.startsWith("guess")) {
      const round = phaseRound(game.phase);
      for (const p of game.players) {
        if (!isDevBot(p.sessionId) || p.sessionId === game.leader_id) continue;
        const already = game.guesses.some((g) => g.sessionId === p.sessionId && g.round === round);
        if (already) continue;
        await attempt(() =>
          locationSignalMutators.submitGuess.fn({
            args: {
              gameId,
              sessionId: p.sessionId,
              round,
              lat: Math.random() * 140 - 70,
              lng: Math.random() * 360 - 180
            },
            tx: t,
            ctx: bot
          })
        );
      }
    }
  })
};
