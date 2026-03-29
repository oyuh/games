import { describe, it, expect } from "vitest";
import {
  chooseRoles,
  shuffle,
  pickRandom,
  pickPasswordWord,
  pickChain,
  buildTeamRound,
  buildAllTeamRounds,
  scoreForLetters,
  getConnectedSet,
} from "../zero/mutators/helpers";

// ───────────────────────────────────────────────────────────
// shuffle
// ───────────────────────────────────────────────────────────
describe("shuffle", () => {
  it("returns a new array (not the original)", () => {
    const original = [1, 2, 3, 4, 5];
    const result = shuffle(original);
    expect(result).not.toBe(original);
    expect(result).toHaveLength(original.length);
  });

  it("contains all original elements", () => {
    const original = [1, 2, 3, 4, 5];
    const result = shuffle(original);
    expect(result.sort()).toEqual(original.sort());
  });

  it("handles empty array", () => {
    expect(shuffle([])).toEqual([]);
  });

  it("handles single element", () => {
    expect(shuffle([42])).toEqual([42]);
  });
});

// ───────────────────────────────────────────────────────────
// pickRandom
// ───────────────────────────────────────────────────────────
describe("pickRandom", () => {
  it("returns an element from the array", () => {
    const arr = ["a", "b", "c"];
    expect(arr).toContain(pickRandom(arr));
  });

  it("returns the only element from a single-item array", () => {
    expect(pickRandom(["only"])).toBe("only");
  });
});

// ───────────────────────────────────────────────────────────
// chooseRoles
// ───────────────────────────────────────────────────────────
describe("chooseRoles", () => {
  const players = [
    { sessionId: "p1", name: "Alice", connected: true },
    { sessionId: "p2", name: "Bob", connected: true },
    { sessionId: "p3", name: "Charlie", connected: true },
    { sessionId: "p4", name: "Dana", connected: true },
    { sessionId: "p5", name: "Eve", connected: true },
  ];

  it("assigns exactly the requested number of imposters", () => {
    const result = chooseRoles(players, 1);
    const imposters = result.filter((p) => p.role === "imposter");
    expect(imposters).toHaveLength(1);
  });

  it("assigns everyone else as player", () => {
    const result = chooseRoles(players, 1);
    const regularPlayers = result.filter((p) => p.role === "player");
    expect(regularPlayers).toHaveLength(4);
  });

  it("caps imposters at players.length - 1", () => {
    const result = chooseRoles(players, 10);
    const imposters = result.filter((p) => p.role === "imposter");
    expect(imposters.length).toBeLessThan(players.length);
    expect(imposters.length).toBeGreaterThanOrEqual(1);
  });

  it("always assigns at least 1 imposter", () => {
    const result = chooseRoles(players, 0);
    const imposters = result.filter((p) => p.role === "imposter");
    expect(imposters.length).toBeGreaterThanOrEqual(1);
  });

  it("preserves all player data", () => {
    const result = chooseRoles(players, 1);
    for (const p of result) {
      expect(p.sessionId).toBeDefined();
      expect(p.name).toBeDefined();
      expect(p.role).toBeDefined();
      expect(["imposter", "player"]).toContain(p.role);
    }
  });

  it("works with minimum 2 players", () => {
    const twoPlayers = players.slice(0, 2);
    const result = chooseRoles(twoPlayers, 1);
    expect(result.filter((p) => p.role === "imposter")).toHaveLength(1);
    expect(result.filter((p) => p.role === "player")).toHaveLength(1);
  });

  it("handles 2 imposters correctly", () => {
    const result = chooseRoles(players, 2);
    const imposters = result.filter((p) => p.role === "imposter");
    expect(imposters).toHaveLength(2);
  });
});

// ───────────────────────────────────────────────────────────
// pickPasswordWord
// ───────────────────────────────────────────────────────────
describe("pickPasswordWord", () => {
  it("returns a string", () => {
    expect(typeof pickPasswordWord()).toBe("string");
  });

  it("returns a non-empty string", () => {
    expect(pickPasswordWord().length).toBeGreaterThan(0);
  });

  it("avoids used words when possible", () => {
    // Pick many words and check they're not in the used list
    const used = [pickPasswordWord()];
    for (let i = 0; i < 20; i++) {
      const word = pickPasswordWord(used);
      // With a large word bank, it should find a different word
      if (used.length < 100) {
        expect(used).not.toContain(word);
      }
    }
  });

  it("handles category filter", () => {
    const word = pickPasswordWord([], "animals");
    expect(typeof word).toBe("string");
  });
});

// ───────────────────────────────────────────────────────────
// pickChain
// ───────────────────────────────────────────────────────────
describe("pickChain", () => {
  it("returns an array of the requested length", () => {
    const chain = pickChain(4);
    expect(chain).toHaveLength(4);
  });

  it("returns strings", () => {
    const chain = pickChain(3);
    for (const word of chain) {
      expect(typeof word).toBe("string");
    }
  });

  it("handles category filter", () => {
    const chain = pickChain(4, "animals");
    expect(chain.length).toBeGreaterThan(0);
  });
});

// ───────────────────────────────────────────────────────────
// scoreForLetters
// ───────────────────────────────────────────────────────────
describe("scoreForLetters", () => {
  it("awards 3 points for 1-2 letters shown", () => {
    expect(scoreForLetters(1)).toBe(3);
    expect(scoreForLetters(2)).toBe(3);
  });

  it("awards 2 points for 3-4 letters shown", () => {
    expect(scoreForLetters(3)).toBe(2);
    expect(scoreForLetters(4)).toBe(2);
  });

  it("awards 1 point for 5+ letters shown", () => {
    expect(scoreForLetters(5)).toBe(1);
    expect(scoreForLetters(10)).toBe(1);
  });
});

// ───────────────────────────────────────────────────────────
// buildTeamRound
// ───────────────────────────────────────────────────────────
describe("buildTeamRound", () => {
  it("builds a valid team round", () => {
    const team = { name: "Team A", members: ["p1", "p2", "p3"] };
    const round = buildTeamRound(team, 0, 1, "elephant");
    expect(round.teamIndex).toBe(0);
    expect(round.word).toBe("elephant");
    expect(round.clues).toEqual([]);
    expect(round.guess).toBeNull();
    expect(team.members).toContain(round.guesserId);
  });

  it("rotates guesser across rounds", () => {
    const team = { name: "Team A", members: ["p1", "p2", "p3"] };
    const r1 = buildTeamRound(team, 0, 1, "cat");
    const r2 = buildTeamRound(team, 0, 2, "dog");
    const r3 = buildTeamRound(team, 0, 3, "fish");
    // Each round should have a different guesser (cycling through)
    expect(r1.guesserId).toBe("p1");
    expect(r2.guesserId).toBe("p2");
    expect(r3.guesserId).toBe("p3");
  });

  it("throws if team has fewer than 2 members", () => {
    const team = { name: "Team A", members: ["p1"] };
    expect(() => buildTeamRound(team, 0, 1, "cat")).toThrow("at least 2 players");
  });

  it("throws for empty team", () => {
    const team = { name: "Team A", members: [] as string[] };
    expect(() => buildTeamRound(team, 0, 1, "cat")).toThrow("at least 2 players");
  });
});

// ───────────────────────────────────────────────────────────
// buildAllTeamRounds
// ───────────────────────────────────────────────────────────
describe("buildAllTeamRounds", () => {
  it("builds rounds for all eligible teams", () => {
    const teams = [
      { name: "Team A", members: ["p1", "p2"] },
      { name: "Team B", members: ["p3", "p4"] },
    ];
    const rounds = buildAllTeamRounds(teams, 1);
    expect(rounds).toHaveLength(2);
  });

  it("skips teams with < 2 members", () => {
    const teams = [
      { name: "Team A", members: ["p1", "p2"] },
      { name: "Team B", members: ["p3"] }, // too small
    ];
    const rounds = buildAllTeamRounds(teams, 1);
    expect(rounds).toHaveLength(1);
    expect(rounds[0]!.teamIndex).toBe(0);
  });

  it("assigns unique words to each team in the same round", () => {
    const teams = [
      { name: "Team A", members: ["p1", "p2"] },
      { name: "Team B", members: ["p3", "p4"] },
      { name: "Team C", members: ["p5", "p6"] },
    ];
    const rounds = buildAllTeamRounds(teams, 1);
    const words = rounds.map((r) => r.word);
    const unique = new Set(words);
    expect(unique.size).toBe(words.length);
  });

  it("avoids previously used words", () => {
    const teams = [
      { name: "Team A", members: ["p1", "p2"] },
    ];
    const usedWords = ["cat", "dog", "fish"];
    const rounds = buildAllTeamRounds(teams, 1, usedWords);
    expect(usedWords).not.toContain(rounds[0]!.word);
  });
});

// ───────────────────────────────────────────────────────────
// getConnectedSet
// ───────────────────────────────────────────────────────────
describe("getConnectedSet", () => {
  it("includes recently-seen sessions", () => {
    const sessions = [
      { id: "s1", last_seen: Date.now() },
      { id: "s2", last_seen: Date.now() - 5_000 },
    ];
    const connected = getConnectedSet(sessions);
    expect(connected.has("s1")).toBe(true);
    expect(connected.has("s2")).toBe(true);
  });

  it("excludes stale sessions (>30s old)", () => {
    const sessions = [
      { id: "s1", last_seen: Date.now() },
      { id: "s2", last_seen: Date.now() - 60_000 }, // 60s old
    ];
    const connected = getConnectedSet(sessions);
    expect(connected.has("s1")).toBe(true);
    expect(connected.has("s2")).toBe(false);
  });

  it("returns empty set for empty input", () => {
    expect(getConnectedSet([]).size).toBe(0);
  });
});
