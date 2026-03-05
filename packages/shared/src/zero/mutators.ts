import { defineMutator, defineMutators } from "@rocicorp/zero";
import { nanoid } from "nanoid";
import { z } from "zod";
import { zql } from "./schema";

const now = () => Date.now();
const code = () => nanoid(6).toUpperCase();
const PRESENCE_TIMEOUT_MS = 30_000;

const imposterWordBank: Record<string, string[]> = {
  general: ["Planet", "Castle", "Coffee", "Guitar", "Rocket", "Jungle", "Bridge", "Ocean"],
  animals: ["Tiger", "Dolphin", "Panda", "Falcon", "Otter", "Giraffe", "Koala", "Penguin"],
  food: ["Pizza", "Burger", "Pasta", "Sushi", "Taco", "Ramen", "Donut", "Salad"]
};

function pickRandom<T>(values: T[]): T {
  return values[Math.floor(Math.random() * values.length)]!;
}

function normalized(input: string) {
  return input.trim().toLowerCase();
}

function isOneWord(input: string) {
  return input.trim().split(/\s+/).filter(Boolean).length === 1;
}

function chooseRoles(players: Array<{ sessionId: string; name: string | null; connected: boolean; role?: "imposter" | "player" }>, imposterCount: number) {
  const shuffled = [...players].sort(() => Math.random() - 0.5);
  const imposterIds = new Set(shuffled.slice(0, Math.max(1, Math.min(imposterCount, Math.max(1, players.length - 1)))).map((p) => p.sessionId));
  return players.map((player) => ({
    ...player,
    role: imposterIds.has(player.sessionId) ? ("imposter" as const) : ("player" as const)
  }));
}

function getConnectedSet(sessions: Array<{ id: string; last_seen: number }>) {
  const cutoff = now() - PRESENCE_TIMEOUT_MS;
  return new Set(sessions.filter((session) => session.last_seen >= cutoff).map((session) => session.id));
}

function nextPasswordRoundState(game: {
  teams: Array<{ name: string; members: string[] }>;
  current_round: number;
  settings: { targetScore: number; turnTeamIndex: number; roundDurationSec: number };
}) {
  if (!game.teams.length) {
    throw new Error("No teams are available");
  }

  const teamIndex = game.settings.turnTeamIndex % game.teams.length;
  const team = game.teams[teamIndex]!;
  if (!team.members.length) {
    throw new Error("Active team has no members");
  }

  const clueGiverId = team.members[(game.current_round - 1) % team.members.length]!;
  const guesserId = team.members.length > 1 ? team.members[game.current_round % team.members.length]! : clueGiverId;

  const startedAt = now();
  return {
    teamIndex,
    clueGiverId,
    guesserId,
    word: null,
    clue: null,
    startedAt,
    endsAt: startedAt + game.settings.roundDurationSec * 1000
  };
}

export const mutators = defineMutators({
  sessions: {
    upsert: defineMutator(
      z.object({ id: z.string(), name: z.string().nullable().optional() }),
      async ({ args, tx }) => {
        await tx.mutate.sessions.upsert({
          id: args.id,
          name: args.name ?? null,
          created_at: now(),
          last_seen: now()
        });
      }
    ),
    setName: defineMutator(
      z.object({ id: z.string(), name: z.string().min(1).max(30) }),
      async ({ args, tx }) => {
        await tx.mutate.sessions.update({
          id: args.id,
          name: args.name,
          last_seen: now()
        });
      }
    ),
    attachGame: defineMutator(
      z.object({
        id: z.string(),
        gameType: z.enum(["imposter", "password"]),
        gameId: z.string()
      }),
      async ({ args, tx }) => {
        await tx.mutate.sessions.update({
          id: args.id,
          game_type: args.gameType,
          game_id: args.gameId,
          last_seen: now()
        });
      }
    ),
    touchPresence: defineMutator(
      z.object({ id: z.string() }),
      async ({ args, tx }) => {
        await tx.mutate.sessions.update({
          id: args.id,
          last_seen: now()
        });
      }
    )
  },
  imposter: {
    create: defineMutator(
      z.object({ id: z.string(), hostId: z.string(), category: z.string().optional() }),
      async ({ args, tx }) => {
        const ts = now();
        await tx.mutate.imposter_games.insert({
          id: args.id,
          code: code(),
          host_id: args.hostId,
          phase: "lobby",
          category: args.category ?? "general",
          secret_word: null,
          players: [],
          clues: [],
          votes: [],
          settings: {
            rounds: 3,
            imposters: 1,
            currentRound: 1,
            roundDurationSec: 75,
            votingDurationSec: 45,
            phaseEndsAt: null
          },
          created_at: ts,
          updated_at: ts
        });
        await tx.mutate.sessions.update({
          id: args.hostId,
          game_type: "imposter",
          game_id: args.id,
          last_seen: ts
        });
      }
    ),
    join: defineMutator(
      z.object({ gameId: z.string(), sessionId: z.string() }),
      async ({ args, tx }) => {
        const session = await tx.run(zql.sessions.where("id", args.sessionId).one());
        const game = await tx.run(zql.imposter_games.where("id", args.gameId).one());
        if (!session || !game) {
          throw new Error("Session or game not found");
        }

        const existing = game.players.find((player) => player.sessionId === args.sessionId);
        const players = existing
          ? game.players.map((player) =>
              player.sessionId === args.sessionId
                ? { ...player, connected: true, name: session.name }
                : player
            )
          : [...game.players, { sessionId: args.sessionId, name: session.name, connected: true }];

        await tx.mutate.imposter_games.update({
          id: game.id,
          players,
          updated_at: now()
        });

        await tx.mutate.sessions.update({
          id: args.sessionId,
          game_type: "imposter",
          game_id: game.id,
          last_seen: now()
        });
      }
    ),
    leave: defineMutator(
      z.object({ gameId: z.string(), sessionId: z.string() }),
      async ({ args, tx }) => {
        const game = await tx.run(zql.imposter_games.where("id", args.gameId).one());
        if (!game) {
          return;
        }

        const players = game.players.filter((player) => player.sessionId !== args.sessionId);
        const gameSessions = await tx.run(zql.sessions.where("game_type", "imposter").where("game_id", game.id));
        const connectedSet = getConnectedSet(gameSessions);
        let nextHostId = game.host_id;

        if (game.host_id === args.sessionId) {
          nextHostId = players.find((player) => connectedSet.has(player.sessionId))?.sessionId
            ?? players[0]?.sessionId
            ?? game.host_id;
        }

        await tx.mutate.imposter_games.update({
          id: game.id,
          host_id: nextHostId,
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
    start: defineMutator(
      z.object({ gameId: z.string(), hostId: z.string() }),
      async ({ args, tx }) => {
        const game = await tx.run(zql.imposter_games.where("id", args.gameId).one());
        if (!game) {
          throw new Error("Game not found");
        }
        if (game.host_id !== args.hostId) {
          throw new Error("Only host can start");
        }

        const players = game.players;
        if (players.length < 3) {
          throw new Error("Need at least 3 players");
        }

        const bank = imposterWordBank[game.category ?? "general"] ?? imposterWordBank.general ?? ["Planet"];
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
        if (game.settings.phaseEndsAt && now() > game.settings.phaseEndsAt) {
          throw new Error("Clue phase expired");
        }

        const player = game.players.find((item) => item.sessionId === args.sessionId);
        if (!player) {
          throw new Error("Player is not in game");
        }

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
        if (game.settings.phaseEndsAt && now() > game.settings.phaseEndsAt) {
          throw new Error("Voting phase expired");
        }

        const voterExists = game.players.some((player) => player.sessionId === args.voterId);
        const targetExists = game.players.some((player) => player.sessionId === args.targetId);
        if (!voterExists || !targetExists) {
          throw new Error("Invalid vote participants");
        }
        if (args.voterId === args.targetId) {
          throw new Error("Cannot vote for yourself");
        }

        const withoutCurrent = game.votes.filter((vote) => vote.voterId !== args.voterId);
        const nextVotes = [...withoutCurrent, { voterId: args.voterId, targetId: args.targetId }];
        const allVoted = nextVotes.length >= game.players.length;

        await tx.mutate.imposter_games.update({
          id: game.id,
          votes: nextVotes,
          phase: allVoted ? "results" : game.phase,
          settings: allVoted ? { ...game.settings, phaseEndsAt: null } : game.settings,
          updated_at: now()
        });
      }
    ),
    nextRound: defineMutator(
      z.object({ gameId: z.string(), hostId: z.string() }),
      async ({ args, tx }) => {
        const game = await tx.run(zql.imposter_games.where("id", args.gameId).one());
        if (!game || game.host_id !== args.hostId) {
          throw new Error("Not allowed");
        }

        const nextRound = game.settings.currentRound + 1;
        const done = nextRound > game.settings.rounds;

        if (done) {
          await tx.mutate.imposter_games.update({
            id: game.id,
            phase: "lobby",
            clues: [],
            votes: [],
            secret_word: null,
            players: game.players.map((player) => {
              const { role: _role, ...rest } = player;
              return rest;
            }),
            settings: { ...game.settings, currentRound: 1, phaseEndsAt: null },
            updated_at: now()
          });
          return;
        }

        const bank = imposterWordBank[game.category ?? "general"] ?? imposterWordBank.general ?? ["Planet"];
        const players = chooseRoles(game.players, game.settings.imposters);
        const phaseEndsAt = now() + game.settings.roundDurationSec * 1000;

        await tx.mutate.imposter_games.update({
          id: game.id,
          phase: "playing",
          secret_word: pickRandom(bank),
          clues: [],
          votes: [],
          players,
          settings: { ...game.settings, currentRound: nextRound, phaseEndsAt },
          updated_at: now()
        });
      }
    )
  },
  password: {
    create: defineMutator(
      z.object({ id: z.string(), hostId: z.string() }),
      async ({ args, tx }) => {
        await tx.mutate.password_games.insert({
          id: args.id,
          code: code(),
          host_id: args.hostId,
          phase: "lobby",
          teams: [{ name: "Team A", members: [] }, { name: "Team B", members: [] }],
          rounds: [],
          scores: { "Team A": 0, "Team B": 0 },
          current_round: 0,
          active_round: null,
          settings: { targetScore: 10, turnTeamIndex: 0, roundDurationSec: 75 },
          created_at: now(),
          updated_at: now()
        });

        await tx.mutate.sessions.update({
          id: args.hostId,
          game_type: "password",
          game_id: args.id,
          last_seen: now()
        });
      }
    ),
    join: defineMutator(
      z.object({ gameId: z.string(), sessionId: z.string() }),
      async ({ args, tx }) => {
        const game = await tx.run(zql.password_games.where("id", args.gameId).one());
        if (!game) {
          throw new Error("Game not found");
        }

        const allMembers = new Set(game.teams.flatMap((team) => team.members));
        let teams = game.teams;
        if (!allMembers.has(args.sessionId)) {
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

        await tx.mutate.sessions.update({
          id: args.sessionId,
          game_type: "password",
          game_id: game.id,
          last_seen: now()
        });
      }
    ),
    leave: defineMutator(
      z.object({ gameId: z.string(), sessionId: z.string() }),
      async ({ args, tx }) => {
        const game = await tx.run(zql.password_games.where("id", args.gameId).one());
        if (!game) {
          return;
        }

        const teams = game.teams.map((team) => ({
          ...team,
          members: team.members.filter((member) => member !== args.sessionId)
        }));

        const remainingMembers = teams.flatMap((team) => team.members);
        const gameSessions = await tx.run(zql.sessions.where("game_type", "password").where("game_id", game.id));
        const connectedSet = getConnectedSet(gameSessions);
        let nextHostId = game.host_id;

        if (game.host_id === args.sessionId) {
          nextHostId = remainingMembers.find((member) => connectedSet.has(member))
            ?? remainingMembers[0]
            ?? game.host_id;
        }

        await tx.mutate.password_games.update({
          id: game.id,
          host_id: nextHostId,
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
        if (!game) {
          throw new Error("Game not found");
        }
        if (game.host_id !== args.hostId) {
          throw new Error("Only host can start");
        }

        const teamsWithPlayers = game.teams.filter((team) => team.members.length > 0);
        if (teamsWithPlayers.length < 2) {
          throw new Error("Need at least two teams with players");
        }

        const nextGame = {
          ...game,
          current_round: 1,
          settings: { ...game.settings, turnTeamIndex: 0 }
        };

        await tx.mutate.password_games.update({
          id: game.id,
          phase: "playing",
          current_round: 1,
          active_round: nextPasswordRoundState(nextGame),
          updated_at: now()
        });
      }
    ),
    submitClue: defineMutator(
      z.object({ gameId: z.string(), sessionId: z.string(), word: z.string().min(1).max(40), clue: z.string().min(1).max(80) }),
      async ({ args, tx }) => {
        const game = await tx.run(zql.password_games.where("id", args.gameId).one());
        if (!game || game.phase !== "playing" || !game.active_round) {
          throw new Error("Game is not in active round");
        }
        if (game.active_round.clueGiverId !== args.sessionId) {
          throw new Error("Only clue giver can submit clue");
        }
        if (now() > game.active_round.endsAt) {
          throw new Error("Round time expired");
        }
        if (!isOneWord(args.clue)) {
          throw new Error("Clue must be one word");
        }

        await tx.mutate.password_games.update({
          id: game.id,
          active_round: {
            ...game.active_round,
            word: args.word.trim(),
            clue: args.clue.trim()
          },
          updated_at: now()
        });
      }
    ),
    submitGuess: defineMutator(
      z.object({ gameId: z.string(), sessionId: z.string(), guess: z.string().min(1).max(40) }),
      async ({ args, tx }) => {
        const game = await tx.run(zql.password_games.where("id", args.gameId).one());
        if (!game || game.phase !== "playing" || !game.active_round || !game.active_round.word || !game.active_round.clue) {
          throw new Error("Round is not ready for guessing");
        }
        if (game.active_round.guesserId !== args.sessionId) {
          throw new Error("Only guesser can submit guess");
        }
        if (now() > game.active_round.endsAt) {
          throw new Error("Round time expired");
        }

        const correct = normalized(args.guess) === normalized(game.active_round.word);
        const teamName = game.teams[game.active_round.teamIndex]?.name ?? `Team ${game.active_round.teamIndex + 1}`;
        const currentScore = game.scores[teamName] ?? 0;
        const nextScores = { ...game.scores, [teamName]: correct ? currentScore + 1 : currentScore };

        const nextRounds = [
          ...game.rounds,
          {
            round: game.current_round,
            teamIndex: game.active_round.teamIndex,
            clueGiverId: game.active_round.clueGiverId,
            guesserId: game.active_round.guesserId,
            word: game.active_round.word,
            clue: game.active_round.clue,
            guess: args.guess.trim(),
            correct
          }
        ];

        const reachedTarget = (nextScores[teamName] ?? 0) >= game.settings.targetScore;
        if (reachedTarget) {
          await tx.mutate.password_games.update({
            id: game.id,
            phase: "results",
            rounds: nextRounds,
            scores: nextScores,
            active_round: null,
            updated_at: now()
          });
          return;
        }

        const nextRoundNum = game.current_round + 1;
        const turnTeamIndex = (game.settings.turnTeamIndex + 1) % Math.max(1, game.teams.length);
        const basis = {
          ...game,
          current_round: nextRoundNum,
          settings: { ...game.settings, turnTeamIndex }
        };

        await tx.mutate.password_games.update({
          id: game.id,
          rounds: nextRounds,
          scores: nextScores,
          current_round: nextRoundNum,
          active_round: nextPasswordRoundState(basis),
          settings: { ...game.settings, turnTeamIndex },
          updated_at: now()
        });
      }
    ),
    resetToLobby: defineMutator(
      z.object({ gameId: z.string(), hostId: z.string() }),
      async ({ args, tx }) => {
        const game = await tx.run(zql.password_games.where("id", args.gameId).one());
        if (!game || game.host_id !== args.hostId) {
          throw new Error("Not allowed");
        }

        await tx.mutate.password_games.update({
          id: game.id,
          phase: "lobby",
          rounds: [],
          scores: { "Team A": 0, "Team B": 0 },
          current_round: 0,
          active_round: null,
          settings: { ...game.settings, turnTeamIndex: 0 },
          updated_at: now()
        });
      }
    )
  }
});
