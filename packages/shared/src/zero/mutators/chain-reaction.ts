import { defineMutator } from "@rocicorp/zero";
import { z } from "zod";
import { zql } from "../schema";
import { now, code, pickChain, scoreForLetters, normalized, pickRandom, assertCaller, assertHost, sanitizeText, resolvePlayerName, sealSecret, openSecret, isServerTx, ROOM_CODE } from "./helpers";

type ChainSlot = { word: string; secret?: string | null; revealed: boolean; lettersShown: number; solvedBy?: string | null };

/** What the synced row shows of a hidden word: the hinted letters, then blanks. */
export function maskWord(word: string, lettersShown: number) {
  return word.slice(0, lettersShown) + "_".repeat(Math.max(0, word.length - lettersShown));
}

/**
 * Deals a chain. The two ends are given. Every word between them syncs as a
 * mask plus a sealed copy that only the server can open, so a player's client
 * never holds its own answers. Guesses are checked on the server.
 */
async function dealChain(tx: unknown, ctx: unknown, gameId: string, words: string[]): Promise<ChainSlot[]> {
  return Promise.all(words.map(async (word, i) => {
    if (i === 0 || i === words.length - 1) return { word, revealed: true, lettersShown: 0, solvedBy: null };
    const secret = await sealSecret(tx, ctx, "chain_reaction", gameId, word);
    return { word: maskWord(word, 0), secret, revealed: false, lettersShown: 0, solvedBy: null };
  }));
}

/** A slot's real word. Null for a hidden one on the client, which can't open it. */
export async function chainSlotWord(ctx: unknown, gameId: string, slot: ChainSlot) {
  if (slot.revealed) return slot.word;
  return slot.secret ? openSecret(ctx, "chain_reaction", gameId, slot.secret) : null;
}

export const chainReactionMutators = {
  create: defineMutator(
    z.object({
      id: z.string(),
      code: z.string().regex(ROOM_CODE).optional(),
      hostId: z.string(),
      chainLength: z.number().min(5).max(10).optional(),
      rounds: z.number().min(1).max(10).optional(),
      turnTimeSec: z.number().nullable().optional(),
      chainMode: z.enum(["premade", "custom"]).optional(),
      category: z.string().optional()
    }),
    async ({ args, tx }) => {
      const ts = now();
      const session = await tx.run(zql.sessions.where("id", args.hostId).one());
      const hostName = resolvePlayerName(session?.name, args.hostId);
      await tx.mutate.chain_reaction_games.insert({
        id: args.id,
        code: args.code ?? code(),
        host_id: args.hostId,
        phase: "lobby",
        players: [{ sessionId: args.hostId, name: hostName, connected: true }],
        chain: {},
        submitted_chains: {},
        current_turn: null,
        scores: {},
        round_history: [],
        kicked: [],
        spectators: [],
        announcement: null,
        settings: {
          chainLength: args.chainLength ?? 5,
          rounds: args.rounds ?? 3,
          currentRound: 1,
          turnTimeSec: args.turnTimeSec ?? null,
          phaseEndsAt: null,
          chainMode: args.chainMode ?? "premade",
          category: args.category ?? "animals"
        },
        is_public: false,
        created_at: ts,
        updated_at: ts
      });
      await tx.mutate.sessions.upsert({
        id: args.hostId,
        name: hostName,
        game_type: "chain_reaction",
        game_id: args.id,
        created_at: ts,
        last_seen: ts
      });
    }
  ),

  join: defineMutator(
    z.object({ gameId: z.string(), sessionId: z.string() }),
    async ({ args, tx, ctx }) => {
      assertCaller(tx, ctx, args.sessionId);
      const session = await tx.run(zql.sessions.where("id", args.sessionId).one());
      const sessionName = resolvePlayerName(session?.name, args.sessionId);
      const game = await tx.run(zql.chain_reaction_games.where("id", args.gameId).one());
      if (!game) throw new Error("Game not found");
      if (game.phase === "ended" || game.phase === "finished") throw new Error("Game has ended");
      if (game.kicked.includes(args.sessionId)) throw new Error("You have been kicked from this game");
      if (game.phase !== "lobby") {
        // Mid-game visitors join as spectators
        if (!game.players.some((p) => p.sessionId === args.sessionId) && !game.spectators.find((s) => s.sessionId === args.sessionId)) {
          await tx.mutate.chain_reaction_games.update({
            id: game.id,
            spectators: [...game.spectators, { sessionId: args.sessionId, name: sessionName }],
            updated_at: now()
          });
          await tx.mutate.sessions.upsert({
            id: args.sessionId,
            name: sessionName,
            game_type: "chain_reaction",
            game_id: game.id,
            created_at: now(),
            last_seen: now()
          });
        }
        return;
      }
      if (game.players.length >= 2 && !game.players.some((p) => p.sessionId === args.sessionId)) {
        throw new Error("Game is full (2 players max)");
      }

      const existing = game.players.find((p) => p.sessionId === args.sessionId);
      const players = existing
        ? game.players.map((p) =>
            p.sessionId === args.sessionId
              ? { ...p, connected: true, name: resolvePlayerName(session?.name ?? p.name, args.sessionId) }
              : p
          )
        : [...game.players, { sessionId: args.sessionId, name: sessionName, connected: true }];

      await tx.mutate.chain_reaction_games.update({
        id: game.id,
        players,
        updated_at: now()
      });
      await tx.mutate.sessions.upsert({
        id: args.sessionId,
        name: sessionName,
        game_type: "chain_reaction",
        game_id: game.id,
        created_at: now(),
        last_seen: now()
      });
    }
  ),

  leave: defineMutator(
    z.object({ gameId: z.string(), sessionId: z.string() }),
    async ({ args, tx, ctx }) => {
      assertCaller(tx, ctx, args.sessionId);
      const game = await tx.run(zql.chain_reaction_games.where("id", args.gameId).one());
      if (!game) return;

      // Host leaving ends the game for everyone
      if (game.host_id === args.sessionId) {
        await tx.mutate.chain_reaction_games.update({
          id: game.id,
          phase: "ended",
          settings: { ...game.settings, phaseEndsAt: null },
          updated_at: now()
        });
        const gameSessions = await tx.run(
          zql.sessions.where("game_type", "chain_reaction").where("game_id", game.id)
        );
        for (const s of gameSessions) {
          await tx.mutate.sessions.update({
            id: s.id,
            game_type: undefined,
            game_id: undefined,
            last_seen: now()
          });
        }
        return;
      }

      // Non-host leaving during a 2-player game ends it
      const players = game.players.filter((p) => p.sessionId !== args.sessionId);
      const phase = game.phase === "playing" ? "finished" : game.phase;

      await tx.mutate.chain_reaction_games.update({
        id: game.id,
        players,
        phase,
        announcement: game.phase === "playing"
          ? { text: "Your opponent left. Game over!", ts: now() }
          : game.announcement,
        settings: { ...game.settings, phaseEndsAt: null },
        updated_at: now()
      });
      await tx.mutate.sessions.update({
        id: args.sessionId,
        game_type: undefined,
        game_id: undefined,
        last_seen: now()
      });
    }
  ),

  updateSettings: defineMutator(
    z.object({
      gameId: z.string(),
      hostId: z.string(),
      settings: z.object({
        chainLength: z.number(),
        rounds: z.number(),
        currentRound: z.number(),
        turnTimeSec: z.number().nullable(),
        phaseEndsAt: z.number().nullable(),
        chainMode: z.enum(["premade", "custom"]),
        category: z.string().optional()
      })
    }),
    async ({ args, tx, ctx }) => {
      assertHost(tx, ctx, args.hostId, args.hostId);
      const game = await tx.run(zql.chain_reaction_games.where("id", args.gameId).one());
      if (!game) throw new Error("Game not found");
      if (game.host_id !== args.hostId) throw new Error("Only host can update settings");
      if (game.phase !== "lobby") throw new Error("Can only update settings in lobby");
      const newCategory = args.settings.category ?? game.settings.category ?? "animals";
      await tx.mutate.chain_reaction_games.update({
        id: game.id,
        settings: { ...game.settings, ...args.settings, category: newCategory },
        updated_at: now()
      });
    }
  ),

  kick: defineMutator(
    z.object({ gameId: z.string(), hostId: z.string(), targetId: z.string() }),
    async ({ args, tx, ctx }) => {
      assertHost(tx, ctx, args.hostId, args.hostId);
      const game = await tx.run(zql.chain_reaction_games.where("id", args.gameId).one());
      if (!game) throw new Error("Game not found");
      if (game.host_id !== args.hostId) throw new Error("Only host can kick");
      if (args.targetId === args.hostId) throw new Error("Cannot kick yourself");

      const players = game.players.filter((p) => p.sessionId !== args.targetId);
      const kicked = [...game.kicked, args.targetId];

      await tx.mutate.chain_reaction_games.update({
        id: game.id,
        players,
        kicked,
        updated_at: now()
      });
      await tx.mutate.sessions.update({
        id: args.targetId,
        game_type: undefined,
        game_id: undefined,
        last_seen: now()
      });
    }
  ),

  start: defineMutator(
    z.object({
      gameId: z.string(),
      hostId: z.string()
    }),
    async ({ args, tx, ctx }) => {
      assertHost(tx, ctx, args.hostId, args.hostId);
      const game = await tx.run(zql.chain_reaction_games.where("id", args.gameId).one());
      if (!game) throw new Error("Game not found");
      if (game.host_id !== args.hostId) throw new Error("Only host can start");
      if (game.phase !== "lobby") throw new Error("Game already started");
      if (game.players.length !== 2) throw new Error("Need exactly 2 players");

      if (game.settings.chainMode === "custom") {
        // Go to the submitting phase; both players will enter their chains
        await tx.mutate.chain_reaction_games.update({
          id: game.id,
          phase: "submitting",
          submitted_chains: {},
          scores: Object.fromEntries(game.players.map((p) => [p.sessionId, 0])),
          announcement: { text: "Both players: submit your word chains!", ts: now() },
          updated_at: now()
        });
        return;
      }

      // Premade mode: pick two different chains, one for each player to solve
      if (!isServerTx(tx)) return; // rolled on the server only, see isServerTx
      const p1 = game.players[0]!.sessionId;
      const p2 = game.players[1]!.sessionId;

      const chain = {
        [p1]: await dealChain(tx, ctx, game.id, pickChain(game.settings.chainLength, game.settings.category)),
        [p2]: await dealChain(tx, ctx, game.id, pickChain(game.settings.chainLength, game.settings.category))
      };

      const scores: Record<string, number> = {};
      for (const p of game.players) scores[p.sessionId] = 0;

      const phaseEndsAt = game.settings.turnTimeSec
        ? now() + game.settings.turnTimeSec * 1000
        : null;

      await tx.mutate.chain_reaction_games.update({
        id: game.id,
        phase: "playing",
        chain,
        current_turn: undefined,
        scores,
        settings: { ...game.settings, phaseEndsAt },
        updated_at: now()
      });
    }
  ),

  submitChain: defineMutator(
    z.object({ gameId: z.string(), sessionId: z.string(), words: z.array(z.string().min(1).max(30)) }),
    async ({ args, tx, ctx }) => {
      assertCaller(tx, ctx, args.sessionId);
      const game = await tx.run(zql.chain_reaction_games.where("id", args.gameId).one());
      if (!game) throw new Error("Game not found");
      if (game.phase !== "submitting") throw new Error("Not in submission phase");
      if (!game.players.some((p) => p.sessionId === args.sessionId)) throw new Error("Not in this game");
      if (args.words.length !== game.settings.chainLength) throw new Error(`Chain must be exactly ${game.settings.chainLength} words`);

      /* Sealed, because these are the words the other player has to guess. The
         client's optimistic copy keeps its own words in the clear on its own
         device, and it can't open the other chain, so only the server deals. */
      const words = await Promise.all(args.words.map(async (w) => {
        const word = w.trim().toUpperCase();
        return (await sealSecret(tx, ctx, "chain_reaction", game.id, word)) ?? word;
      }));
      const submitted = { ...game.submitted_chains, [args.sessionId]: words };
      const allSubmitted = game.players.every((p) => submitted[p.sessionId]?.length === game.settings.chainLength);

      if (!allSubmitted || !isServerTx(tx)) {
        // Just save this player's chain and wait
        const session = await tx.run(zql.sessions.where("id", args.sessionId).one());
        const name = resolvePlayerName(session?.name, args.sessionId);
        await tx.mutate.chain_reaction_games.update({
          id: game.id,
          submitted_chains: submitted,
          announcement: { text: `${name} submitted their chain!`, ts: now() },
          updated_at: now()
        });
        return;
      }

      // Both submitted, so each player guesses the OTHER player's chain
      const p1 = game.players[0]!.sessionId;
      const p2 = game.players[1]!.sessionId;

      const openChain = (sealed: string[]) =>
        Promise.all(sealed.map(async (w) => (await openSecret(ctx, "chain_reaction", game.id, w))!));
      const chain = {
        [p1]: await dealChain(tx, ctx, game.id, await openChain(submitted[p2]!)), // P1 guesses P2's words
        [p2]: await dealChain(tx, ctx, game.id, await openChain(submitted[p1]!))  // P2 guesses P1's words
      };

      const phaseEndsAt = game.settings.turnTimeSec
        ? now() + game.settings.turnTimeSec * 1000
        : null;

      await tx.mutate.chain_reaction_games.update({
        id: game.id,
        phase: "playing",
        chain,
        submitted_chains: submitted,
        current_turn: undefined,
        announcement: { text: "Chains submitted. Let's play!", ts: now() },
        settings: { ...game.settings, phaseEndsAt },
        updated_at: now()
      });
    }
  ),

  revealLetter: defineMutator(
    z.object({ gameId: z.string(), sessionId: z.string(), wordIndex: z.number() }),
    async ({ args, tx, ctx }) => {
      assertCaller(tx, ctx, args.sessionId);
      const game = await tx.run(zql.chain_reaction_games.where("id", args.gameId).one());
      if (!game || game.phase !== "playing") throw new Error("Game not in playing phase");

      const playerChain = game.chain[args.sessionId];
      if (!playerChain) throw new Error("No chain for this player");

      const slot = playerChain[args.wordIndex];
      if (!slot || slot.revealed) throw new Error("Invalid word slot");

      // Reveal one more letter (keep last letter hidden to preserve deduction)
      const maxReveal = slot.word.length - 1;
      if (slot.lettersShown >= maxReveal) throw new Error("All revealable letters already shown");

      // The client can't open the word, so its optimistic copy grows a blank the server fills in.
      const word = await chainSlotWord(ctx, game.id, slot);
      const lettersShown = slot.lettersShown + 1;
      const updatedPlayerChain = playerChain.map((s, i) =>
        i === args.wordIndex ? { ...s, lettersShown, word: word ? maskWord(word, lettersShown) : s.word } : s
      );

      await tx.mutate.chain_reaction_games.update({
        id: game.id,
        chain: { ...game.chain, [args.sessionId]: updatedPlayerChain },
        updated_at: now()
      });
    }
  ),

  guess: defineMutator(
    z.object({ gameId: z.string(), sessionId: z.string(), wordIndex: z.number(), guess: z.string().min(1).max(40) }),
    async ({ args, tx, ctx }) => {
      assertCaller(tx, ctx, args.sessionId);
      const game = await tx.run(zql.chain_reaction_games.where("id", args.gameId).one());
      if (!game || game.phase !== "playing") throw new Error("Game not in playing phase");

      const playerChain = game.chain[args.sessionId];
      if (!playerChain) throw new Error("No chain for this player");

      const slot = playerChain[args.wordIndex];
      if (!slot || slot.revealed) throw new Error("Invalid word slot");

      const word = await chainSlotWord(ctx, game.id, slot);
      // Only the server can tell whether the guess is right.
      if (word === null) return;
      const correct = normalized(args.guess) === normalized(word);
      let updatedPlayerChain = [...playerChain];
      let scores = { ...game.scores };
      let announcement: { text: string; ts: number } | null = null;

      if (!correct) {
        // Wrong guess: auto-reveal one letter (unless it would reveal the whole word)
        const newLettersShown = slot.lettersShown < word.length - 1
          ? slot.lettersShown + 1
          : slot.lettersShown;
        updatedPlayerChain = updatedPlayerChain.map((s, i) =>
          i === args.wordIndex ? { ...s, lettersShown: newLettersShown, word: maskWord(word, newLettersShown) } : s
        );

        await tx.mutate.chain_reaction_games.update({
          id: game.id,
          chain: { ...game.chain, [args.sessionId]: updatedPlayerChain },
          updated_at: now()
        });
        return;
      }

      // Correct guess
      const session = await tx.run(zql.sessions.where("id", args.sessionId).one());
      const playerName = resolvePlayerName(session?.name, args.sessionId);

      updatedPlayerChain = updatedPlayerChain.map((s, i) =>
        i === args.wordIndex ? { ...s, word, secret: null, revealed: true, solvedBy: args.sessionId } : s
      );
      const points = scoreForLetters(slot.lettersShown);
      const hiddenWords = updatedPlayerChain.filter((s) => !s.revealed);
      const isLastWord = hiddenWords.length === 0;
      const totalPoints = points + (isLastWord ? 1 : 0);
      scores[args.sessionId] = (scores[args.sessionId] ?? 0) + totalPoints;

      announcement = {
        text: `${playerName} guessed "${word}" for ${totalPoints} point${totalPoints !== 1 ? "s" : ""}!`,
        ts: now()
      };

      const updatedChains = { ...game.chain, [args.sessionId]: updatedPlayerChain };

      // Check if ALL players' chains are fully solved → round over
      const allDone = Object.values(updatedChains).every((ch) => ch.every((s) => s.revealed));

      if (allDone) {
        // Round complete
        const roundResult = {
          round: game.settings.currentRound,
          chains: Object.fromEntries(
            Object.entries(updatedChains).map(([pid, ch]) => [
              pid,
              ch.map((s) => ({ word: s.word, solvedBy: s.solvedBy ?? null, lettersShown: s.lettersShown }))
            ])
          ),
          scores: { ...scores }
        };
        const roundHistory = [...game.round_history, roundResult];

        if (game.settings.currentRound >= game.settings.rounds) {
          // Game over
          const sorted = Object.entries(scores).sort(([,a], [,b]) => b - a);
          const winner = sorted[0];
          const isTie = sorted.length >= 2 && sorted[0]![1] === sorted[1]![1];
          const winnerSession = winner ? await tx.run(zql.sessions.where("id", winner[0]).one()) : null;
          const winnerName = winner ? resolvePlayerName(winnerSession?.name, winner[0]) : "???";
          const endText = isTie ? "Game over! It's a tie!" : `Game over! ${winnerName} wins!`;

          await tx.mutate.chain_reaction_games.update({
            id: game.id,
            phase: "finished",
            chain: updatedChains,
            scores,
            round_history: roundHistory,
            announcement: { text: endText, ts: now() },
            settings: { ...game.settings, phaseEndsAt: null },
            updated_at: now()
          });
        } else {
          // Next round
          const nextRound = game.settings.currentRound + 1;

          if (game.settings.chainMode === "custom") {
            await tx.mutate.chain_reaction_games.update({
              id: game.id,
              phase: "submitting",
              chain: {},
              submitted_chains: {},
              scores,
              current_turn: undefined,
              round_history: roundHistory,
              announcement: { text: `Round ${nextRound}: submit your chains!`, ts: now() },
              settings: { ...game.settings, currentRound: nextRound, phaseEndsAt: null },
              updated_at: now()
            });
          } else {
            if (!isServerTx(tx)) return; // rolled on the server only, see isServerTx
            const p1 = game.players[0]!.sessionId;
            const p2 = game.players[1]!.sessionId;
            const newChain = {
              [p1]: await dealChain(tx, ctx, game.id, pickChain(game.settings.chainLength, game.settings.category)),
              [p2]: await dealChain(tx, ctx, game.id, pickChain(game.settings.chainLength, game.settings.category))
            };
            const phaseEndsAt = game.settings.turnTimeSec
              ? now() + game.settings.turnTimeSec * 1000
              : null;

            await tx.mutate.chain_reaction_games.update({
              id: game.id,
              chain: newChain,
              scores,
              current_turn: undefined,
              round_history: roundHistory,
              announcement: { text: `Round ${nextRound} starting!`, ts: now() },
              settings: { ...game.settings, currentRound: nextRound, phaseEndsAt },
              updated_at: now()
            });
          }
        }
        return;
      }

      // Not all done yet, so just update this player's chain
      await tx.mutate.chain_reaction_games.update({
        id: game.id,
        chain: updatedChains,
        scores,
        announcement,
        updated_at: now()
      });
    }
  ),

  giveUp: defineMutator(
    z.object({ gameId: z.string(), sessionId: z.string(), wordIndex: z.number() }),
    async ({ args, tx, ctx }) => {
      assertCaller(tx, ctx, args.sessionId);
      const game = await tx.run(zql.chain_reaction_games.where("id", args.gameId).one());
      if (!game || game.phase !== "playing") throw new Error("Game not in playing phase");

      const playerChain = game.chain[args.sessionId];
      if (!playerChain) throw new Error("No chain for this player");

      const slot = playerChain[args.wordIndex];
      if (!slot || slot.revealed) throw new Error("Invalid word slot");

      const word = await chainSlotWord(ctx, game.id, slot);
      // Only the server can say what the word was.
      if (word === null) return;

      // Reveal the word with 0 points (solvedBy null = given up)
      const updatedPlayerChain = playerChain.map((s, i) =>
        i === args.wordIndex ? { ...s, word, secret: null, revealed: true, lettersShown: word.length, solvedBy: null } : s
      );

      const session = await tx.run(zql.sessions.where("id", args.sessionId).one());
      const playerName = resolvePlayerName(session?.name, args.sessionId);

      const scores = { ...game.scores };
      const updatedChains = { ...game.chain, [args.sessionId]: updatedPlayerChain };

      // Check if ALL players' chains are fully solved → round over
      const allDone = Object.values(updatedChains).every((ch) => ch.every((s) => s.revealed));

      if (allDone) {
        const roundResult = {
          round: game.settings.currentRound,
          chains: Object.fromEntries(
            Object.entries(updatedChains).map(([pid, ch]) => [
              pid,
              ch.map((s) => ({ word: s.word, solvedBy: s.solvedBy ?? null, lettersShown: s.lettersShown }))
            ])
          ),
          scores: { ...scores }
        };
        const roundHistory = [...game.round_history, roundResult];

        if (game.settings.currentRound >= game.settings.rounds) {
          const sorted = Object.entries(scores).sort(([,a], [,b]) => b - a);
          const winner = sorted[0];
          const isTie = sorted.length >= 2 && sorted[0]![1] === sorted[1]![1];
          const winnerSession = winner ? await tx.run(zql.sessions.where("id", winner[0]).one()) : null;
          const winnerName = winner ? resolvePlayerName(winnerSession?.name, winner[0]) : "???";
          const endText = isTie ? "Game over! It's a tie!" : `Game over! ${winnerName} wins!`;

          await tx.mutate.chain_reaction_games.update({
            id: game.id,
            phase: "finished",
            chain: updatedChains,
            scores,
            round_history: roundHistory,
            announcement: { text: endText, ts: now() },
            settings: { ...game.settings, phaseEndsAt: null },
            updated_at: now()
          });
        } else {
          const nextRound = game.settings.currentRound + 1;

          if (game.settings.chainMode === "custom") {
            await tx.mutate.chain_reaction_games.update({
              id: game.id,
              phase: "submitting",
              chain: {},
              submitted_chains: {},
              scores,
              current_turn: undefined,
              round_history: roundHistory,
              announcement: { text: `Round ${nextRound}: submit your chains!`, ts: now() },
              settings: { ...game.settings, currentRound: nextRound, phaseEndsAt: null },
              updated_at: now()
            });
          } else {
            if (!isServerTx(tx)) return; // rolled on the server only, see isServerTx
            const p1 = game.players[0]!.sessionId;
            const p2 = game.players[1]!.sessionId;
            const newChain = {
              [p1]: await dealChain(tx, ctx, game.id, pickChain(game.settings.chainLength, game.settings.category)),
              [p2]: await dealChain(tx, ctx, game.id, pickChain(game.settings.chainLength, game.settings.category))
            };
            const phaseEndsAt = game.settings.turnTimeSec
              ? now() + game.settings.turnTimeSec * 1000
              : null;

            await tx.mutate.chain_reaction_games.update({
              id: game.id,
              chain: newChain,
              scores,
              current_turn: undefined,
              round_history: roundHistory,
              announcement: { text: `Round ${nextRound} starting!`, ts: now() },
              settings: { ...game.settings, currentRound: nextRound, phaseEndsAt },
              updated_at: now()
            });
          }
        }
        return;
      }

      await tx.mutate.chain_reaction_games.update({
        id: game.id,
        chain: updatedChains,
        scores,
        announcement: { text: `${playerName} gave up on "${word}"`, ts: now() },
        updated_at: now()
      });
    }
  ),

  resetToLobby: defineMutator(
    z.object({ gameId: z.string(), hostId: z.string() }),
    async ({ args, tx, ctx }) => {
      assertHost(tx, ctx, args.hostId, args.hostId);
      const game = await tx.run(zql.chain_reaction_games.where("id", args.gameId).one());
      if (!game) throw new Error("Game not found");
      if (game.host_id !== args.hostId) throw new Error("Only host can reset");

      await tx.mutate.chain_reaction_games.update({
        id: game.id,
        phase: "lobby",
        chain: {},
        submitted_chains: {},
        current_turn: null,
        scores: {},
        round_history: [],
        announcement: null,
        spectators: [],
        settings: { ...game.settings, currentRound: 1, phaseEndsAt: null },
        updated_at: now()
      });

      // Clear chat messages
      const msgs = await tx.run(
        zql.chat_messages.where("game_type", "chain_reaction").where("game_id", args.gameId)
      );
      for (const m of msgs) {
        await tx.mutate.chat_messages.delete({ id: m.id });
      }
    }
  ),

  endGame: defineMutator(
    z.object({ gameId: z.string(), hostId: z.string() }),
    async ({ args, tx, ctx }) => {
      assertHost(tx, ctx, args.hostId, args.hostId);
      const game = await tx.run(zql.chain_reaction_games.where("id", args.gameId).one());
      if (!game) throw new Error("Game not found");
      if (game.host_id !== args.hostId) throw new Error("Only host can end game");

      await tx.mutate.chain_reaction_games.update({
        id: game.id,
        phase: "ended",
        settings: { ...game.settings, phaseEndsAt: null },
        updated_at: now()
      });
      const gameSessions = await tx.run(
        zql.sessions.where("game_type", "chain_reaction").where("game_id", game.id)
      );
      for (const s of gameSessions) {
        await tx.mutate.sessions.update({
          id: s.id,
          game_type: undefined,
          game_id: undefined,
          last_seen: now()
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
      const game = await tx.run(zql.chain_reaction_games.where("id", args.gameId).one());
      if (!game) throw new Error("Game not found");
      if (game.phase === "ended" || game.phase === "finished") throw new Error("Game has ended");
      if (game.kicked.includes(args.sessionId)) throw new Error("You have been kicked from this game");
      if (game.players.some((p) => p.sessionId === args.sessionId)) throw new Error("Already in game as player");
      if (game.spectators.find((s) => s.sessionId === args.sessionId)) return;

      await tx.mutate.chain_reaction_games.update({
        id: game.id,
        spectators: [...game.spectators, { sessionId: args.sessionId, name: sessionName }],
        updated_at: now()
      });
      await tx.mutate.sessions.upsert({
        id: args.sessionId,
        name: sessionName,
        game_type: "chain_reaction",
        game_id: game.id,
        created_at: now(),
        last_seen: now()
      });
    }
  ),

  leaveSpectator: defineMutator(
    z.object({ gameId: z.string(), sessionId: z.string() }),
    async ({ args, tx, ctx }) => {
      assertCaller(tx, ctx, args.sessionId);
      const game = await tx.run(zql.chain_reaction_games.where("id", args.gameId).one());
      if (!game) return;
      await tx.mutate.chain_reaction_games.update({
        id: game.id,
        spectators: game.spectators.filter((s) => s.sessionId !== args.sessionId),
        updated_at: now()
      });
      await tx.mutate.sessions.update({
        id: args.sessionId,
        game_type: undefined,
        game_id: undefined,
        last_seen: now()
      });
    }
  ),

  announce: defineMutator(
    z.object({ gameId: z.string(), hostId: z.string(), text: z.string().min(1).max(120) }),
    async ({ args, tx, ctx }) => {
      assertHost(tx, ctx, args.hostId, args.hostId);
      const game = await tx.run(zql.chain_reaction_games.where("id", args.gameId).one());
      if (!game || game.host_id !== args.hostId) throw new Error("Only host can announce");
      const cleanText = sanitizeText(args.text);
      if (!cleanText) throw new Error("Announcement cannot be empty");
      await tx.mutate.chain_reaction_games.update({
        id: game.id,
        announcement: { text: cleanText, ts: now() },
        updated_at: now()
      });
    }
  ),

  removeSpectator: defineMutator(
    z.object({ gameId: z.string(), hostId: z.string(), targetId: z.string() }),
    async ({ args, tx, ctx }) => {
      assertHost(tx, ctx, args.hostId, args.hostId);
      const game = await tx.run(zql.chain_reaction_games.where("id", args.gameId).one());
      if (!game || game.host_id !== args.hostId) throw new Error("Only host can remove spectators");
      await tx.mutate.chain_reaction_games.update({
        id: game.id,
        spectators: game.spectators.filter((s) => s.sessionId !== args.targetId),
        kicked: [...game.kicked, args.targetId],
        updated_at: now()
      });
      await tx.mutate.sessions.update({
        id: args.targetId,
        game_type: undefined,
        game_id: undefined,
        last_seen: now()
      });
    }
  ),

  setPublic: defineMutator(
    z.object({ gameId: z.string(), hostId: z.string(), isPublic: z.boolean() }),
    async ({ args, tx, ctx }) => {
      assertHost(tx, ctx, args.hostId, args.hostId);
      const game = await tx.run(zql.chain_reaction_games.where("id", args.gameId).one());
      if (!game || game.host_id !== args.hostId) throw new Error("Only host can change visibility");
      if (game.phase === "ended" || game.phase === "finished") throw new Error("Game has ended");
      await tx.mutate.chain_reaction_games.update({
        id: game.id,
        is_public: args.isPublic,
        updated_at: now()
      });
    }
  )
};
