import { describe, it, expect } from "vitest";
import {
  chooseRoles,
  shuffle,
  pickPasswordWord,
  pickChain,
  buildTeamRound,
  buildAllTeamRounds,
  scoreForLetters,
  getConnectedSet,
} from "../zero/mutators/helpers";
import { chainWordBank, passwordWordBank } from "../zero/mutators/word-banks";

// ───────────────────────────────────────────────────────────
// shuffle
// ───────────────────────────────────────────────────────────
describe("shuffle", () => {
  it("contains all original elements", () => {
    const original = [1, 2, 3, 4, 5];
    const result = shuffle(original);
    expect(result.sort()).toEqual(original.sort());
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
  const imposters = (count: number, list = players) =>
    chooseRoles(list, count).filter((p) => p.role === "imposter").length;

  it("assigns exactly the requested number of imposters and makes everyone else a player", () => {
    const result = chooseRoles(players, 2);
    expect(result.filter((p) => p.role === "imposter")).toHaveLength(2);
    expect(result.filter((p) => p.role === "player")).toHaveLength(3);
  });

  it("always leaves at least one player", () => {
    expect(imposters(10)).toBe(4);
    expect(imposters(1, players.slice(0, 2))).toBe(1);
  });

  it("always assigns at least 1 imposter", () => {
    expect(imposters(0)).toBe(1);
  });
});

// ───────────────────────────────────────────────────────────
// pickPasswordWord
// ───────────────────────────────────────────────────────────
describe("pickPasswordWord", () => {
  it("skips used words, down to the last one left in the category", () => {
    const [last, ...used] = passwordWordBank.animals!;
    expect(pickPasswordWord(used, "animals")).toBe(last);
  });

  it("stays inside the chosen category", () => {
    for (let i = 0; i < 20; i++) {
      expect(passwordWordBank.animals).toContain(pickPasswordWord([], "animals"));
    }
  });
});

// ───────────────────────────────────────────────────────────
// pickChain
// ───────────────────────────────────────────────────────────
describe("pickChain", () => {
  it("returns a chain of the requested length from the chosen category", () => {
    const chain = pickChain(4, "animals");
    expect(chain).toHaveLength(4);
    expect(chainWordBank.animals!.some((c) => c.slice(0, 4).join() === chain.join())).toBe(true);
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
