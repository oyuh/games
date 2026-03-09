import { defineMutator } from "@rocicorp/zero";
import { z } from "zod";
import { zql } from "../schema";
import { now, code, pickRandom, chooseRoles } from "./helpers";
import { imposterWordBank } from "./word-banks";

export const imposterMutators = {
  create: defineMutator(
    z.object({
      id: z.string(),
      hostId: z.string(),
      category: z.string().optional(),
      rounds: z.number().min(1).max(10).optional(),
      imposters: z.number().min(1).max(5).optional()
    }),
    async ({ args, tx }) => {
      const ts = now();
      const session = await tx.run(zql.sessions.where("id", args.hostId).one());
      await tx.mutate.imposter_games.insert({
        id: args.id,
        code: code(),
        host_id: args.hostId,
        phase: "lobby",
        category: args.category ?? "animals",
        secret_word: null,
        players: [{ sessionId: args.hostId, name: session?.name ?? null, connected: true }],
        clues: [],
        votes: [],
        kicked: [],
        round_history: [],
        announcement: null,
        settings: {
          rounds: args.rounds ?? 3,
          imposters: args.imposters ?? 1,
          currentRound: 1,
          roundDurationSec: 75,
          votingDurationSec: 45,
          phaseEndsAt: null
        },
        created_at: ts,
        updated_at: ts
      });
      await tx.mutate.sessions.upsert({
        id: args.hostId,
        name: session?.name ?? null,
        game_type: "imposter",
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
      const game = await tx.run(zql.imposter_games.where("id", args.gameId).one());
      if (!game) {
        throw new Error("Game not found");
      }
      if (game.phase === "ended" || game.phase === "finished") {
        throw new Error("Game has ended");
      }
      if (game.kicked.includes(args.sessionId)) {
        throw new Error("You have been kicked from this game");
      }
      // Only allow actual joining during lobby; mid-game visitors spectate
      if (game.phase !== "lobby") {
        throw new Error("Game is already in progress");
      }

      const existing = game.players.find((player) => player.sessionId === args.sessionId);
      const players = existing
        ? game.players.map((player) =>
            player.sessionId === args.sessionId
              ? { ...player, connected: true, name: session?.name ?? player.name }
              : player
          )
        : [...game.players, { sessionId: args.sessionId, name: session?.name ?? null, connected: true }];

      await tx.mutate.imposter_games.update({
        id: game.id,
        players,
        updated_at: now()
      });

      await tx.mutate.sessions.upsert({
        id: args.sessionId,
        name: session?.name ?? null,
        game_type: "imposter",
        game_id: game.id,
        created_at: now(),
        last_seen: now()
      });
    }
  ),

  leave: defineMutator(
    z.object({ gameId: z.string(), sessionId: z.string() }),
    async ({ args, tx }) => {
      const game = await tx.run(zql.imposter_games.where("id", args.gameId).one());
      if (!game) return;

      // Host leaving ends the game for everyone
      if (game.host_id === args.sessionId) {
        await tx.mutate.imposter_games.update({
          id: game.id,
          phase: "ended",
          settings: { ...game.settings, phaseEndsAt: null },
          updated_at: now()
        });
        const gameSessions = await tx.run(
          zql.sessions.where("game_type", "imposter").where("game_id", game.id)
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

      const players = game.players.filter((player) => player.sessionId !== args.sessionId);

      // Auto-check: if all remaining players have submitted, advance phase
      let phase = game.phase;
      let settings = game.settings;
      if (phase === "playing" && players.length > 0) {
        const cluesIn = game.clues.filter((c) => players.some((p) => p.sessionId === c.sessionId));
        if (cluesIn.length >= players.length) {
          phase = "voting";
          settings = { ...settings, phaseEndsAt: now() + settings.votingDurationSec * 1000 };
        }
      } else if (phase === "voting" && players.length > 0) {
        const votesIn = game.votes.filter((v) => players.some((p) => p.sessionId === v.voterId));
        if (votesIn.length >= players.length) {
          phase = "results";
          settings = { ...settings, phaseEndsAt: null };
        }
      }

      await tx.mutate.imposter_games.update({
        id: game.id,
        players,
        phase,
        settings,
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

  start: defineMutator(
    z.object({ gameId: z.string(), hostId: z.string() }),
    async ({ args, tx }) => {
      const game = await tx.run(zql.imposter_games.where("id", args.gameId).one());
      if (!game) throw new Error("Game not found");
      if (game.host_id !== args.hostId) throw new Error("Only host can start");

      const players = game.players;
      if (players.length < 3) throw new Error("Need at least 3 players");
      const bank = imposterWordBank[game.category ?? "animals"] ?? imposterWordBank.animals ?? ["Planet"];
      const withRoles = chooseRoles(players, game.settings.imposters);
      const phaseEndsAt = now() + game.settings.roundDurationSec * 1000;

      await tx.mutate.imposter_games.update({
        id: game.id,
        phase: "playing",
        secret_word: pickRandom(bank),
        players: withRoles,
        clues: [],
        votes: [],
        settings: { ...game.settings, phaseEndsAt },
        updated_at: now()
      });
    }
  ),

  submitClue: defineMutator(
    z.object({ gameId: z.string(), sessionId: z.string(), text: z.string().min(1).max(80) }),
    async ({ args, tx }) => {
      const game = await tx.run(zql.imposter_games.where("id", args.gameId).one());
      if (!game || game.phase !== "playing") {
        throw new Error("Game is not accepting clues");
      }

      const player = game.players.find((item) => item.sessionId === args.sessionId);
      if (!player) throw new Error("Player is not in game");

      const withoutCurrent = game.clues.filter((clue) => clue.sessionId !== args.sessionId);
      const nextClues = [...withoutCurrent, { sessionId: args.sessionId, text: args.text.trim(), createdAt: now() }];
      const allSubmitted = nextClues.length >= game.players.length;

      await tx.mutate.imposter_games.update({
        id: game.id,
        clues: nextClues,
        phase: allSubmitted ? "voting" : game.phase,
        settings: allSubmitted
          ? { ...game.settings, phaseEndsAt: now() + game.settings.votingDurationSec * 1000 }
          : game.settings,
        updated_at: now()
      });
    }
  ),

  submitVote: defineMutator(
    z.object({ gameId: z.string(), voterId: z.string(), targetId: z.string() }),
    async ({ args, tx }) => {
      const game = await tx.run(zql.imposter_games.where("id", args.gameId).one());
      if (!game || game.phase !== "voting") {
        throw new Error("Game is not in voting phase");
      }

      const voterExists = game.players.some((player) => player.sessionId === args.voterId);
      const targetExists = game.players.some((player) => player.sessionId === args.targetId);
      if (!voterExists || !targetExists) throw new Error("Invalid vote participants");
      if (args.voterId === args.targetId) throw new Error("Cannot vote for yourself");

      const withoutCurrent = game.votes.filter((vote) => vote.voterId !== args.voterId);
      const nextVotes = [...withoutCurrent, { voterId: args.voterId, targetId: args.targetId }];
      const allVoted = nextVotes.length >= game.players.length;

      await tx.mutate.imposter_games.update({
        id: game.id,
        votes: nextVotes,
        phase: allVoted ? "results" : game.phase,
        settings: allVoted ? { ...game.settings, phaseEndsAt: now() + 8000 } : game.settings,
        updated_at: now()
      });
    }
  ),

  advanceTimer: defineMutator(
    z.object({ gameId: z.string() }),
    async ({ args, tx }) => {
      const game = await tx.run(zql.imposter_games.where("id", args.gameId).one());
      if (!game) return;

      const phaseEnd = game.settings.phaseEndsAt;
      if (!phaseEnd || now() < phaseEnd) return; // not expired yet

      if (game.phase === "playing") {
        // Auto-fill empty clues for players who didn't submit
        const submittedIds = new Set(game.clues.map((c) => c.sessionId));
        const clues = [...game.clues];
        for (const p of game.players) {
          if (!submittedIds.has(p.sessionId)) {
            clues.push({ sessionId: p.sessionId, text: "(no clue)", createdAt: now() });
          }
        }
        await tx.mutate.imposter_games.update({
          id: game.id,
          phase: "voting",
          clues,
          settings: { ...game.settings, phaseEndsAt: now() + game.settings.votingDurationSec * 1000 },
          updated_at: now()
        });
      } else if (game.phase === "voting") {
        // Move to results with whatever votes exist; start results countdown
        await tx.mutate.imposter_games.update({
          id: game.id,
          phase: "results",
          settings: { ...game.settings, phaseEndsAt: now() + 8000 },
          updated_at: now()
        });
      } else if (game.phase === "results") {
        // Auto-advance: save current round to history, start next round or finish
        const imposters = game.players.filter((p) => p.role === "imposter").map((p) => p.sessionId);
        const tally = game.votes.reduce<Record<string, number>>((acc, v) => {
          acc[v.targetId] = (acc[v.targetId] ?? 0) + 1;
          return acc;
        }, {});
        const maxVotes = Math.max(...Object.values(tally), 0);
        const topVoted = Object.entries(tally)
          .filter(([, count]) => count === maxVotes && maxVotes > 0)
          .map(([id]) => id);
        const caught = imposters.length > 0 && imposters.some((id) => topVoted.includes(id));

        const roundEntry = {
          round: game.settings.currentRound,
          secretWord: game.secret_word,
          imposters,
          caught,
          clues: game.clues.map((c) => ({ sessionId: c.sessionId, text: c.text })),
          votes: game.votes
        };
        const roundHistory = [...(game.round_history ?? []), roundEntry];

        const nextRound = game.settings.currentRound + 1;
        const done = nextRound > game.settings.rounds || caught;

        if (done) {
          await tx.mutate.imposter_games.update({
            id: game.id,
            phase: "finished",
            clues: [],
            votes: [],
            round_history: roundHistory,
            settings: { ...game.settings, phaseEndsAt: null },
            updated_at: now()
          });
          return;
        }

        const bank = imposterWordBank[game.category ?? "animals"] ?? imposterWordBank.animals ?? ["Planet"];
        const players = chooseRoles(game.players, game.settings.imposters);
        const phaseEndsAt = now() + game.settings.roundDurationSec * 1000;

        await tx.mutate.imposter_games.update({
          id: game.id,
          phase: "playing",
          secret_word: pickRandom(bank),
          clues: [],
          votes: [],
          players,
          round_history: roundHistory,
          settings: { ...game.settings, currentRound: nextRound, phaseEndsAt },
          updated_at: now()
        });
      }
    }
  ),

  nextRound: defineMutator(
    z.object({ gameId: z.string(), hostId: z.string() }),
    async ({ args, tx }) => {
      const game = await tx.run(zql.imposter_games.where("id", args.gameId).one());
      if (!game || game.host_id !== args.hostId) throw new Error("Not allowed");

      // Save current round to history
      const imposters = game.players.filter((p) => p.role === "imposter").map((p) => p.sessionId);
      const tally = game.votes.reduce<Record<string, number>>((acc, v) => {
        acc[v.targetId] = (acc[v.targetId] ?? 0) + 1;
        return acc;
      }, {});
      const maxVotes = Math.max(...Object.values(tally), 0);
      const topVoted = Object.entries(tally)
        .filter(([, count]) => count === maxVotes && maxVotes > 0)
        .map(([id]) => id);
      const caught = imposters.length > 0 && imposters.some((id) => topVoted.includes(id));

      const roundEntry = {
        round: game.settings.currentRound,
        secretWord: game.secret_word,
        imposters,
        caught,
        clues: game.clues.map((c) => ({ sessionId: c.sessionId, text: c.text })),
        votes: game.votes
      };
      const roundHistory = [...(game.round_history ?? []), roundEntry];

      const nextRound = game.settings.currentRound + 1;
      const done = nextRound > game.settings.rounds || caught;

      if (done) {
        // Game finished — imposter caught or all rounds played
        await tx.mutate.imposter_games.update({
          id: game.id,
          phase: "finished",
          clues: [],
          votes: [],
          round_history: roundHistory,
          settings: { ...game.settings, phaseEndsAt: null },
          updated_at: now()
        });
        return;
      }

      // Start next round
      const bank = imposterWordBank[game.category ?? "animals"] ?? imposterWordBank.animals ?? ["Planet"];
      const players = chooseRoles(game.players, game.settings.imposters);
      const phaseEndsAt = now() + game.settings.roundDurationSec * 1000;

      await tx.mutate.imposter_games.update({
        id: game.id,
        phase: "playing",
        secret_word: pickRandom(bank),
        clues: [],
        votes: [],
        players,
        round_history: roundHistory,
        settings: { ...game.settings, currentRound: nextRound, phaseEndsAt },
        updated_at: now()
      });
    }
  ),

  resetToLobby: defineMutator(
    z.object({ gameId: z.string(), hostId: z.string() }),
    async ({ args, tx }) => {
      const game = await tx.run(zql.imposter_games.where("id", args.gameId).one());
      if (!game || game.host_id !== args.hostId) throw new Error("Not allowed");

      await tx.mutate.imposter_games.update({
        id: game.id,
        phase: "lobby",
        clues: [],
        votes: [],
        secret_word: null,
        round_history: [],
        announcement: null,
        players: game.players.map((player) => {
          const { role: _role, ...rest } = player;
          return rest;
        }),
        settings: { ...game.settings, currentRound: 1, phaseEndsAt: null },
        updated_at: now()
      });

      // Clear chat messages
      const msgs = await tx.run(
        zql.chat_messages.where("game_type", "imposter").where("game_id", args.gameId)
      );
      for (const m of msgs) {
        await tx.mutate.chat_messages.delete({ id: m.id });
      }
    }
  ),

  announce: defineMutator(
    z.object({ gameId: z.string(), hostId: z.string(), text: z.string().min(1).max(120) }),
    async ({ args, tx }) => {
      const game = await tx.run(zql.imposter_games.where("id", args.gameId).one());
      if (!game || game.host_id !== args.hostId) throw new Error("Only host can announce");
      await tx.mutate.imposter_games.update({
        id: game.id,
        announcement: { text: args.text.trim(), ts: now() },
        updated_at: now()
      });
    }
  ),

  kick: defineMutator(
    z.object({ gameId: z.string(), hostId: z.string(), targetId: z.string() }),
    async ({ args, tx }) => {
      const game = await tx.run(zql.imposter_games.where("id", args.gameId).one());
      if (!game || game.host_id !== args.hostId) throw new Error("Only host can kick");
      if (args.targetId === args.hostId) throw new Error("Cannot kick yourself");

      const players = game.players.filter((p) => p.sessionId !== args.targetId);
      const kicked = [...game.kicked, args.targetId];

      await tx.mutate.imposter_games.update({
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

  endGame: defineMutator(
    z.object({ gameId: z.string(), hostId: z.string() }),
    async ({ args, tx }) => {
      const game = await tx.run(zql.imposter_games.where("id", args.gameId).one());
      if (!game || game.host_id !== args.hostId) throw new Error("Only host can end game");

      await tx.mutate.imposter_games.update({
        id: game.id,
        phase: "ended",
        settings: { ...game.settings, phaseEndsAt: null },
        updated_at: now()
      });

      const gameSessions = await tx.run(
        zql.sessions.where("game_type", "imposter").where("game_id", game.id)
      );
      for (const s of gameSessions) {
        await tx.mutate.sessions.update({
          id: s.id,
          game_type: undefined,
          game_id: undefined,
          last_seen: now()
        });
      }

      // Clear chat messages
      const chatMsgs = await tx.run(
        zql.chat_messages.where("game_type", "imposter").where("game_id", game.id)
      );
      for (const m of chatMsgs) {
        await tx.mutate.chat_messages.delete({ id: m.id });
      }
    }
  )
};
