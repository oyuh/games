import { defineMutator, defineMutators } from "@rocicorp/zero";
import { customAlphabet } from "nanoid";
import { z } from "zod";
import { zql } from "./schema";

const now = () => Date.now();
const code = customAlphabet("ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789", 6);
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

function isClueTooSimilar(clue: string, word: string) {
  const c = normalized(clue);
  const w = normalized(word);
  if (c === w) return true;
  if (c.startsWith(w) || w.startsWith(c)) return true;
  return false;
}

function chooseRoles(
  players: Array<{ sessionId: string; name: string | null; connected: boolean; role?: "imposter" | "player" }>,
  imposterCount: number
) {
  const shuffled = [...players].sort(() => Math.random() - 0.5);
  const imposterIds = new Set(
    shuffled.slice(0, Math.max(1, Math.min(imposterCount, Math.max(1, players.length - 1)))).map((p) => p.sessionId)
  );
  return players.map((player) => ({
    ...player,
    role: imposterIds.has(player.sessionId) ? ("imposter" as const) : ("player" as const)
  }));
}

// ── Chain Reaction word bank ────────────────────────────
// Each chain is an array of words where adjacent pairs form a common compound phrase.
const chainWordBank: string[][] = [
  ["FIRE", "TRUCK", "STOP", "SIGN", "LANGUAGE"],
  ["SUN", "FLOWER", "POT", "LUCK", "CHARM"],
  ["BOOK", "WORM", "HOLE", "PUNCH", "LINE"],
  ["SNOW", "BALL", "PARK", "BENCH", "PRESS"],
  ["RAIN", "BOW", "TIE", "BREAK", "FAST"],
  ["STAR", "FISH", "BOWL", "CUT", "BACK"],
  ["SAND", "CASTLE", "ROCK", "BAND", "WIDTH"],
  ["DOOR", "BELL", "TOWER", "BRIDGE", "WORK"],
  ["FOOT", "BALL", "ROOM", "MATE", "SHIP"],
  ["HORSE", "SHOE", "LACE", "WORK", "SHOP"],
  ["WATER", "FALL", "BACK", "BONE", "FIRE"],
  ["BLACK", "BOARD", "GAME", "PLAN", "TREE"],
  ["TREE", "HOUSE", "WIFE", "TIME", "ZONE"],
  ["NIGHT", "MARE", "TAIL", "GATE", "CRASH"],
  ["BLOOD", "HOUND", "DOG", "HOUSE", "HOLD"],
  ["KEY", "BOARD", "WALK", "WAY", "SIDE"],
  ["GOLD", "MINE", "FIELD", "GOAL", "POST"],
  ["SEA", "SHELL", "FISH", "TANK", "TOP"],
  ["TOOTH", "BRUSH", "FIRE", "WORK", "FORCE"],
  ["HAND", "SHAKE", "DOWN", "HILL", "SIDE"],
  ["AIR", "PORT", "HOLE", "SALE", "PRICE"],
  ["HAIR", "CUT", "THROAT", "SONG", "BIRD"],
  ["HEAD", "BAND", "STAND", "STILL", "LIFE"],
  ["MOON", "LIGHT", "HOUSE", "BOAT", "LOAD"],
  ["EARTH", "WORM", "WOOD", "LAND", "MARK"],
  ["NEWS", "PAPER", "WEIGHT", "LIFT", "OFF"],
  ["EYE", "BROW", "BEAT", "DOWN", "POUR"],
  ["HEART", "BEAT", "BOX", "CAR", "POOL"],
  ["ROAD", "BLOCK", "CHAIN", "MAIL", "BOX"],
  ["BED", "ROOM", "SERVICE", "CHARGE", "BACK"],
  // 6-word chains
  ["FIRE", "SIDE", "WALK", "WAY", "POINT", "GUARD"],
  ["RAIN", "COAT", "RACK", "BALL", "GAME", "PLAN"],
  ["SNOW", "DRIFT", "WOOD", "WORK", "SHOP", "LIFT"],
  ["DAY", "LIGHT", "WEIGHT", "LOSS", "LEADER", "BOARD"],
  ["SUN", "BURN", "MARK", "DOWN", "TOWN", "HOUSE"],
  ["BOOK", "MARK", "TIME", "LINE", "BACK", "FIRE"],
  ["FOOT", "NOTE", "BOOK", "CASE", "WORK", "BENCH"],
  ["OVER", "NIGHT", "FALL", "BACK", "PACK", "HORSE"],
  ["HOME", "SICK", "BED", "BUG", "SPRAY", "PAINT"],
  ["CROSS", "BOW", "STRING", "BEAN", "BAG", "PIPE"],
  // 7-word chains
  ["BLACK", "BIRD", "HOUSE", "WIFE", "TIME", "ZONE", "OUT"],
  ["WATER", "PROOF", "READ", "BACK", "BONE", "HEAD", "BAND"],
  ["HAND", "STAND", "STILL", "LIFE", "TIME", "LINE", "BACK"],
  ["NIGHT", "CLUB", "HOUSE", "WORK", "LOAD", "STAR", "LIGHT"],
  ["GOLD", "FISH", "BOWL", "CUT", "BACK", "DOOR", "BELL"],
  ["SEA", "HORSE", "SHOE", "HORN", "BILL", "BOARD", "ROOM"],
  ["HAIR", "PIN", "POINT", "GUARD", "RAIL", "ROAD", "BLOCK"],
  ["HEAD", "LINE", "BACK", "YARD", "STICK", "BALL", "PARK"],
  ["MOON", "SHINE", "COAT", "TAIL", "SPIN", "WHEEL", "CHAIR"],
  ["EARTH", "BOUND", "LESS", "WORK", "BENCH", "MARK", "DOWN"],
  // 8-word chains
  ["RAIN", "DROP", "KICK", "BACK", "FIRE", "SIDE", "WALK", "WAY"],
  ["SNOW", "BALL", "PARK", "LAND", "MARK", "DOWN", "HILL", "SIDE"],
  ["FIRE", "PLACE", "KICK", "BACK", "PACK", "HORSE", "PLAY", "GROUND"],
  ["NIGHT", "FALL", "BACK", "BONE", "HEAD", "BAND", "WAGON", "WHEEL"],
  ["BOOK", "SHELF", "LIFE", "BOAT", "HOUSE", "WORK", "LOAD", "STAR"],
  // 9-word chains
  ["RAIN", "DROP", "KICK", "BACK", "FIRE", "SIDE", "WALK", "WAY", "POINT"],
  ["SNOW", "BALL", "PARK", "LAND", "MARK", "DOWN", "HILL", "SIDE", "LINE"],
  ["NIGHT", "FALL", "BACK", "BONE", "HEAD", "BAND", "WAGON", "WHEEL", "CHAIR"],
  ["TIME", "SHARE", "CROP", "LAND", "SLIDE", "SHOW", "BOAT", "HOUSE", "WIFE"],
  ["HAND", "SHAKE", "DOWN", "HILL", "SIDE", "KICK", "BACK", "BONE", "HEAD"],
  // 10-word chains
  ["RAIN", "DROP", "KICK", "BACK", "FIRE", "SIDE", "WALK", "WAY", "POINT", "GUARD"],
  ["SNOW", "BALL", "PARK", "LAND", "MARK", "DOWN", "HILL", "SIDE", "LINE", "BACK"],
  ["NIGHT", "FALL", "BACK", "BONE", "HEAD", "BAND", "WAGON", "WHEEL", "CHAIR", "MAN"],
  ["TIME", "SHARE", "CROP", "LAND", "SLIDE", "SHOW", "BOAT", "HOUSE", "WORK", "LOAD"],
  ["HAND", "SHAKE", "DOWN", "HILL", "SIDE", "KICK", "BACK", "BONE", "HEAD", "BAND"],
];

function pickChain(length: number): string[] {
  const matching = chainWordBank.filter((c) => c.length === length);
  const pool = matching.length > 0 ? matching : chainWordBank.filter((c) => c.length >= length);
  const chain = pickRandom(pool);
  return chain.slice(0, length);
}

function scoreForLetters(lettersShown: number): number {
  if (lettersShown <= 2) return 3;
  if (lettersShown <= 4) return 2;
  return 1;
}

function getConnectedSet(sessions: Array<{ id: string; last_seen: number }>) {
  const cutoff = now() - PRESENCE_TIMEOUT_MS;
  return new Set(sessions.filter((session) => session.last_seen >= cutoff).map((session) => session.id));
}

// Word bank for Password game — common nouns that work well with one-word clues
const passwordWordBank = [
  "Apple", "Bridge", "Camera", "Dragon", "Eagle", "Forest", "Guitar", "Hammer",
  "Island", "Jacket", "Kite", "Ladder", "Mirror", "Needle", "Ocean", "Pillow",
  "Queen", "Rocket", "Shadow", "Tunnel", "Umbrella", "Volcano", "Window", "Anchor",
  "Balloon", "Castle", "Diamond", "Engine", "Feather", "Globe", "Helmet", "Igloo",
  "Jungle", "Kettle", "Lantern", "Mountain", "Noodle", "Oyster", "Penguin", "Puzzle",
  "Rainbow", "Scarecrow", "Tomato", "Unicorn", "Violin", "Wizard", "Blanket", "Candle",
  "Desert", "Fossil", "Garage", "Harvest", "Iceberg", "Juggler", "Kitten", "Library",
  "Magnet", "Napkin", "Orchid", "Parrot", "Quilt", "Robot", "Saddle", "Tornado",
  "Thunder", "Velvet", "Waffle", "Basket", "Cactus", "Dolphin", "Emerald", "Falcon",
  "Ghost", "Honey", "Ivory", "Jigsaw", "Koala", "Lemon", "Marble", "Nugget",
  "Otter", "Pirate", "Rabbit", "Sailor", "Tiger", "Vampire", "Walrus", "Cookie",
  "Compass", "Crystal", "Dungeon", "Eclipse", "Flame", "Goblin", "Harpoon", "Sphinx",
  "Treasure", "Trident", "Phantom", "Serpent", "Beacon", "Blizzard", "Canyon", "Comet",
  "Dagger", "Fortress", "Glacier", "Labyrinth", "Meteor", "Oasis", "Palace", "Raven",
  "Scepter", "Tempest", "Vortex", "Whistle", "Zombie", "Arrow", "Barrel", "Circus",
  "Curtain", "Fountain", "Garlic", "Hammock", "Insect", "Jewel", "Knot", "Lotus",
  "Mango", "Orbit", "Pebble", "Riddle", "Sunset", "Trophy", "Voyage", "Wrench",
];

function pickPasswordWord(usedWords?: string[]) {
  const available = usedWords?.length
    ? passwordWordBank.filter((w) => !usedWords.includes(w))
    : passwordWordBank;
  const pool = available.length > 0 ? available : passwordWordBank;
  return pickRandom(pool);
}

function buildTeamRound(team: { name: string; members: string[] }, teamIndex: number, roundNum: number, word: string) {
  if (team.members.length < 2) {
    throw new Error(`${team.name} needs at least 2 players`);
  }
  const guesserId = team.members[(roundNum - 1) % team.members.length]!;

  return {
    teamIndex,
    guesserId,
    word,
    clues: [] as Array<{ sessionId: string; text: string }>,
    guess: null as string | null,
  };
}

function buildAllTeamRounds(teams: Array<{ name: string; members: string[] }>, roundNum: number, usedWords?: string[]) {
  const word = pickPasswordWord(usedWords);
  return teams
    .map((team, i) => (team.members.length >= 2 ? buildTeamRound(team, i, roundNum, word) : null))
    .filter((r): r is NonNullable<typeof r> => r !== null);
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
        gameType: z.enum(["imposter", "password", "chain_reaction", "shade_signal"]),
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

  /* ═══════════════════════════════════════════════════════
     IMPOSTER GAME
     ═══════════════════════════════════════════════════════ */
  imposter: {
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
          settings: allVoted ? { ...game.settings, phaseEndsAt: null } : game.settings,
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
          // Move to results with whatever votes exist
          await tx.mutate.imposter_games.update({
            id: game.id,
            phase: "results",
            settings: { ...game.settings, phaseEndsAt: null },
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
        const done = nextRound > game.settings.rounds;

        if (done) {
          // Game finished — show summary
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
  },

  /* ═══════════════════════════════════════════════════════
     PASSWORD GAME
     ═══════════════════════════════════════════════════════ */
  password: {
    create: defineMutator(
      z.object({
        id: z.string(),
        hostId: z.string(),
        teamCount: z.number().min(2).max(6).optional(),
        targetScore: z.number().min(1).max(50).optional()
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
          announcement: null,
          settings: { targetScore: args.targetScore ?? 10, roundDurationSec: 75, roundEndsAt: null },
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
        // Only allow joining during lobby; mid-game visitors spectate
        if (game.phase !== "lobby") throw new Error("Game is already in progress");

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

        const activeRounds = buildAllTeamRounds(game.teams, 1);
        const roundEndsAt = now() + game.settings.roundDurationSec * 1000;

        await tx.mutate.password_games.update({
          id: game.id,
          phase: "playing",
          current_round: 1,
          active_rounds: activeRounds,
          settings: { ...game.settings, roundEndsAt },
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
        if (!isOneWord(args.clue)) throw new Error("Clue must be one word");
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
      z.object({ gameId: z.string(), sessionId: z.string(), guess: z.string().min(1).max(40) }),
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
        const newWord = pickPasswordWord(usedWords);
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
    )
  },

  /* ═══════════════════════════════════════════════════════
     CHAT (in-game IRC)
     ═══════════════════════════════════════════════════════ */
  chat: {
    send: defineMutator(
      z.object({
        id: z.string(),
        gameType: z.enum(["imposter", "password", "chain_reaction", "shade_signal"]),
        gameId: z.string(),
        senderId: z.string(),
        senderName: z.string(),
        badge: z.string().optional(),
        text: z.string().min(1).max(500)
      }),
      async ({ args, tx }) => {
        await tx.mutate.chat_messages.insert({
          id: args.id,
          game_type: args.gameType,
          game_id: args.gameId,
          sender_id: args.senderId,
          sender_name: args.senderName,
          badge: args.badge,
          text: args.text.trim(),
          created_at: now()
        });
      }
    ),

    clearForGame: defineMutator(
      z.object({ gameType: z.enum(["imposter", "password", "chain_reaction", "shade_signal"]), gameId: z.string() }),
      async ({ args, tx }) => {
        const msgs = await tx.run(
          zql.chat_messages.where("game_type", args.gameType).where("game_id", args.gameId)
        );
        for (const m of msgs) {
          await tx.mutate.chat_messages.delete({ id: m.id });
        }
      }
    )
  },

  /* ═══════════════════════════════════════════════════════
     CHAIN REACTION GAME
     ═══════════════════════════════════════════════════════ */
  chainReaction: {
    create: defineMutator(
      z.object({
        id: z.string(),
        hostId: z.string(),
        chainLength: z.number().min(5).max(10).optional(),
        rounds: z.number().min(1).max(10).optional(),
        turnTimeSec: z.number().nullable().optional(),
        chainMode: z.enum(["premade", "custom"]).optional()
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
          announcement: null,
          settings: {
            chainLength: args.chainLength ?? 5,
            rounds: args.rounds ?? 3,
            currentRound: 1,
            turnTimeSec: args.turnTimeSec ?? null,
            phaseEndsAt: null,
            chainMode: args.chainMode ?? "premade"
          },
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
        if (game.phase !== "lobby") throw new Error("Game is already in progress");
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
          chainMode: z.enum(["premade", "custom"])
        })
      }),
      async ({ args, tx }) => {
        const game = await tx.run(zql.chain_reaction_games.where("id", args.gameId).one());
        if (!game) throw new Error("Game not found");
        if (game.host_id !== args.hostId) throw new Error("Only host can update settings");
        if (game.phase !== "lobby") throw new Error("Can only update settings in lobby");
        await tx.mutate.chain_reaction_games.update({
          id: game.id,
          settings: args.settings,
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
          [p1]: makeChainSlots(pickChain(game.settings.chainLength)),
          [p2]: makeChainSlots(pickChain(game.settings.chainLength))
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

        const session = await tx.run(zql.sessions.where("id", args.sessionId).one());
        const playerName = session?.name ?? args.sessionId.slice(0, 6);

        if (correct) {
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
        } else {
          // Wrong guess — auto-reveal one letter (unless it would reveal the whole word)
          const newLettersShown = slot.lettersShown < slot.word.length - 1
            ? slot.lettersShown + 1
            : slot.lettersShown;
          updatedPlayerChain = updatedPlayerChain.map((s, i) =>
            i === args.wordIndex ? { ...s, lettersShown: newLettersShown } : s
          );
          // Save the updated hint, then throw so UI knows it was wrong
          await tx.mutate.chain_reaction_games.update({
            id: game.id,
            chain: { ...game.chain, [args.sessionId]: updatedPlayerChain },
            updated_at: now()
          });
          throw new Error("Wrong guess!");
        }

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
                [p1]: makeChainSlots(pickChain(game.settings.chainLength)),
                [p2]: makeChainSlots(pickChain(game.settings.chainLength))
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
                [p1]: makeChainSlots(pickChain(game.settings.chainLength)),
                [p2]: makeChainSlots(pickChain(game.settings.chainLength))
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
    )
  },

  /* ═══════════════════════════════════════════════════════
     SHADE SIGNAL GAME
     ═══════════════════════════════════════════════════════ */
  shadeSignal: {
    create: defineMutator(
      z.object({
        id: z.string(),
        hostId: z.string(),
        hardMode: z.boolean().optional(),
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
          announcement: null,
          settings: {
            hardMode: args.hardMode ?? false,
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
        if (game.phase !== "lobby") throw new Error("Game is already in progress");

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

    start: defineMutator(
      z.object({ gameId: z.string(), hostId: z.string() }),
      async ({ args, tx }) => {
        const game = await tx.run(zql.shade_signal_games.where("id", args.gameId).one());
        if (!game) throw new Error("Game not found");
        if (game.host_id !== args.hostId) throw new Error("Only host can start");
        if (game.players.length < 3) throw new Error("Need at least 3 players");

        const shuffled = [...game.players].sort(() => Math.random() - 0.5);
        const leaderOrder = shuffled.map((p) => p.sessionId);
        const leaderId = leaderOrder[0]!;
        const rows = game.grid_rows;
        const cols = game.grid_cols;
        const targetRow = Math.floor(Math.random() * rows);
        const targetCol = Math.floor(Math.random() * cols);

        await tx.mutate.shade_signal_games.update({
          id: game.id,
          phase: "clue1",
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
          settings: { ...game.settings, phaseEndsAt: null },
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

        await tx.mutate.shade_signal_games.update({
          id: game.id,
          phase: "clue1",
          leader_id: nextLeaderId,
          current_leader_index: nextLeaderIndex,
          grid_seed: Math.floor(Math.random() * 100000),
          target_row: Math.floor(Math.random() * rows),
          target_col: Math.floor(Math.random() * cols),
          clue1: null,
          clue2: null,
          guesses: [],
          settings: {
            ...game.settings,
            currentRound: nextRound,
            phaseEndsAt: now() + game.settings.clueDurationSec * 1000
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
    )
  },

  /* ── Dev-only demo seeders ──────────────────────────── */
  demo: {
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
  }
});
