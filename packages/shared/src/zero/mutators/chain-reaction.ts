import { defineMutator } from "@rocicorp/zero";
import { z } from "zod";
import { zql } from "../schema";
import { now, code, pickChain, scoreForLetters, normalized, pickRandom } from "./helpers";

export const chainReactionMutators = {
  create: defineMutator(
    z.object({
      id: z.string(),
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
      await tx.mutate.chain_reaction_games.insert({
        id: args.id,
        code: code(),
        host_id: args.hostId,
        phase: "lobby",
        players: [{ sessionId: args.hostId, name: session?.name ?? null, connected: true }],
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
        name: session?.name ?? null,
        game_type: "chain_reaction",
        game_id: args.id,
        created_at: ts,
        last_seen: ts
      });
    }
  ),

  join: defineMutator(
    z.object({ gameId: z.string(), sessionId: z.string() }),
    async ({ args, tx }) => {
      const session = await tx.run(zql.sessions.where("id", args.sessionId).one());
      const game = await tx.run(zql.chain_reaction_games.where("id", args.gameId).one());
      if (!game) throw new Error("Game not found");
      if (game.phase === "ended" || game.phase === "finished") throw new Error("Game has ended");
      if (game.kicked.includes(args.sessionId)) throw new Error("You have been kicked from this game");
      if (game.phase !== "lobby") {
        // Mid-game visitors join as spectators
        if (!game.players.some((p) => p.sessionId === args.sessionId) && !game.spectators.find((s) => s.sessionId === args.sessionId)) {
          await tx.mutate.chain_reaction_games.update({
            id: game.id,
            spectators: [...game.spectators, { sessionId: args.sessionId, name: session?.name ?? null }],
            updated_at: now()
          });
          await tx.mutate.sessions.upsert({
            id: args.sessionId,
            name: session?.name ?? null,
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
              ? { ...p, connected: true, name: session?.name ?? p.name }
              : p
          )
        : [...game.players, { sessionId: args.sessionId, name: session?.name ?? null, connected: true }];

      await tx.mutate.chain_reaction_games.update({
        id: game.id,
        players,
        updated_at: now()
      });
      await tx.mutate.sessions.upsert({
        id: args.sessionId,
        name: session?.name ?? null,
        game_type: "chain_reaction",
        game_id: game.id,
        created_at: now(),
        last_seen: now()
      });
    }
  ),

  leave: defineMutator(
    z.object({ gameId: z.string(), sessionId: z.string() }),
    async ({ args, tx }) => {
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
          ? { text: "Your opponent left — game over!", ts: now() }
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
    async ({ args, tx }) => {
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
    async ({ args, tx }) => {
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
    async ({ args, tx }) => {
      const game = await tx.run(zql.chain_reaction_games.where("id", args.gameId).one());
      if (!game) throw new Error("Game not found");
      if (game.host_id !== args.hostId) throw new Error("Only host can start");
      if (game.phase !== "lobby") throw new Error("Game already started");
      if (game.players.length !== 2) throw new Error("Need exactly 2 players");

      if (game.settings.chainMode === "custom") {
        // Go to submitting phase — both players will enter their chains
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

      // Premade mode — pick two different chains, one for each player to solve
      const p1 = game.players[0]!.sessionId;
      const p2 = game.players[1]!.sessionId;
      const makeChainSlots = (words: string[]) => words.map((word, i, arr) => ({
        word,
        revealed: i === 0 || i === arr.length - 1,
        lettersShown: 0,
        solvedBy: null as string | null
      }));

      const chain: Record<string, Array<{ word: string; revealed: boolean; lettersShown: number; solvedBy: string | null }>> = {
        [p1]: makeChainSlots(pickChain(game.settings.chainLength, game.settings.category)),
        [p2]: makeChainSlots(pickChain(game.settings.chainLength, game.settings.category))
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
    async ({ args, tx }) => {
      const game = await tx.run(zql.chain_reaction_games.where("id", args.gameId).one());
      if (!game) throw new Error("Game not found");
      if (game.phase !== "submitting") throw new Error("Not in submission phase");
      if (!game.players.some((p) => p.sessionId === args.sessionId)) throw new Error("Not in this game");
      if (args.words.length !== game.settings.chainLength) throw new Error(`Chain must be exactly ${game.settings.chainLength} words`);

      const submitted = { ...game.submitted_chains, [args.sessionId]: args.words.map((w) => w.trim().toUpperCase()) };
      const allSubmitted = game.players.every((p) => submitted[p.sessionId]?.length === game.settings.chainLength);

      if (!allSubmitted) {
        // Just save this player's chain and wait
        const session = await tx.run(zql.sessions.where("id", args.sessionId).one());
        const name = session?.name ?? args.sessionId.slice(0, 6);
        await tx.mutate.chain_reaction_games.update({
          id: game.id,
          submitted_chains: submitted,
          announcement: { text: `${name} submitted their chain!`, ts: now() },
          updated_at: now()
        });
        return;
      }

      // Both submitted — each player guesses the OTHER player's chain
      const p1 = game.players[0]!.sessionId;
      const p2 = game.players[1]!.sessionId;
      const makeChainSlots = (words: string[]) => words.map((word, i, arr) => ({
        word,
        revealed: i === 0 || i === arr.length - 1,
        lettersShown: 0,
        solvedBy: null as string | null
      }));

      const chain: Record<string, Array<{ word: string; revealed: boolean; lettersShown: number; solvedBy: string | null }>> = {
        [p1]: makeChainSlots(submitted[p2]!), // P1 guesses P2's words
        [p2]: makeChainSlots(submitted[p1]!)  // P2 guesses P1's words
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
        announcement: { text: "Chains submitted — let's play!", ts: now() },
        settings: { ...game.settings, phaseEndsAt },
        updated_at: now()
      });
    }
  ),

  revealLetter: defineMutator(
    z.object({ gameId: z.string(), sessionId: z.string(), wordIndex: z.number() }),
    async ({ args, tx }) => {
      const game = await tx.run(zql.chain_reaction_games.where("id", args.gameId).one());
      if (!game || game.phase !== "playing") throw new Error("Game not in playing phase");

      const playerChain = game.chain[args.sessionId];
      if (!playerChain) throw new Error("No chain for this player");

      const slot = playerChain[args.wordIndex];
      if (!slot || slot.revealed) throw new Error("Invalid word slot");

      // Reveal one more letter (keep last letter hidden to preserve deduction)
      const maxReveal = slot.word.length - 1;
      if (slot.lettersShown >= maxReveal) throw new Error("All revealable letters already shown");

      const updatedPlayerChain = playerChain.map((s, i) =>
        i === args.wordIndex ? { ...s, lettersShown: s.lettersShown + 1 } : s
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
    async ({ args, tx }) => {
      const game = await tx.run(zql.chain_reaction_games.where("id", args.gameId).one());
      if (!game || game.phase !== "playing") throw new Error("Game not in playing phase");

      const playerChain = game.chain[args.sessionId];
      if (!playerChain) throw new Error("No chain for this player");

      const slot = playerChain[args.wordIndex];
      if (!slot || slot.revealed) throw new Error("Invalid word slot");

      const correct = normalized(args.guess) === normalized(slot.word);
      let updatedPlayerChain = [...playerChain];
      let scores = { ...game.scores };
      let announcement: { text: string; ts: number } | null = null;

      if (!correct) {
        // Wrong guess — auto-reveal one letter (unless it would reveal the whole word)
        const newLettersShown = slot.lettersShown < slot.word.length - 1
          ? slot.lettersShown + 1
          : slot.lettersShown;
        updatedPlayerChain = updatedPlayerChain.map((s, i) =>
          i === args.wordIndex ? { ...s, lettersShown: newLettersShown } : s
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
      const playerName = session?.name ?? args.sessionId.slice(0, 6);

      updatedPlayerChain = updatedPlayerChain.map((s, i) =>
        i === args.wordIndex ? { ...s, revealed: true, solvedBy: args.sessionId } : s
      );
      const points = scoreForLetters(slot.lettersShown);
      const hiddenWords = updatedPlayerChain.filter((s) => !s.revealed);
      const isLastWord = hiddenWords.length === 0;
      const totalPoints = points + (isLastWord ? 1 : 0);
      scores[args.sessionId] = (scores[args.sessionId] ?? 0) + totalPoints;

      announcement = {
        text: `${playerName} guessed "${slot.word}" for ${totalPoints} point${totalPoints !== 1 ? "s" : ""}!`,
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
          const winnerName = winnerSession?.name ?? winner?.[0].slice(0, 6) ?? "???";
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
              announcement: { text: `Round ${nextRound} — submit your chains!`, ts: now() },
              settings: { ...game.settings, currentRound: nextRound, phaseEndsAt: null },
              updated_at: now()
            });
          } else {
            const p1 = game.players[0]!.sessionId;
            const p2 = game.players[1]!.sessionId;
            const makeChainSlots = (words: string[]) => words.map((word, i, arr) => ({
              word,
              revealed: i === 0 || i === arr.length - 1,
              lettersShown: 0,
              solvedBy: null as string | null
            }));
            const newChain = {
              [p1]: makeChainSlots(pickChain(game.settings.chainLength, game.settings.category)),
              [p2]: makeChainSlots(pickChain(game.settings.chainLength, game.settings.category))
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

      // Not all done yet — just update this player's chain
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
    async ({ args, tx }) => {
      const game = await tx.run(zql.chain_reaction_games.where("id", args.gameId).one());
      if (!game || game.phase !== "playing") throw new Error("Game not in playing phase");

      const playerChain = game.chain[args.sessionId];
      if (!playerChain) throw new Error("No chain for this player");

      const slot = playerChain[args.wordIndex];
      if (!slot || slot.revealed) throw new Error("Invalid word slot");

      // Reveal the word with 0 points (solvedBy null = given up)
      const updatedPlayerChain = playerChain.map((s, i) =>
        i === args.wordIndex ? { ...s, revealed: true, lettersShown: s.word.length, solvedBy: null } : s
      );

      const session = await tx.run(zql.sessions.where("id", args.sessionId).one());
      const playerName = session?.name ?? args.sessionId.slice(0, 6);

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
          const winnerName = winnerSession?.name ?? winner?.[0].slice(0, 6) ?? "???";
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
              announcement: { text: `Round ${nextRound} — submit your chains!`, ts: now() },
              settings: { ...game.settings, currentRound: nextRound, phaseEndsAt: null },
              updated_at: now()
            });
          } else {
            const p1 = game.players[0]!.sessionId;
            const p2 = game.players[1]!.sessionId;
            const makeChainSlots = (words: string[]) => words.map((word, i, arr) => ({
              word,
              revealed: i === 0 || i === arr.length - 1,
              lettersShown: 0,
              solvedBy: null as string | null
            }));
            const newChain = {
              [p1]: makeChainSlots(pickChain(game.settings.chainLength, game.settings.category)),
              [p2]: makeChainSlots(pickChain(game.settings.chainLength, game.settings.category))
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
        announcement: { text: `${playerName} gave up on "${slot.word}"`, ts: now() },
        updated_at: now()
      });
    }
  ),

  resetToLobby: defineMutator(
    z.object({ gameId: z.string(), hostId: z.string() }),
    async ({ args, tx }) => {
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
    async ({ args, tx }) => {
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
    async ({ args, tx }) => {
      const session = await tx.run(zql.sessions.where("id", args.sessionId).one());
      const game = await tx.run(zql.chain_reaction_games.where("id", args.gameId).one());
      if (!game) throw new Error("Game not found");
      if (game.phase === "ended" || game.phase === "finished") throw new Error("Game has ended");
      if (game.kicked.includes(args.sessionId)) throw new Error("You have been kicked from this game");
      if (game.players.some((p) => p.sessionId === args.sessionId)) throw new Error("Already in game as player");
      if (game.spectators.find((s) => s.sessionId === args.sessionId)) return;

      await tx.mutate.chain_reaction_games.update({
        id: game.id,
        spectators: [...game.spectators, { sessionId: args.sessionId, name: session?.name ?? null }],
        updated_at: now()
      });
      await tx.mutate.sessions.upsert({
        id: args.sessionId,
        name: session?.name ?? null,
        game_type: "chain_reaction",
        game_id: game.id,
        created_at: now(),
        last_seen: now()
      });
    }
  ),

  leaveSpectator: defineMutator(
    z.object({ gameId: z.string(), sessionId: z.string() }),
    async ({ args, tx }) => {
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
    async ({ args, tx }) => {
      const game = await tx.run(zql.chain_reaction_games.where("id", args.gameId).one());
      if (!game || game.host_id !== args.hostId) throw new Error("Only host can announce");
      await tx.mutate.chain_reaction_games.update({
        id: game.id,
        announcement: { text: args.text.trim(), ts: now() },
        updated_at: now()
      });
    }
  ),

  removeSpectator: defineMutator(
    z.object({ gameId: z.string(), hostId: z.string(), targetId: z.string() }),
    async ({ args, tx }) => {
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
    async ({ args, tx }) => {
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
