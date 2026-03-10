import { defineMutator } from "@rocicorp/zero";
import { z } from "zod";
import { zql } from "../schema";
import { now, code, shuffle } from "./helpers";

export const shadeSignalMutators = {
  create: defineMutator(
    z.object({
      id: z.string(),
      hostId: z.string(),
      hardMode: z.boolean().optional(),
      leaderPick: z.boolean().optional(),
      roundsPerPlayer: z.number().min(1).max(3).optional(),
      gridRows: z.number().min(6).max(14).optional(),
      gridCols: z.number().min(8).max(16).optional()
    }),
    async ({ args, tx }) => {
      const ts = now();
      const session = await tx.run(zql.sessions.where("id", args.hostId).one());
      await tx.mutate.shade_signal_games.insert({
        id: args.id,
        code: code(),
        host_id: args.hostId,
        phase: "lobby",
        players: [{ sessionId: args.hostId, name: session?.name ?? null, connected: true, totalScore: 0 }],
        leader_id: null,
        leader_order: [],
        current_leader_index: 0,
        grid_seed: Math.floor(Math.random() * 100000),
        grid_rows: args.gridRows ?? 10,
        grid_cols: args.gridCols ?? 12,
        target_row: null,
        target_col: null,
        clue1: null,
        clue2: null,
        guesses: [],
        round_history: [],
        kicked: [],
        spectators: [],
        announcement: null,
        settings: {
          hardMode: args.hardMode ?? false,
          leaderPick: args.leaderPick ?? false,
          clueDurationSec: 45,
          guessDurationSec: 30,
          roundsPerPlayer: args.roundsPerPlayer ?? 1,
          currentRound: 1,
          phaseEndsAt: null
        },
        created_at: ts,
        updated_at: ts
      });
      await tx.mutate.sessions.upsert({
        id: args.hostId,
        name: session?.name ?? null,
        game_type: "shade_signal",
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
      const game = await tx.run(zql.shade_signal_games.where("id", args.gameId).one());
      if (!game) throw new Error("Game not found");
      if (game.phase === "ended" || game.phase === "finished") throw new Error("Game has ended");
      if (game.kicked.includes(args.sessionId)) throw new Error("You have been kicked from this game");
      if (game.phase !== "lobby") {
        // Mid-game visitors join as spectators
        if (!game.players.some((p) => p.sessionId === args.sessionId) && !game.spectators.find((s) => s.sessionId === args.sessionId)) {
          await tx.mutate.shade_signal_games.update({
            id: game.id,
            spectators: [...game.spectators, { sessionId: args.sessionId, name: session?.name ?? null }],
            updated_at: now()
          });
          await tx.mutate.sessions.upsert({
            id: args.sessionId,
            name: session?.name ?? null,
            game_type: "shade_signal",
            game_id: game.id,
            created_at: now(),
            last_seen: now()
          });
        }
        return;
      }

      const existing = game.players.find((p) => p.sessionId === args.sessionId);
      const players = existing
        ? game.players.map((p) =>
            p.sessionId === args.sessionId
              ? { ...p, connected: true, name: session?.name ?? p.name }
              : p
          )
        : [...game.players, { sessionId: args.sessionId, name: session?.name ?? null, connected: true, totalScore: 0 }];

      await tx.mutate.shade_signal_games.update({
        id: game.id,
        players,
        updated_at: now()
      });
      await tx.mutate.sessions.upsert({
        id: args.sessionId,
        name: session?.name ?? null,
        game_type: "shade_signal",
        game_id: game.id,
        created_at: now(),
        last_seen: now()
      });
    }
  ),

  leave: defineMutator(
    z.object({ gameId: z.string(), sessionId: z.string() }),
    async ({ args, tx }) => {
      const game = await tx.run(zql.shade_signal_games.where("id", args.gameId).one());
      if (!game) return;

      if (game.host_id === args.sessionId) {
        await tx.mutate.shade_signal_games.update({
          id: game.id,
          phase: "ended",
          settings: { ...game.settings, phaseEndsAt: null },
          updated_at: now()
        });
        const gameSessions = await tx.run(
          zql.sessions.where("game_type", "shade_signal").where("game_id", game.id)
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

      const players = game.players.filter((p) => p.sessionId !== args.sessionId);
      await tx.mutate.shade_signal_games.update({
        id: game.id,
        players,
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

  kick: defineMutator(
    z.object({ gameId: z.string(), hostId: z.string(), targetId: z.string() }),
    async ({ args, tx }) => {
      const game = await tx.run(zql.shade_signal_games.where("id", args.gameId).one());
      if (!game) throw new Error("Game not found");
      if (game.host_id !== args.hostId) throw new Error("Only host can kick");
      if (args.targetId === args.hostId) throw new Error("Cannot kick yourself");

      const players = game.players.filter((p) => p.sessionId !== args.targetId);
      const kicked = [...game.kicked, args.targetId];
      await tx.mutate.shade_signal_games.update({
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

  announce: defineMutator(
    z.object({ gameId: z.string(), hostId: z.string(), text: z.string().min(1).max(200) }),
    async ({ args, tx }) => {
      const game = await tx.run(zql.shade_signal_games.where("id", args.gameId).one());
      if (!game || game.host_id !== args.hostId) throw new Error("Only host can announce");
      await tx.mutate.shade_signal_games.update({
        id: game.id,
        announcement: { text: args.text, ts: now() },
        updated_at: now()
      });
    }
  ),

  updateSettings: defineMutator(
    z.object({
      gameId: z.string(),
      hostId: z.string(),
      settings: z.object({
        leaderPick: z.boolean().optional(),
        hardMode: z.boolean().optional(),
        clueDurationSec: z.number().optional(),
        guessDurationSec: z.number().optional(),
        roundsPerPlayer: z.number().optional(),
      })
    }),
    async ({ args, tx }) => {
      const game = await tx.run(zql.shade_signal_games.where("id", args.gameId).one());
      if (!game) throw new Error("Game not found");
      if (game.host_id !== args.hostId) throw new Error("Only host can update settings");
      if (game.phase !== "lobby") throw new Error("Can only update settings in lobby");
      // Only apply defined keys
      const patch: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(args.settings)) {
        if (v !== undefined) patch[k] = v;
      }
      await tx.mutate.shade_signal_games.update({
        id: game.id,
        settings: { ...game.settings, ...patch },
        updated_at: now()
      });
    }
  ),

  start: defineMutator(
    z.object({ gameId: z.string(), hostId: z.string() }),
    async ({ args, tx }) => {
      const game = await tx.run(zql.shade_signal_games.where("id", args.gameId).one());
      if (!game) throw new Error("Game not found");
      if (game.host_id !== args.hostId) throw new Error("Only host can start");
      if (game.players.length < 3) throw new Error("Need at least 3 players");

      const shuffled = shuffle(game.players);
      const leaderOrder = shuffled.map((p) => p.sessionId);
      const leaderId = leaderOrder[0]!;
      const rows = game.grid_rows;
      const cols = game.grid_cols;
      const leaderPick = game.settings.leaderPick ?? false;
      const targetRow = leaderPick ? null : Math.floor(Math.random() * rows);
      const targetCol = leaderPick ? null : Math.floor(Math.random() * cols);

      await tx.mutate.shade_signal_games.update({
        id: game.id,
        phase: leaderPick ? "picking" : "clue1",
        leader_id: leaderId,
        leader_order: leaderOrder,
        current_leader_index: 0,
        grid_seed: Math.floor(Math.random() * 100000),
        target_row: targetRow,
        target_col: targetCol,
        clue1: null,
        clue2: null,
        guesses: [],
        settings: {
          ...game.settings,
          currentRound: 1,
          phaseEndsAt: leaderPick ? null : now() + game.settings.clueDurationSec * 1000
        },
        updated_at: now()
      });
    }
  ),

  setTarget: defineMutator(
    z.object({
      gameId: z.string(),
      sessionId: z.string(),
      row: z.number().min(0),
      col: z.number().min(0)
    }),
    async ({ args, tx }) => {
      const game = await tx.run(zql.shade_signal_games.where("id", args.gameId).one());
      if (!game) throw new Error("Game not found");
      if (game.phase !== "picking") throw new Error("Not in picking phase");
      if (game.leader_id !== args.sessionId) throw new Error("Only the leader can pick the target");

      await tx.mutate.shade_signal_games.update({
        id: game.id,
        phase: "clue1",
        target_row: args.row,
        target_col: args.col,
        settings: {
          ...game.settings,
          phaseEndsAt: now() + game.settings.clueDurationSec * 1000
        },
        updated_at: now()
      });
    }
  ),

  submitClue: defineMutator(
    z.object({
      gameId: z.string(),
      sessionId: z.string(),
      text: z.string().min(1).max(60)
    }),
    async ({ args, tx }) => {
      const game = await tx.run(zql.shade_signal_games.where("id", args.gameId).one());
      if (!game) throw new Error("Game not found");
      if (game.leader_id !== args.sessionId) throw new Error("Only the leader can give clues");

      const clueText = args.text.trim();

      // Hard mode: reject color-family names
      if (game.settings.hardMode) {
        const banned = [
          "red", "blue", "green", "yellow", "orange", "purple", "pink", "brown",
          "cyan", "magenta", "teal", "violet", "indigo", "maroon", "navy", "lime",
          "aqua", "crimson", "scarlet", "turquoise", "coral", "salmon", "lavender",
          "beige", "tan", "ivory", "grey", "gray", "white", "black", "gold", "silver",
          "amber", "ruby", "emerald", "sapphire", "jade", "rose", "peach", "plum",
          "mint", "olive", "rust", "copper", "bronze", "charcoal", "cream", "khaki",
          "mauve", "burgundy", "cerulean", "periwinkle", "fuchsia", "chartreuse",
        ];
        const words = clueText.toLowerCase().split(/\s+/);
        const found = words.find((w) => banned.includes(w));
        if (found) throw new Error(`"${found}" is a color name — not allowed with No Color Names rule!`);
      }

      if (game.phase === "clue1") {
        // Clue 1: must be a single word
        if (clueText.split(/\s+/).length > 1) throw new Error("First clue must be a single word");
        await tx.mutate.shade_signal_games.update({
          id: game.id,
          clue1: clueText,
          phase: "guess1",
          settings: {
            ...game.settings,
            phaseEndsAt: now() + game.settings.guessDurationSec * 1000
          },
          updated_at: now()
        });
      } else if (game.phase === "clue2") {
        // Clue 2: one or two words
        if (clueText.split(/\s+/).length > 2) throw new Error("Second clue can be at most two words");
        await tx.mutate.shade_signal_games.update({
          id: game.id,
          clue2: clueText,
          phase: "guess2",
          settings: {
            ...game.settings,
            phaseEndsAt: now() + game.settings.guessDurationSec * 1000
          },
          updated_at: now()
        });
      } else {
        throw new Error("Game is not in a clue phase");
      }
    }
  ),

  submitGuess: defineMutator(
    z.object({
      gameId: z.string(),
      sessionId: z.string(),
      row: z.number().min(0),
      col: z.number().min(0)
    }),
    async ({ args, tx }) => {
      const game = await tx.run(zql.shade_signal_games.where("id", args.gameId).one());
      if (!game) throw new Error("Game not found");
      if (game.phase !== "guess1" && game.phase !== "guess2") throw new Error("Not in a guessing phase");
      if (game.leader_id === args.sessionId) throw new Error("Leader cannot guess");

      const player = game.players.find((p) => p.sessionId === args.sessionId);
      if (!player) throw new Error("Player not in game");

      const guessRound: 1 | 2 = game.phase === "guess1" ? 1 : 2;

      // Replace existing guess for this round
      const otherGuesses = game.guesses.filter(
        (g) => !(g.sessionId === args.sessionId && g.round === guessRound)
      );
      const newGuesses = [...otherGuesses, { sessionId: args.sessionId, round: guessRound, row: args.row, col: args.col }];

      // Check if all guessers have submitted for this round
      const guessersCount = game.players.filter((p) => p.sessionId !== game.leader_id).length;
      const roundGuesses = newGuesses.filter((g) => g.round === guessRound);
      const uniqueGuessers = new Set(roundGuesses.map((g) => g.sessionId));
      const allSubmitted = uniqueGuessers.size >= guessersCount;

      // When everyone locks in, set a 5-second grace timer instead of instantly advancing.
      // The existing advanceTimer mutator will handle the actual phase transition.
      let nextPhaseEndsAt = game.settings.phaseEndsAt;
      if (allSubmitted) {
        nextPhaseEndsAt = now() + 5000;
      }

      await tx.mutate.shade_signal_games.update({
        id: game.id,
        guesses: newGuesses,
        settings: { ...game.settings, phaseEndsAt: nextPhaseEndsAt },
        updated_at: now()
      });
    }
  ),

  advanceTimer: defineMutator(
    z.object({ gameId: z.string() }),
    async ({ args, tx }) => {
      const game = await tx.run(zql.shade_signal_games.where("id", args.gameId).one());
      if (!game) return;
      const phaseEnd = game.settings.phaseEndsAt;
      if (!phaseEnd || phaseEnd > now()) return;

      if (game.phase === "clue1") {
        // Leader didn't submit clue1 in time — skip to guess1 with no clue
        await tx.mutate.shade_signal_games.update({
          id: game.id,
          phase: "guess1",
          settings: { ...game.settings, phaseEndsAt: now() + game.settings.guessDurationSec * 1000 },
          updated_at: now()
        });
      } else if (game.phase === "guess1") {
        // Auto-advance to clue2
        await tx.mutate.shade_signal_games.update({
          id: game.id,
          phase: "clue2",
          settings: { ...game.settings, phaseEndsAt: now() + game.settings.clueDurationSec * 1000 },
          updated_at: now()
        });
      } else if (game.phase === "clue2") {
        // Leader didn't submit clue2 in time — skip to guess2
        await tx.mutate.shade_signal_games.update({
          id: game.id,
          phase: "guess2",
          settings: { ...game.settings, phaseEndsAt: now() + game.settings.guessDurationSec * 1000 },
          updated_at: now()
        });
      } else if (game.phase === "guess2") {
        // Auto-advance to reveal
        await tx.mutate.shade_signal_games.update({
          id: game.id,
          phase: "reveal",
          settings: { ...game.settings, phaseEndsAt: null },
          updated_at: now()
        });
      } else if (game.phase === "reveal") {
        // Auto-advance: start next round or finish
        const totalRounds = game.leader_order.length * game.settings.roundsPerPlayer;
        const nextRound = game.settings.currentRound + 1;

        if (nextRound > totalRounds) {
          await tx.mutate.shade_signal_games.update({
            id: game.id,
            phase: "finished",
            settings: { ...game.settings, phaseEndsAt: null },
            updated_at: now()
          });
          return;
        }

        const nextLeaderIndex = (game.current_leader_index + 1) % game.leader_order.length;
        const nextLeaderId = game.leader_order[nextLeaderIndex]!;
        const rows = game.grid_rows;
        const cols = game.grid_cols;
        const leaderPick = game.settings.leaderPick ?? false;

        await tx.mutate.shade_signal_games.update({
          id: game.id,
          phase: leaderPick ? "picking" : "clue1",
          leader_id: nextLeaderId,
          current_leader_index: nextLeaderIndex,
          grid_seed: Math.floor(Math.random() * 100000),
          target_row: leaderPick ? null : Math.floor(Math.random() * rows),
          target_col: leaderPick ? null : Math.floor(Math.random() * cols),
          clue1: null,
          clue2: null,
          guesses: [],
          settings: {
            ...game.settings,
            currentRound: nextRound,
            phaseEndsAt: leaderPick ? null : now() + game.settings.clueDurationSec * 1000
          },
          updated_at: now()
        });
      }
    }
  ),

  reveal: defineMutator(
    z.object({ gameId: z.string() }),
    async ({ args, tx }) => {
      const game = await tx.run(zql.shade_signal_games.where("id", args.gameId).one());
      if (!game) throw new Error("Game not found");
      if (game.phase !== "reveal") throw new Error("Not in reveal phase");

      const targetRow = game.target_row ?? 0;
      const targetCol = game.target_col ?? 0;

      // Score each guesser's best guess (use final guess if exists, else guess1)
      const guesserIds = game.players
        .filter((p) => p.sessionId !== game.leader_id)
        .map((p) => p.sessionId);

      const roundScores: Record<string, number> = {};
      let leaderScore = 0;
      let totalGuesserPts = 0;

      for (const gId of guesserIds) {
        // Use round 2 guess if available, else round 1
        const g2 = game.guesses.find((g) => g.sessionId === gId && g.round === 2);
        const g1 = game.guesses.find((g) => g.sessionId === gId && g.round === 1);
        const guess = g2 ?? g1;
        if (!guess) {
          roundScores[gId] = 0;
          continue;
        }
        // Chebyshev distance (max of row/col diff) — reflects visual grid proximity better
        const dist = Math.max(Math.abs(guess.row - targetRow), Math.abs(guess.col - targetCol));
        let pts = 0;
        if (dist === 0) pts = 5;
        else if (dist === 1) pts = 3;
        else if (dist === 2) pts = 2;
        else if (dist <= 3) pts = 1;
        roundScores[gId] = pts;
        totalGuesserPts += pts;
      }
      // Leader earns the average of all guesser scores (rounded)
      if (guesserIds.length > 0) {
        leaderScore = Math.round(totalGuesserPts / guesserIds.length);
      }

      // Update player total scores
      const players = game.players.map((p) => {
        const added = p.sessionId === game.leader_id ? leaderScore : (roundScores[p.sessionId] ?? 0);
        return { ...p, totalScore: p.totalScore + added };
      });

      // Save round history
      const roundEntry = {
        round: game.settings.currentRound,
        leaderId: game.leader_id!,
        target: { row: targetRow, col: targetCol },
        clue1: game.clue1,
        clue2: game.clue2,
        guesses: game.guesses,
        scores: roundScores,
        leaderScore
      };

      await tx.mutate.shade_signal_games.update({
        id: game.id,
        players,
        round_history: [...game.round_history, roundEntry],
        settings: { ...game.settings, phaseEndsAt: now() + 8000 },
        updated_at: now()
      });
    }
  ),

  nextRound: defineMutator(
    z.object({ gameId: z.string(), hostId: z.string() }),
    async ({ args, tx }) => {
      const game = await tx.run(zql.shade_signal_games.where("id", args.gameId).one());
      if (!game) throw new Error("Game not found");
      if (game.host_id !== args.hostId) throw new Error("Only host can advance");
      if (game.phase !== "reveal") throw new Error("Can only advance from reveal");

      const totalRounds = game.leader_order.length * game.settings.roundsPerPlayer;
      const nextRound = game.settings.currentRound + 1;

      if (nextRound > totalRounds) {
        // Game over
        await tx.mutate.shade_signal_games.update({
          id: game.id,
          phase: "finished",
          settings: { ...game.settings, phaseEndsAt: null },
          updated_at: now()
        });
        return;
      }

      // Rotate leader
      const nextLeaderIndex = (game.current_leader_index + 1) % game.leader_order.length;
      const nextLeaderId = game.leader_order[nextLeaderIndex]!;
      const rows = game.grid_rows;
      const cols = game.grid_cols;
      const leaderPick = game.settings.leaderPick ?? false;

      await tx.mutate.shade_signal_games.update({
        id: game.id,
        phase: leaderPick ? "picking" : "clue1",
        leader_id: nextLeaderId,
        current_leader_index: nextLeaderIndex,
        grid_seed: Math.floor(Math.random() * 100000),
        target_row: leaderPick ? null : Math.floor(Math.random() * rows),
        target_col: leaderPick ? null : Math.floor(Math.random() * cols),
        clue1: null,
        clue2: null,
        guesses: [],
        settings: {
          ...game.settings,
          currentRound: nextRound,
          phaseEndsAt: leaderPick ? null : now() + game.settings.clueDurationSec * 1000
        },
        updated_at: now()
      });
    }
  ),

  resetToLobby: defineMutator(
    z.object({ gameId: z.string(), hostId: z.string() }),
    async ({ args, tx }) => {
      const game = await tx.run(zql.shade_signal_games.where("id", args.gameId).one());
      if (!game) throw new Error("Game not found");
      if (game.host_id !== args.hostId) throw new Error("Only host can reset");

      const players = game.players.map((p) => ({ ...p, totalScore: 0 }));
      await tx.mutate.shade_signal_games.update({
        id: game.id,
        phase: "lobby",
        players,
        leader_id: null,
        leader_order: [],
        current_leader_index: 0,
        target_row: null,
        target_col: null,
        clue1: null,
        clue2: null,
        guesses: [],
        round_history: [],
        spectators: [],
        settings: {
          ...game.settings,
          currentRound: 1,
          phaseEndsAt: null
        },
        updated_at: now()
      });
    }
  ),

  endGame: defineMutator(
    z.object({ gameId: z.string(), hostId: z.string() }),
    async ({ args, tx }) => {
      const game = await tx.run(zql.shade_signal_games.where("id", args.gameId).one());
      if (!game) throw new Error("Game not found");
      if (game.host_id !== args.hostId) throw new Error("Only host can end game");

      await tx.mutate.shade_signal_games.update({
        id: game.id,
        phase: "ended",
        settings: { ...game.settings, phaseEndsAt: null },
        updated_at: now()
      });
      const gameSessions = await tx.run(
        zql.sessions.where("game_type", "shade_signal").where("game_id", game.id)
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
      const game = await tx.run(zql.shade_signal_games.where("id", args.gameId).one());
      if (!game) throw new Error("Game not found");
      if (game.phase === "ended" || game.phase === "finished") throw new Error("Game has ended");
      if (game.kicked.includes(args.sessionId)) throw new Error("You have been kicked from this game");
      if (game.players.some((p) => p.sessionId === args.sessionId)) throw new Error("Already in game as player");
      if (game.spectators.find((s) => s.sessionId === args.sessionId)) return;

      await tx.mutate.shade_signal_games.update({
        id: game.id,
        spectators: [...game.spectators, { sessionId: args.sessionId, name: session?.name ?? null }],
        updated_at: now()
      });
      await tx.mutate.sessions.upsert({
        id: args.sessionId,
        name: session?.name ?? null,
        game_type: "shade_signal",
        game_id: game.id,
        created_at: now(),
        last_seen: now()
      });
    }
  ),

  leaveSpectator: defineMutator(
    z.object({ gameId: z.string(), sessionId: z.string() }),
    async ({ args, tx }) => {
      const game = await tx.run(zql.shade_signal_games.where("id", args.gameId).one());
      if (!game) return;
      await tx.mutate.shade_signal_games.update({
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
      const game = await tx.run(zql.shade_signal_games.where("id", args.gameId).one());
      if (!game || game.host_id !== args.hostId) throw new Error("Only host can remove spectators");
      await tx.mutate.shade_signal_games.update({
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
  )
};
