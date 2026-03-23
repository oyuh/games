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
        spectators: [],
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
        is_public: false,
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
      const existingPlayer = game.players.find((player) => player.sessionId === args.sessionId);
      // Only allow actual joining during lobby; mid-game visitors join as spectators
      if (game.phase !== "lobby") {
        if (existingPlayer) {
          await tx.mutate.imposter_games.update({
            id: game.id,
            players: game.players.map((player) =>
              player.sessionId === args.sessionId
                ? { ...player, connected: true, name: session?.name ?? player.name }
                : player
            ),
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
          return;
        }
        // Add as spectator instead of throwing
        if (game.spectators.find((s) => s.sessionId === args.sessionId)) return;
        await tx.mutate.imposter_games.update({
          id: game.id,
          spectators: [...game.spectators, { sessionId: args.sessionId, name: session?.name ?? null }],
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
        return;
      }

      const players = existingPlayer
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

      // Auto-check: if all remaining active players have submitted, advance phase
      const activePlayers = players.filter((p) => !p.eliminated);
      let phase = game.phase;
      let settings = game.settings;
      if (phase === "playing" && activePlayers.length > 0) {
        const cluesIn = game.clues.filter((c) => activePlayers.some((p) => p.sessionId === c.sessionId));
        if (cluesIn.length >= activePlayers.length) {
          phase = "voting";
          settings = { ...settings, phaseEndsAt: now() + settings.votingDurationSec * 1000 };
        }
      } else if (phase === "voting" && activePlayers.length > 0) {
        const votesIn = game.votes.filter((v) => activePlayers.some((p) => p.sessionId === v.voterId));
        if (votesIn.length >= activePlayers.length) {
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
        players: withRoles.map((p) => ({ ...p, eliminated: false })),
        clues: [],
        votes: [],
        round_history: [],
        settings: { ...game.settings, currentRound: 1, phaseEndsAt },
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
      if (player.eliminated) throw new Error("Eliminated players cannot submit clues");

      const withoutCurrent = game.clues.filter((clue) => clue.sessionId !== args.sessionId);
      const nextClues = [...withoutCurrent, { sessionId: args.sessionId, text: args.text.trim(), createdAt: now() }];
      const activePlayers = game.players.filter((p) => !p.eliminated);
      const allSubmitted = nextClues.length >= activePlayers.length;

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

      const voterExists = game.players.some((player) => player.sessionId === args.voterId && !player.eliminated);
      const targetExists = game.players.some((player) => player.sessionId === args.targetId && !player.eliminated);
      if (!voterExists || !targetExists) throw new Error("Invalid vote participants");
      if (args.voterId === args.targetId) throw new Error("Cannot vote for yourself");

      const withoutCurrent = game.votes.filter((vote) => vote.voterId !== args.voterId);
      const nextVotes = [...withoutCurrent, { voterId: args.voterId, targetId: args.targetId }];
      const activePlayers = game.players.filter((p) => !p.eliminated);
      const allVoted = nextVotes.length >= activePlayers.length;

      await tx.mutate.imposter_games.update({
        id: game.id,
        votes: nextVotes,
        phase: allVoted ? "results" : game.phase,
        settings: allVoted ? { ...game.settings, phaseEndsAt: now() + 8000, skipVotes: [] } : game.settings,
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
        // Auto-fill empty clues for active (non-eliminated) players who didn't submit
        const activePlayers = game.players.filter((p) => !p.eliminated);
        const submittedIds = new Set(game.clues.map((c) => c.sessionId));
        const clues = [...game.clues];
        for (const p of activePlayers) {
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
          settings: { ...game.settings, phaseEndsAt: now() + 8000, skipVotes: [] },
          updated_at: now()
        });
      } else if (game.phase === "results") {
        // Tally votes → eliminate most-voted → check win conditions
        const activePlayers = game.players.filter((p) => !p.eliminated);
        const tally = game.votes.reduce<Record<string, number>>((acc, v) => {
          acc[v.targetId] = (acc[v.targetId] ?? 0) + 1;
          return acc;
        }, {});
        const maxVotes = Math.max(...Object.values(tally), 0);
        const topVoted = Object.entries(tally)
          .filter(([, count]) => count === maxVotes && maxVotes > 0)
          .map(([id]) => id);

        // Determine who is voted out (first in tie, or null if no votes)
        const votedOutId = topVoted[0] ?? null;
        const votedOutPlayer = votedOutId ? activePlayers.find((p) => p.sessionId === votedOutId) : null;
        const wasImposter = votedOutPlayer?.role === "imposter";

        // Eliminate the voted-out player
        const updatedPlayers = game.players.map((p) =>
          p.sessionId === votedOutId ? { ...p, eliminated: true } : p
        );

        // Move eliminated player to spectators
        const updatedSpectators = [...(game.spectators ?? [])];
        if (votedOutPlayer) {
          updatedSpectators.push({ sessionId: votedOutPlayer.sessionId, name: votedOutPlayer.name });
        }

        const roundEntry = {
          round: game.settings.currentRound,
          secretWord: game.secret_word,
          votedOutId,
          votedOutName: votedOutPlayer?.name ?? null,
          wasImposter: wasImposter ?? false,
          clues: game.clues.map((c) => ({ sessionId: c.sessionId, text: c.text })),
          votes: game.votes
        };
        const roundHistory = [...(game.round_history ?? []), roundEntry];

        // Check win conditions
        const remainingAfter = updatedPlayers.filter((p) => !p.eliminated);
        const impostersLeft = remainingAfter.filter((p) => p.role === "imposter").length;
        const innocentsLeft = remainingAfter.filter((p) => p.role !== "imposter").length;
        const nextRound = game.settings.currentRound + 1;
        const allImpostersOut = impostersLeft === 0;
        const impostersOverpower = impostersLeft >= innocentsLeft;
        const roundsExhausted = nextRound > game.settings.rounds;
        const done = allImpostersOut || impostersOverpower || roundsExhausted;

        if (done) {
          await tx.mutate.imposter_games.update({
            id: game.id,
            phase: "finished",
            clues: [],
            votes: [],
            players: updatedPlayers,
            spectators: updatedSpectators,
            round_history: roundHistory,
            settings: { ...game.settings, phaseEndsAt: null },
            updated_at: now()
          });
          return;
        }

        // Continue to next round — new word, same roles, minus eliminated
        const bank = imposterWordBank[game.category ?? "animals"] ?? imposterWordBank.animals ?? ["Planet"];
        const phaseEndsAt = now() + game.settings.roundDurationSec * 1000;
        await tx.mutate.imposter_games.update({
          id: game.id,
          phase: "playing",
          secret_word: pickRandom(bank),
          clues: [],
          votes: [],
          players: updatedPlayers,
          spectators: updatedSpectators,
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

      // Tally votes → eliminate most-voted → check win conditions
      const activePlayers = game.players.filter((p) => !p.eliminated);
      const tally = game.votes.reduce<Record<string, number>>((acc, v) => {
        acc[v.targetId] = (acc[v.targetId] ?? 0) + 1;
        return acc;
      }, {});
      const maxVotes = Math.max(...Object.values(tally), 0);
      const topVoted = Object.entries(tally)
        .filter(([, count]) => count === maxVotes && maxVotes > 0)
        .map(([id]) => id);

      const votedOutId = topVoted[0] ?? null;
      const votedOutPlayer = votedOutId ? activePlayers.find((p) => p.sessionId === votedOutId) : null;
      const wasImposter = votedOutPlayer?.role === "imposter";

      const updatedPlayers = game.players.map((p) =>
        p.sessionId === votedOutId ? { ...p, eliminated: true } : p
      );

      // Move eliminated player to spectators
      const updatedSpectators = [...(game.spectators ?? [])];
      if (votedOutPlayer) {
        updatedSpectators.push({ sessionId: votedOutPlayer.sessionId, name: votedOutPlayer.name });
      }

      const roundEntry = {
        round: game.settings.currentRound,
        secretWord: game.secret_word,
        votedOutId,
        votedOutName: votedOutPlayer?.name ?? null,
        wasImposter: wasImposter ?? false,
        clues: game.clues.map((c) => ({ sessionId: c.sessionId, text: c.text })),
        votes: game.votes
      };
      const roundHistory = [...(game.round_history ?? []), roundEntry];

      const remainingAfter = updatedPlayers.filter((p) => !p.eliminated);
      const impostersLeft = remainingAfter.filter((p) => p.role === "imposter").length;
      const innocentsLeft = remainingAfter.filter((p) => p.role !== "imposter").length;
      const nextRound = game.settings.currentRound + 1;
      const allImpostersOut = impostersLeft === 0;
      const impostersOverpower = impostersLeft >= innocentsLeft;
      const roundsExhausted = nextRound > game.settings.rounds;
      const done = allImpostersOut || impostersOverpower || roundsExhausted;

      if (done) {
        await tx.mutate.imposter_games.update({
          id: game.id,
          phase: "finished",
          clues: [],
          votes: [],
          players: updatedPlayers,
          spectators: updatedSpectators,
          round_history: roundHistory,
          settings: { ...game.settings, phaseEndsAt: null },
          updated_at: now()
        });
        return;
      }

      // Continue to next round — new word, same roles, minus eliminated
      const bank = imposterWordBank[game.category ?? "animals"] ?? imposterWordBank.animals ?? ["Planet"];
      const phaseEndsAt = now() + game.settings.roundDurationSec * 1000;
      await tx.mutate.imposter_games.update({
        id: game.id,
        phase: "playing",
        secret_word: pickRandom(bank),
        clues: [],
        votes: [],
        players: updatedPlayers,
        spectators: updatedSpectators,
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
        spectators: [],
        players: game.players.map((player) => {
          const { role: _role, eliminated: _elim, ...rest } = player;
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
  ),

  joinAsSpectator: defineMutator(
    z.object({ gameId: z.string(), sessionId: z.string() }),
    async ({ args, tx }) => {
      const session = await tx.run(zql.sessions.where("id", args.sessionId).one());
      const game = await tx.run(zql.imposter_games.where("id", args.gameId).one());
      if (!game) throw new Error("Game not found");
      if (game.phase === "ended") throw new Error("Game has ended");
      if (game.kicked.includes(args.sessionId)) throw new Error("You have been kicked from this game");
      // Already a player? Not allowed
      if (game.players.some((p) => p.sessionId === args.sessionId)) throw new Error("Already in game as player");
      const existing = game.spectators.find((s) => s.sessionId === args.sessionId);
      if (existing) return; // already spectating

      await tx.mutate.imposter_games.update({
        id: game.id,
        spectators: [...game.spectators, { sessionId: args.sessionId, name: session?.name ?? null }],
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

  leaveSpectator: defineMutator(
    z.object({ gameId: z.string(), sessionId: z.string() }),
    async ({ args, tx }) => {
      const game = await tx.run(zql.imposter_games.where("id", args.gameId).one());
      if (!game) return;
      await tx.mutate.imposter_games.update({
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

  removeSpectator: defineMutator(
    z.object({ gameId: z.string(), hostId: z.string(), targetId: z.string() }),
    async ({ args, tx }) => {
      const game = await tx.run(zql.imposter_games.where("id", args.gameId).one());
      if (!game || game.host_id !== args.hostId) throw new Error("Only host can remove spectators");
      await tx.mutate.imposter_games.update({
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

  voteSkipResults: defineMutator(
    z.object({ gameId: z.string(), sessionId: z.string() }),
    async ({ args, tx }) => {
      const game = await tx.run(zql.imposter_games.where("id", args.gameId).one());
      if (!game || game.phase !== "results") throw new Error("Not in results phase");

      const isActive = game.players.some((p) => p.sessionId === args.sessionId && !p.eliminated);
      if (!isActive) throw new Error("Not an active player");

      const current = game.settings.skipVotes ?? [];
      if (current.includes(args.sessionId)) return; // already voted

      const nextSkipVotes = [...current, args.sessionId];
      const activePlayers = game.players.filter((p) => !p.eliminated);
      const allSkipped = nextSkipVotes.length >= activePlayers.length;

      await tx.mutate.imposter_games.update({
        id: game.id,
        settings: {
          ...game.settings,
          skipVotes: nextSkipVotes,
          // If everyone voted skip, expire the timer immediately
          phaseEndsAt: allSkipped ? 1 : game.settings.phaseEndsAt
        },
        updated_at: now()
      });
    }
  ),

  setPublic: defineMutator(
    z.object({ gameId: z.string(), hostId: z.string(), isPublic: z.boolean() }),
    async ({ args, tx }) => {
      const game = await tx.run(zql.imposter_games.where("id", args.gameId).one());
      if (!game || game.host_id !== args.hostId) throw new Error("Only host can change visibility");
      if (game.phase === "ended") throw new Error("Game has ended");
      await tx.mutate.imposter_games.update({
        id: game.id,
        is_public: args.isPublic,
        updated_at: now()
      });
    }
  )
};
