import { defineMutator, defineMutators } from "@rocicorp/zero";
import { nanoid } from "nanoid";
import { z } from "zod";
import { zql } from "./schema";

const now = () => Date.now();
const code = () => nanoid(6).toUpperCase();
const PRESENCE_TIMEOUT_MS = 30_000;

const imposterWordBank: Record<string, string[]> = {
  animals: ["Dog", "Cat", "Elephant", "Lion", "Tiger", "Bear", "Giraffe", "Zebra", "Kangaroo", "Penguin", "Horse", "Wolf", "Fox", "Panda", "Rabbit", "Koala", "Cheetah", "Dolphin", "Monkey", "Owl"],
  moviesAndShows: ["Breaking Bad", "Stranger Things", "The Office", "Game of Thrones", "Friends", "The Mandalorian", "The Witcher", "Better Call Saul", "Avatar", "Top Gun", "John Wick", "Oppenheimer", "Dune", "Interstellar", "Spider-Man", "Avengers", "The Batman", "Barbie", "The Boys", "Squid Game"],
  disneyAndPixar: ["Frozen", "Toy Story", "Moana", "The Lion King", "Encanto", "Finding Nemo", "Coco", "Ratatouille", "Up", "Zootopia", "Inside Out", "Brave", "Cars", "Monsters Inc", "Turning Red", "Aladdin", "Beauty and the Beast", "Mulan", "Big Hero 6", "WALL-E"],
  fpsGames: ["Call of Duty", "Valorant", "Overwatch", "Counter-Strike", "Rainbow Six Siege", "Battlefield", "Apex Legends", "Destiny 2", "Halo", "PUBG", "Escape from Tarkov", "Fortnite", "Team Fortress 2", "DOOM", "Warframe"],
  otherGames: ["Minecraft", "Roblox", "League of Legends", "Among Us", "Genshin Impact", "Elden Ring", "Baldur's Gate 3", "The Sims", "Animal Crossing", "Grand Theft Auto V", "Red Dead Redemption 2", "Fall Guys", "Rocket League", "Sea of Thieves", "Cyberpunk 2077"],
  food: ["Pizza", "Burger", "Pasta", "Sushi", "Taco", "Steak", "Chicken Wings", "Salad", "Fried Rice", "Ramen", "Lasagna", "Burrito", "Sandwich", "Pancakes", "Hot Dog", "Cheesecake", "Nachos", "Dumplings", "Curry", "French Fries"],
  drinks: ["Coca-Cola", "Pepsi", "Coffee", "Tea", "Lemonade", "Milkshake", "Smoothie", "Orange Juice", "Sprite", "Dr Pepper", "Mountain Dew", "Iced Coffee", "Energy Drink", "Red Bull", "Gatorade", "Hot Chocolate", "Latte", "Root Beer", "Apple Juice", "Mojito"],
  restaurants: ["McDonald's", "Starbucks", "Chick-fil-A", "Taco Bell", "Subway", "KFC", "Pizza Hut", "Wendy's", "Burger King", "Domino's", "Chipotle", "Panda Express", "Panera Bread", "Five Guys", "Dunkin'", "Olive Garden", "Buffalo Wild Wings", "Sonic", "Arby's", "Popeyes"],
  carBrands: ["Toyota", "Ford", "Chevrolet", "Honda", "BMW", "Mercedes-Benz", "Audi", "Tesla", "Volkswagen", "Nissan", "Jeep", "Hyundai", "Kia", "Lexus", "Subaru", "Porsche", "Mazda", "Dodge", "Ferrari", "Lamborghini"],
  luxuryBrands: ["Gucci", "Louis Vuitton", "Chanel", "Prada", "Rolex", "Cartier", "Burberry", "Dior", "Balenciaga", "Versace", "Tiffany", "Fendi", "Givenchy", "Valentino", "Armani", "Tom Ford", "Moncler", "Hermes", "YSL", "Bvlgari"],
  sports: ["Soccer", "Basketball", "Baseball", "Football", "Tennis", "Golf", "Hockey", "Wrestling", "Swimming", "Boxing", "Skateboarding", "Cycling", "Cricket", "Table Tennis", "Volleyball", "Rugby", "Lacrosse", "Badminton", "Surfing", "Skiing"],
  celebrities: ["Taylor Swift", "Dwayne Johnson", "Selena Gomez", "Kim Kardashian", "Lionel Messi", "Beyoncé", "Cristiano Ronaldo", "Drake", "LeBron James", "Ariana Grande", "Zendaya", "Billie Eilish", "Elon Musk", "Rihanna", "Tom Holland", "Emma Watson", "Chris Hemsworth", "Shakira", "Travis Scott", "Bad Bunny"],
  countries: ["United States", "Canada", "Mexico", "United Kingdom", "France", "Germany", "Italy", "Spain", "Japan", "China", "Australia", "India", "Brazil", "Russia", "South Korea", "South Africa", "Netherlands", "Sweden", "Switzerland", "New Zealand"],
  cities: ["New York", "Los Angeles", "Chicago", "Houston", "Phoenix", "Miami", "Atlanta", "Dallas", "Seattle", "San Francisco", "Boston", "Las Vegas", "Orlando", "San Diego", "Denver", "Philadelphia", "Austin", "Portland", "Washington DC", "Detroit"],
  minecraftMobs: ["Creeper", "Zombie", "Skeleton", "Enderman", "Spider", "Villager", "Witch", "Slime", "Blaze", "Ghast", "Piglin", "Wither Skeleton", "Iron Golem", "Pillager", "Drowned", "Warden", "Husk", "Stray", "Bee", "Axolotl"]
};

export const imposterCategories = Object.keys(imposterWordBank) as Array<keyof typeof imposterWordBank>;

export const imposterCategoryLabels: Record<string, string> = {
  animals: "Animals",
  moviesAndShows: "Movies & Shows",
  disneyAndPixar: "Disney & Pixar",
  fpsGames: "FPS Games",
  otherGames: "Other Games",
  food: "Food",
  drinks: "Drinks",
  restaurants: "Restaurants",
  carBrands: "Car Brands",
  luxuryBrands: "Luxury Brands",
  sports: "Sports",
  celebrities: "Celebrities",
  countries: "Countries",
  cities: "Cities",
  minecraftMobs: "Minecraft Mobs"
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
        if (!game) {
          throw new Error("Game not found");
        }
        if (game.phase === "ended") {
          throw new Error("Game has ended");
        }
        if (game.kicked.includes(args.sessionId)) {
          throw new Error("You have been kicked from this game");
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

        // Host leaving ends the game for everyone
        if (game.host_id === args.sessionId) {
          await tx.mutate.imposter_games.update({
            id: game.id,
            phase: "ended",
            settings: { ...game.settings, phaseEndsAt: null },
            updated_at: now()
          });
          // Detach all sessions from this game
          const gameSessions = await tx.run(zql.sessions.where("game_type", "imposter").where("game_id", game.id));
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

        await tx.mutate.imposter_games.update({
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
          settings: { ...game.settings, currentRound: nextRound, phaseEndsAt },
          updated_at: now()
        });
      }
    ),
    kick: defineMutator(
      z.object({ gameId: z.string(), hostId: z.string(), targetId: z.string() }),
      async ({ args, tx }) => {
        const game = await tx.run(zql.imposter_games.where("id", args.gameId).one());
        if (!game || game.host_id !== args.hostId) {
          throw new Error("Only host can kick");
        }
        if (args.targetId === args.hostId) {
          throw new Error("Cannot kick yourself");
        }

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
        if (!game || game.host_id !== args.hostId) {
          throw new Error("Only host can end game");
        }

        await tx.mutate.imposter_games.update({
          id: game.id,
          phase: "ended",
          settings: { ...game.settings, phaseEndsAt: null },
          updated_at: now()
        });

        const gameSessions = await tx.run(zql.sessions.where("game_type", "imposter").where("game_id", game.id));
        for (const s of gameSessions) {
          await tx.mutate.sessions.update({
            id: s.id,
            game_type: undefined,
            game_id: undefined,
            last_seen: now()
          });
        }
      }
    )
  },
  password: {
    create: defineMutator(
      z.object({ id: z.string(), hostId: z.string(), teamCount: z.number().min(2).max(6).optional(), targetScore: z.number().min(1).max(50).optional() }),
      async ({ args, tx }) => {
        const count = args.teamCount ?? 2;
        const teams = Array.from({ length: count }, (_, i) => ({
          name: `Team ${String.fromCharCode(65 + i)}`,
          members: i === 0 ? [args.hostId] : [] as string[]
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
          active_round: null,
          kicked: [],
          settings: { targetScore: args.targetScore ?? 10, turnTeamIndex: 0, roundDurationSec: 75 },
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
        if (game.phase === "ended") {
          throw new Error("Game has ended");
        }
        if (game.kicked.includes(args.sessionId)) {
          throw new Error("You have been kicked from this game");
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

        // Host leaving ends the game for everyone
        if (game.host_id === args.sessionId) {
          await tx.mutate.password_games.update({
            id: game.id,
            phase: "ended",
            active_round: null,
            updated_at: now()
          });
          const gameSessions = await tx.run(zql.sessions.where("game_type", "password").where("game_id", game.id));
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
    switchTeam: defineMutator(
      z.object({ gameId: z.string(), sessionId: z.string(), teamName: z.string() }),
      async ({ args, tx }) => {
        const game = await tx.run(zql.password_games.where("id", args.gameId).one());
        if (!game) {
          throw new Error("Game not found");
        }
        if (game.phase !== "lobby") {
          throw new Error("Can only switch teams in lobby");
        }
        if (game.settings.teamsLocked) {
          throw new Error("Teams are locked");
        }

        const targetTeam = game.teams.find((team) => team.name === args.teamName);
        if (!targetTeam) {
          throw new Error("Team not found");
        }

        const teams = game.teams.map((team) => ({
          ...team,
          members: team.name === args.teamName
            ? team.members.includes(args.sessionId) ? team.members : [...team.members, args.sessionId]
            : team.members.filter((m) => m !== args.sessionId)
        }));

        await tx.mutate.password_games.update({
          id: game.id,
          teams,
          updated_at: now()
        });
      }
    ),
    movePlayer: defineMutator(
      z.object({ gameId: z.string(), hostId: z.string(), playerId: z.string(), teamName: z.string() }),
      async ({ args, tx }) => {
        const game = await tx.run(zql.password_games.where("id", args.gameId).one());
        if (!game) {
          throw new Error("Game not found");
        }
        if (game.host_id !== args.hostId) {
          throw new Error("Only host can move players");
        }
        if (game.phase !== "lobby") {
          throw new Error("Can only move players in lobby");
        }

        const targetTeam = game.teams.find((team) => team.name === args.teamName);
        if (!targetTeam) {
          throw new Error("Team not found");
        }

        const teams = game.teams.map((team) => ({
          ...team,
          members: team.name === args.teamName
            ? team.members.includes(args.playerId) ? team.members : [...team.members, args.playerId]
            : team.members.filter((m) => m !== args.playerId)
        }));

        await tx.mutate.password_games.update({
          id: game.id,
          teams,
          updated_at: now()
        });
      }
    ),
    lockTeams: defineMutator(
      z.object({ gameId: z.string(), hostId: z.string(), locked: z.boolean() }),
      async ({ args, tx }) => {
        const game = await tx.run(zql.password_games.where("id", args.gameId).one());
        if (!game) {
          throw new Error("Game not found");
        }
        if (game.host_id !== args.hostId) {
          throw new Error("Only host can lock teams");
        }

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
    ),
    kick: defineMutator(
      z.object({ gameId: z.string(), hostId: z.string(), targetId: z.string() }),
      async ({ args, tx }) => {
        const game = await tx.run(zql.password_games.where("id", args.gameId).one());
        if (!game || game.host_id !== args.hostId) {
          throw new Error("Only host can kick");
        }
        if (args.targetId === args.hostId) {
          throw new Error("Cannot kick yourself");
        }

        const teams = game.teams.map((t) => ({
          ...t,
          members: t.members.filter((m) => m !== args.targetId)
        }));
        const kicked = [...game.kicked, args.targetId];

        await tx.mutate.password_games.update({
          id: game.id,
          teams,
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
        const game = await tx.run(zql.password_games.where("id", args.gameId).one());
        if (!game || game.host_id !== args.hostId) {
          throw new Error("Only host can end game");
        }

        await tx.mutate.password_games.update({
          id: game.id,
          phase: "ended",
          active_round: null,
          updated_at: now()
        });

        const gameSessions = await tx.run(zql.sessions.where("game_type", "password").where("game_id", game.id));
        for (const s of gameSessions) {
          await tx.mutate.sessions.update({
            id: s.id,
            game_type: undefined,
            game_id: undefined,
            last_seen: now()
          });
        }
      }
    )
  },

  /* ── Dev-only demo seeders ──────────────────────────── */
  demo: {
    seedImposter: defineMutator(
      z.object({
        id: z.string(),
        hostId: z.string(),
        phase: z.enum(["lobby", "playing", "voting", "results"]),
        players: z.array(z.object({
          sessionId: z.string(),
          name: z.string().nullable(),
          connected: z.boolean(),
          role: z.enum(["imposter", "player"]).optional()
        })),
        clues: z.array(z.object({ sessionId: z.string(), text: z.string(), createdAt: z.number() })),
        votes: z.array(z.object({ voterId: z.string(), targetId: z.string() })),
        secretWord: z.string().nullable(),
        currentRound: z.number(),
        phaseEndsAt: z.number().nullable(),
      }),
      async ({ args, tx }) => {
        const ts = now();
        const players = args.players.map(p =>
          p.role != null ? { ...p, role: p.role } : { sessionId: p.sessionId, name: p.name, connected: p.connected }
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
          settings: {
            rounds: 3,
            imposters: 1,
            currentRound: args.currentRound,
            roundDurationSec: 75,
            votingDurationSec: 45,
            phaseEndsAt: args.phaseEndsAt,
          },
          created_at: ts,
          updated_at: ts,
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
        rounds: z.array(z.object({
          round: z.number(),
          teamIndex: z.number(),
          clueGiverId: z.string(),
          guesserId: z.string(),
          word: z.string(),
          clue: z.string(),
          guess: z.string().nullable(),
          correct: z.boolean(),
        })),
        currentRound: z.number(),
        activeRound: z.object({
          teamIndex: z.number(),
          clueGiverId: z.string(),
          guesserId: z.string(),
          word: z.string().nullable(),
          clue: z.string().nullable(),
          startedAt: z.number(),
          endsAt: z.number(),
        }).nullable(),
        targetScore: z.number(),
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
          active_round: args.activeRound,
          kicked: [],
          settings: { targetScore: args.targetScore, turnTeamIndex: 1, roundDurationSec: 45, teamsLocked: false },
          created_at: ts,
          updated_at: ts,
        });
      }
    )
  }
});
