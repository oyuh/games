import { defineMutator } from "@rocicorp/zero";
import { z } from "zod";
import { zql } from "../schema";
import { now, code } from "./helpers";

export const demoMutators = {
  seedImposter: defineMutator(
    z.object({
      id: z.string(),
      hostId: z.string(),
      phase: z.enum(["lobby", "playing", "voting", "results"]),
      players: z.array(
        z.object({
          sessionId: z.string(),
          name: z.string().nullable(),
          connected: z.boolean(),
          role: z.enum(["imposter", "player"]).optional()
        })
      ),
      clues: z.array(z.object({ sessionId: z.string(), text: z.string(), createdAt: z.number() })),
      votes: z.array(z.object({ voterId: z.string(), targetId: z.string() })),
      secretWord: z.string().nullable(),
      currentRound: z.number(),
      phaseEndsAt: z.number().nullable()
    }),
    async ({ args, tx }) => {
      const ts = now();
      const players = args.players.map((p) =>
        p.role != null
          ? { ...p, role: p.role }
          : { sessionId: p.sessionId, name: p.name, connected: p.connected }
      );
      await tx.mutate.imposter_games.insert({
        id: args.id,
        code: code(),
        host_id: args.hostId,
        phase: args.phase,
        category: "animals",
        secret_word: args.secretWord,
        players,
        clues: args.clues,
        votes: args.votes,
        kicked: [],
        spectators: [],
        round_history: [],
        announcement: null,
        settings: {
          rounds: 3,
          imposters: 1,
          currentRound: args.currentRound,
          roundDurationSec: 75,
          votingDurationSec: 45,
          phaseEndsAt: args.phaseEndsAt
        },
        created_at: ts,
        updated_at: ts
      });
    }
  ),
  seedPassword: defineMutator(
    z.object({
      id: z.string(),
      hostId: z.string(),
      phase: z.enum(["lobby", "playing", "results"]),
      teams: z.array(z.object({ name: z.string(), members: z.array(z.string()) })),
      scores: z.record(z.string(), z.number()),
      rounds: z.array(
        z.object({
          round: z.number(),
          teamIndex: z.number(),
          guesserId: z.string(),
          word: z.string(),
          clues: z.array(z.object({ sessionId: z.string(), text: z.string() })),
          guess: z.string().nullable(),
          correct: z.boolean()
        })
      ),
      currentRound: z.number(),
      activeRounds: z.array(
        z.object({
          teamIndex: z.number(),
          guesserId: z.string(),
          word: z.string().nullable(),
          clues: z.array(z.object({ sessionId: z.string(), text: z.string() })),
          guess: z.string().nullable()
        })
      ),
      targetScore: z.number(),
      roundEndsAt: z.number().nullable()
    }),
    async ({ args, tx }) => {
      const ts = now();
      await tx.mutate.password_games.insert({
        id: args.id,
        code: code(),
        host_id: args.hostId,
        phase: args.phase,
        teams: args.teams,
        scores: args.scores,
        rounds: args.rounds,
        current_round: args.currentRound,
        active_rounds: args.activeRounds,
        kicked: [],
        spectators: [],
        announcement: null,
        settings: {
          targetScore: args.targetScore,
          roundDurationSec: 45,
          roundEndsAt: args.roundEndsAt,
          teamsLocked: false
        },
        created_at: ts,
        updated_at: ts
      });
    }
  ),
  seedChainReaction: defineMutator(
    z.object({
      id: z.string(),
      hostId: z.string(),
      phase: z.enum(["lobby", "submitting", "playing", "finished"]),
      players: z.array(z.object({ sessionId: z.string(), name: z.string().nullable(), connected: z.boolean() })),
      chain: z.record(z.string(), z.array(z.object({ word: z.string(), revealed: z.boolean(), lettersShown: z.number(), solvedBy: z.string().nullable() }))),
      submittedChains: z.record(z.string(), z.array(z.string())),
      scores: z.record(z.string(), z.number()),
      roundHistory: z.array(z.object({
        round: z.number(),
        chains: z.record(z.string(), z.array(z.object({ word: z.string(), solvedBy: z.string().nullable(), lettersShown: z.number() }))),
        scores: z.record(z.string(), z.number())
      })),
      settings: z.object({
        chainLength: z.number(),
        rounds: z.number(),
        currentRound: z.number(),
        turnTimeSec: z.number().nullable(),
        phaseEndsAt: z.number().nullable(),
        chainMode: z.enum(["premade", "custom"])
      })
    }),
    async ({ args, tx }) => {
      const ts = now();
      await tx.mutate.chain_reaction_games.insert({
        id: args.id,
        code: code(),
        host_id: args.hostId,
        phase: args.phase,
        players: args.players,
        chain: args.chain,
        submitted_chains: args.submittedChains,
        scores: args.scores,
        round_history: args.roundHistory,
        kicked: [],
        spectators: [],
        announcement: null,
        settings: args.settings,
        created_at: ts,
        updated_at: ts
      });
    }
  ),
  seedShadeSignal: defineMutator(
    z.object({
      id: z.string(),
      hostId: z.string(),
      phase: z.enum(["lobby", "clue1", "guess1", "clue2", "guess2", "reveal", "finished"]),
      players: z.array(z.object({ sessionId: z.string(), name: z.string().nullable(), connected: z.boolean(), totalScore: z.number() })),
      leaderId: z.string().nullable(),
      leaderOrder: z.array(z.string()),
      gridSeed: z.number(),
      targetRow: z.number().nullable(),
      targetCol: z.number().nullable(),
      clue1: z.string().nullable(),
      clue2: z.string().nullable(),
      guesses: z.array(z.object({ sessionId: z.string(), round: z.union([z.literal(1), z.literal(2)]), row: z.number(), col: z.number() })),
      currentRound: z.number(),
      phaseEndsAt: z.number().nullable()
    }),
    async ({ args, tx }) => {
      const ts = now();
      await tx.mutate.shade_signal_games.insert({
        id: args.id,
        code: code(),
        host_id: args.hostId,
        phase: args.phase,
        players: args.players,
        leader_id: args.leaderId,
        leader_order: args.leaderOrder,
        current_leader_index: 0,
        grid_seed: args.gridSeed,
        grid_rows: 10,
        grid_cols: 12,
        target_row: args.targetRow,
        target_col: args.targetCol,
        clue1: args.clue1,
        clue2: args.clue2,
        guesses: args.guesses,
        round_history: [],
        kicked: [],
        spectators: [],
        announcement: null,
        settings: {
          hardMode: false,
          clueDurationSec: 45,
          guessDurationSec: 30,
          roundsPerPlayer: 1,
          currentRound: args.currentRound,
          phaseEndsAt: args.phaseEndsAt
        },
        created_at: ts,
        updated_at: ts
      });
    }
  )
};
