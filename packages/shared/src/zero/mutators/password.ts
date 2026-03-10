import { defineMutator } from "@rocicorp/zero";
import { z } from "zod";
import { zql } from "../schema";
import { now, code, normalized, isClueTooSimilar, pickPasswordWord, buildTeamRound, buildAllTeamRounds } from "./helpers";

export const passwordMutators = {
  create: defineMutator(
    z.object({
      id: z.string(),
      hostId: z.string(),
      teamCount: z.number().min(2).max(6).optional(),
      targetScore: z.number().min(1).max(50).optional(),
      category: z.string().optional()
    }),
    async ({ args, tx }) => {
      const count = args.teamCount ?? 2;
      const teams = Array.from({ length: count }, (_, i) => ({
        name: `Team ${String.fromCharCode(65 + i)}`,
        members: i === 0 ? [args.hostId] : ([] as string[])
      }));
      const scoreInit: Record<string, number> = {};
      for (const t of teams) scoreInit[t.name] = 0;
      await tx.mutate.password_games.insert({
        id: args.id,
        code: code(),
        host_id: args.hostId,
        phase: "lobby",
        teams,
        rounds: [],
        scores: scoreInit,
        current_round: 0,
        active_rounds: [],
        kicked: [],
        spectators: [],
        announcement: null,
        settings: { targetScore: args.targetScore ?? 10, roundDurationSec: 120, roundEndsAt: null, category: args.category ?? "animals" },
        created_at: now(),
        updated_at: now()
      });

      const hostSession = await tx.run(zql.sessions.where("id", args.hostId).one());
      await tx.mutate.sessions.upsert({
        id: args.hostId,
        name: hostSession?.name ?? null,
        game_type: "password",
        game_id: args.id,
        created_at: now(),
        last_seen: now()
      });
    }
  ),

  join: defineMutator(
    z.object({ gameId: z.string(), sessionId: z.string() }),
    async ({ args, tx }) => {
      const session = await tx.run(zql.sessions.where("id", args.sessionId).one());
      const game = await tx.run(zql.password_games.where("id", args.gameId).one());
      if (!game) throw new Error("Game not found");
      if (game.phase === "ended") throw new Error("Game has ended");
      if (game.kicked.includes(args.sessionId)) throw new Error("You have been kicked from this game");
      // Only allow joining during lobby; mid-game visitors join as spectators
      if (game.phase !== "lobby") {
        const allMembers = new Set(game.teams.flatMap((t) => t.members));
        if (!allMembers.has(args.sessionId) && !game.spectators.find((s) => s.sessionId === args.sessionId)) {
          await tx.mutate.password_games.update({
            id: game.id,
            spectators: [...game.spectators, { sessionId: args.sessionId, name: session?.name ?? null }],
            updated_at: now()
          });
          await tx.mutate.sessions.upsert({
            id: args.sessionId,
            name: session?.name ?? null,
            game_type: "password",
            game_id: game.id,
            created_at: now(),
            last_seen: now()
          });
        }
        return;
      }

      const allMembers = new Set(game.teams.flatMap((team) => team.members));
      let teams = game.teams;
      if (!allMembers.has(args.sessionId)) {
        if (game.settings.teamsLocked) {
          throw new Error("Teams are locked — only the host can assign teams");
        }
        const sorted = [...game.teams].sort((a, b) => a.members.length - b.members.length);
        const teamName = sorted[0]?.name ?? "Team A";
        teams = game.teams.map((team) =>
          team.name === teamName ? { ...team, members: [...team.members, args.sessionId] } : team
        );
      }

      await tx.mutate.password_games.update({
        id: game.id,
        teams,
        updated_at: now()
      });

      await tx.mutate.sessions.upsert({
        id: args.sessionId,
        name: session?.name ?? null,
        game_type: "password",
        game_id: game.id,
        created_at: now(),
        last_seen: now()
      });
    }
  ),

  leave: defineMutator(
    z.object({ gameId: z.string(), sessionId: z.string() }),
    async ({ args, tx }) => {
      const game = await tx.run(zql.password_games.where("id", args.gameId).one());
      if (!game) return;

      // Host leaving ends the game for everyone
      if (game.host_id === args.sessionId) {
        await tx.mutate.password_games.update({
          id: game.id,
          phase: "ended",
          active_rounds: [],
          settings: { ...game.settings, roundEndsAt: null },
          updated_at: now()
        });
        const gameSessions = await tx.run(
          zql.sessions.where("game_type", "password").where("game_id", game.id)
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

      const teams = game.teams.map((team) => ({
        ...team,
        members: team.members.filter((member) => member !== args.sessionId)
      }));

      await tx.mutate.password_games.update({
        id: game.id,
        teams,
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
      const game = await tx.run(zql.password_games.where("id", args.gameId).one());
      if (!game) throw new Error("Game not found");
      if (game.host_id !== args.hostId) throw new Error("Only host can start");

      const teamsWithPlayers = game.teams.filter((team) => team.members.length > 0);
      if (teamsWithPlayers.length < 2) {
        throw new Error("Need at least two teams with players");
      }
      // Require min 2 members per populated team
      const underStaffed = teamsWithPlayers.find((t) => t.members.length < 2);
      if (underStaffed) {
        throw new Error(`${underStaffed.name} needs at least 2 players`);
      }

      const activeRounds = buildAllTeamRounds(game.teams, 1, undefined, game.settings.category);
      const roundEndsAt = now() + game.settings.roundDurationSec * 1000;

      const skipsRemaining: Record<string, number> = {};
      for (const team of game.teams) {
        if (team.members.length >= 2) skipsRemaining[team.name] = 3;
      }

      await tx.mutate.password_games.update({
        id: game.id,
        phase: "playing",
        current_round: 1,
        active_rounds: activeRounds,
        settings: { ...game.settings, roundEndsAt, skipsRemaining },
        updated_at: now()
      });
    }
  ),

  submitClue: defineMutator(
    z.object({ gameId: z.string(), sessionId: z.string(), clue: z.string().min(1).max(80) }),
    async ({ args, tx }) => {
      const game = await tx.run(zql.password_games.where("id", args.gameId).one());
      if (!game || game.phase !== "playing" || !game.active_rounds.length) {
        throw new Error("Game is not in active round");
      }
      const roundEndsAt = game.settings.roundEndsAt;
      if (roundEndsAt && now() > roundEndsAt) throw new Error("Round time expired");

      // Find which team this player is on
      const teamIdx = game.teams.findIndex((t) => t.members.includes(args.sessionId));
      if (teamIdx === -1) throw new Error("You are not on any team");
      const roundIdx = game.active_rounds.findIndex((r) => r.teamIndex === teamIdx);
      if (roundIdx === -1) throw new Error("Your team has no active round");
      const round = game.active_rounds[roundIdx]!;

      if (!round.word) throw new Error("Word hasn't been set yet");
      if (round.guesserId === args.sessionId) {
        throw new Error("The guesser cannot submit a clue");
      }
      if (isClueTooSimilar(args.clue, round.word)) {
        throw new Error("Clue is too similar to the word");
      }
      if (round.clues.some((c) => c.sessionId === args.sessionId)) {
        throw new Error("You already submitted a clue");
      }

      const nextClues = [...round.clues, { sessionId: args.sessionId, text: args.clue.trim() }];
      const nextRounds = game.active_rounds.map((r, i) =>
        i === roundIdx ? { ...r, clues: nextClues } : r
      );

      await tx.mutate.password_games.update({
        id: game.id,
        active_rounds: nextRounds,
        updated_at: now()
      });
    }
  ),

  submitGuess: defineMutator(
    z.object({ gameId: z.string(), sessionId: z.string(), guess: z.string().min(1).max(80) }),
    async ({ args, tx }) => {
      const game = await tx.run(zql.password_games.where("id", args.gameId).one());
      if (!game || game.phase !== "playing" || !game.active_rounds.length) {
        throw new Error("Round is not ready for guessing");
      }
      const roundEndsAt = game.settings.roundEndsAt;
      if (roundEndsAt && now() > roundEndsAt) throw new Error("Round time expired");

      // Find which team round this guesser belongs to
      const roundIdx = game.active_rounds.findIndex((r) => r.guesserId === args.sessionId);
      if (roundIdx === -1) throw new Error("Only guesser can submit guess");
      const round = game.active_rounds[roundIdx]!;
      if (!round.word) throw new Error("Word hasn't been set yet");

      const team = game.teams[round.teamIndex];
      const clueGiverCount = team ? team.members.filter((m) => m !== round.guesserId).length : 0;
      if (round.clues.length < clueGiverCount) {
        throw new Error("Waiting for all clues to be submitted");
      }

      const correct = normalized(args.guess) === normalized(round.word);

      if (!correct) {
        // Wrong → same team retries with new set of clues, timer keeps running
        const nextRounds = game.active_rounds.map((r, i) =>
          i === roundIdx ? { ...r, clues: [], guess: args.guess.trim() } : r
        );
        await tx.mutate.password_games.update({
          id: game.id,
          active_rounds: nextRounds,
          updated_at: now()
        });
        return;
      }

      // Correct → record round, +1 score, give team a fresh round entry
      const teamName = team?.name ?? `Team ${round.teamIndex + 1}`;
      const currentScore = game.scores[teamName] ?? 0;
      const nextScores = { ...game.scores, [teamName]: currentScore + 1 };

      const nextHistory = [
        ...game.rounds,
        {
          round: game.current_round,
          teamIndex: round.teamIndex,
          guesserId: round.guesserId,
          word: round.word,
          clues: round.clues,
          guess: args.guess.trim(),
          correct: true
        }
      ];

      const reachedTarget = (nextScores[teamName] ?? 0) >= game.settings.targetScore;
      if (reachedTarget) {
        await tx.mutate.password_games.update({
          id: game.id,
          phase: "results",
          rounds: nextHistory,
          scores: nextScores,
          active_rounds: [],
          settings: { ...game.settings, roundEndsAt: null },
          updated_at: now()
        });
        return;
      }

      // Rotate roles for this team and give them a fresh round with a new random word
      const nextRoundNum = game.current_round + 1;
      const usedWords = game.rounds.map((r) => r.word);
      const newWord = pickPasswordWord(usedWords, game.settings.category);
      const freshRound = team && team.members.length >= 2
        ? buildTeamRound(team, round.teamIndex, nextRoundNum, newWord)
        : null;

      const nextRounds = game.active_rounds.map((r, i) =>
        i === roundIdx ? (freshRound ?? r) : r
      );

      await tx.mutate.password_games.update({
        id: game.id,
        rounds: nextHistory,
        scores: nextScores,
        current_round: nextRoundNum,
        active_rounds: nextRounds,
        updated_at: now()
      });
    }
  ),

  skipWord: defineMutator(
    z.object({ gameId: z.string(), sessionId: z.string() }),
    async ({ args, tx }) => {
      const game = await tx.run(zql.password_games.where("id", args.gameId).one());
      if (!game || game.phase !== "playing" || !game.active_rounds.length) {
        throw new Error("Game is not in active round");
      }

      // Find which team round this player belongs to
      const teamIdx = game.teams.findIndex((t) => t.members.includes(args.sessionId));
      if (teamIdx === -1) throw new Error("You are not on any team");
      const roundIdx = game.active_rounds.findIndex((r) => r.teamIndex === teamIdx);
      if (roundIdx === -1) throw new Error("Your team has no active round");

      const team = game.teams[teamIdx];
      const teamName = team?.name ?? `Team ${teamIdx + 1}`;
      const skips = game.settings.skipsRemaining ?? {};
      const remaining = skips[teamName] ?? 0;
      if (remaining <= 0) throw new Error("No skips remaining");

      // Pick a new word, avoiding previously used ones
      const usedWords = game.rounds.map((r) => r.word);
      const newWord = pickPasswordWord(usedWords, game.settings.category);

      const nextRounds = game.active_rounds.map((r, i) =>
        i === roundIdx ? { ...r, word: newWord, clues: [], guess: null } : r
      );
      const nextSkips = { ...skips, [teamName]: remaining - 1 };

      await tx.mutate.password_games.update({
        id: game.id,
        active_rounds: nextRounds,
        settings: { ...game.settings, skipsRemaining: nextSkips },
        updated_at: now()
      });
    }
  ),

  advanceTimer: defineMutator(
    z.object({ gameId: z.string() }),
    async ({ args, tx }) => {
      const game = await tx.run(zql.password_games.where("id", args.gameId).one());
      if (!game || game.phase !== "playing" || !game.active_rounds.length) return;
      const roundEndsAt = game.settings.roundEndsAt;
      if (!roundEndsAt || now() < roundEndsAt) return; // not expired

      // Timer expired — game over, highest score wins
      // Record all in-progress rounds as incomplete
      const nextHistory = [...game.rounds];
      for (const round of game.active_rounds) {
        nextHistory.push({
          round: game.current_round,
          teamIndex: round.teamIndex,
          guesserId: round.guesserId,
          word: round.word ?? "(no word)",
          clues: round.clues,
          guess: null as string | null,
          correct: false
        });
      }

      await tx.mutate.password_games.update({
        id: game.id,
        phase: "results",
        rounds: nextHistory,
        active_rounds: [],
        settings: { ...game.settings, roundEndsAt: null },
        updated_at: now()
      });
    }
  ),

  switchTeam: defineMutator(
    z.object({ gameId: z.string(), sessionId: z.string(), teamName: z.string() }),
    async ({ args, tx }) => {
      const game = await tx.run(zql.password_games.where("id", args.gameId).one());
      if (!game) throw new Error("Game not found");
      if (game.phase !== "lobby") throw new Error("Can only switch teams in lobby");
      if (game.settings.teamsLocked) throw new Error("Teams are locked");

      const targetTeam = game.teams.find((team) => team.name === args.teamName);
      if (!targetTeam) throw new Error("Team not found");

      const teams = game.teams.map((team) => ({
        ...team,
        members:
          team.name === args.teamName
            ? team.members.includes(args.sessionId) ? team.members : [...team.members, args.sessionId]
            : team.members.filter((m) => m !== args.sessionId)
      }));

      await tx.mutate.password_games.update({ id: game.id, teams, updated_at: now() });
    }
  ),

  movePlayer: defineMutator(
    z.object({ gameId: z.string(), hostId: z.string(), playerId: z.string(), teamName: z.string() }),
    async ({ args, tx }) => {
      const game = await tx.run(zql.password_games.where("id", args.gameId).one());
      if (!game) throw new Error("Game not found");
      if (game.host_id !== args.hostId) throw new Error("Only host can move players");
      if (game.phase !== "lobby") throw new Error("Can only move players in lobby");

      const targetTeam = game.teams.find((team) => team.name === args.teamName);
      if (!targetTeam) throw new Error("Team not found");

      const teams = game.teams.map((team) => ({
        ...team,
        members:
          team.name === args.teamName
            ? team.members.includes(args.playerId) ? team.members : [...team.members, args.playerId]
            : team.members.filter((m) => m !== args.playerId)
      }));

      await tx.mutate.password_games.update({ id: game.id, teams, updated_at: now() });
    }
  ),

  lockTeams: defineMutator(
    z.object({ gameId: z.string(), hostId: z.string(), locked: z.boolean() }),
    async ({ args, tx }) => {
      const game = await tx.run(zql.password_games.where("id", args.gameId).one());
      if (!game) throw new Error("Game not found");
      if (game.host_id !== args.hostId) throw new Error("Only host can lock teams");

      await tx.mutate.password_games.update({
        id: game.id,
        settings: { ...game.settings, teamsLocked: args.locked },
        updated_at: now()
      });
    }
  ),

  resetToLobby: defineMutator(
    z.object({ gameId: z.string(), hostId: z.string() }),
    async ({ args, tx }) => {
      const game = await tx.run(zql.password_games.where("id", args.gameId).one());
      if (!game || game.host_id !== args.hostId) throw new Error("Not allowed");

      // Reset scores for ALL actual teams
      const scores: Record<string, number> = {};
      for (const t of game.teams) scores[t.name] = 0;

      await tx.mutate.password_games.update({
        id: game.id,
        phase: "lobby",
        rounds: [],
        scores,
        current_round: 0,
        active_rounds: [],
        announcement: null,
        spectators: [],
        settings: { ...game.settings, roundEndsAt: null },
        updated_at: now()
      });

      // Clear chat messages
      const msgs = await tx.run(
        zql.chat_messages.where("game_type", "password").where("game_id", args.gameId)
      );
      for (const m of msgs) {
        await tx.mutate.chat_messages.delete({ id: m.id });
      }
    }
  ),

  announce: defineMutator(
    z.object({ gameId: z.string(), hostId: z.string(), text: z.string().min(1).max(120) }),
    async ({ args, tx }) => {
      const game = await tx.run(zql.password_games.where("id", args.gameId).one());
      if (!game || game.host_id !== args.hostId) throw new Error("Only host can announce");
      await tx.mutate.password_games.update({
        id: game.id,
        announcement: { text: args.text.trim(), ts: now() },
        updated_at: now()
      });
    }
  ),

  kick: defineMutator(
    z.object({ gameId: z.string(), hostId: z.string(), targetId: z.string() }),
    async ({ args, tx }) => {
      const game = await tx.run(zql.password_games.where("id", args.gameId).one());
      if (!game || game.host_id !== args.hostId) throw new Error("Only host can kick");
      if (args.targetId === args.hostId) throw new Error("Cannot kick yourself");

      const teams = game.teams.map((t) => ({
        ...t,
        members: t.members.filter((m) => m !== args.targetId)
      }));
      const kicked = [...game.kicked, args.targetId];

      await tx.mutate.password_games.update({ id: game.id, teams, kicked, updated_at: now() });

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
      const game = await tx.run(zql.password_games.where("id", args.gameId).one());
      if (!game || game.host_id !== args.hostId) throw new Error("Only host can end game");

      await tx.mutate.password_games.update({
        id: game.id,
        phase: "ended",
        active_rounds: [],
        settings: { ...game.settings, roundEndsAt: null },
        updated_at: now()
      });

      const gameSessions = await tx.run(
        zql.sessions.where("game_type", "password").where("game_id", game.id)
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
        zql.chat_messages.where("game_type", "password").where("game_id", game.id)
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
      const game = await tx.run(zql.password_games.where("id", args.gameId).one());
      if (!game) throw new Error("Game not found");
      if (game.phase === "ended") throw new Error("Game has ended");
      if (game.kicked.includes(args.sessionId)) throw new Error("You have been kicked from this game");
      const allMembers = new Set(game.teams.flatMap((t) => t.members));
      if (allMembers.has(args.sessionId)) throw new Error("Already in game as player");
      if (game.spectators.find((s) => s.sessionId === args.sessionId)) return;

      await tx.mutate.password_games.update({
        id: game.id,
        spectators: [...game.spectators, { sessionId: args.sessionId, name: session?.name ?? null }],
        updated_at: now()
      });
      await tx.mutate.sessions.upsert({
        id: args.sessionId,
        name: session?.name ?? null,
        game_type: "password",
        game_id: game.id,
        created_at: now(),
        last_seen: now()
      });
    }
  ),

  leaveSpectator: defineMutator(
    z.object({ gameId: z.string(), sessionId: z.string() }),
    async ({ args, tx }) => {
      const game = await tx.run(zql.password_games.where("id", args.gameId).one());
      if (!game) return;
      await tx.mutate.password_games.update({
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
      const game = await tx.run(zql.password_games.where("id", args.gameId).one());
      if (!game || game.host_id !== args.hostId) throw new Error("Only host can remove spectators");
      await tx.mutate.password_games.update({
        id: game.id,
        spectators: game.spectators.filter((s) => s.sessionId !== args.targetId),
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
