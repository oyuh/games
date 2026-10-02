import { describe, expect, it } from "bun:test";
import { durationCustom, formatDuration, numberCustom, parseDuration } from "../lib/setting-options";

describe("parseDuration", () => {
  it.each([
    ["90", 90],
    ["90s", 90],
    ["90 sec", 90],
    ["2m", 120],
    ["2 min", 120],
    ["5 minutes", 300],
    ["1:30", 90],
    ["1m30s", 90],
    ["1m 30s", 90],
    [" 45 ", 45],
  ])("reads %s as %i seconds", (input, seconds) => {
    expect(parseDuration(input)).toBe(seconds);
  });

  it.each(["", "abc", "1:75", "m", "s", "1.5m", "-30"])("refuses %s", (input) => {
    expect(parseDuration(input)).toBeNull();
  });
});

describe("formatDuration", () => {
  it.each([
    [45, "45s"],
    [60, "1m"],
    [90, "1m 30s"],
    [300, "5m"],
  ])("writes %i seconds as %s", (seconds, text) => {
    expect(formatDuration(seconds)).toBe(text);
  });
});

describe("custom entries stay inside the mutator's range", () => {
  const rounds = numberCustom({ min: 1, max: 10 }, (n) => (n === 1 ? "round" : "rounds"));
  const timer = durationCustom({ min: 15, max: 300 });

  it("takes a whole number in range", () => {
    expect(rounds.parse("7")).toBe("7");
    expect(rounds.format?.("1")).toBe("1 round");
  });

  it.each(["0", "11", "2.5", "", "seven"])("refuses %s rounds", (input) => {
    expect(rounds.parse(input)).toBeNull();
  });

  it("takes a timer however it is typed, as seconds", () => {
    expect(timer.parse("1:30")).toBe("90");
    expect(timer.parse("5m")).toBe("300");
    expect(timer.format?.("90")).toBe("1m 30s");
  });

  it.each(["10", "6m", "0:05"])("refuses a %s timer", (input) => {
    expect(timer.parse(input)).toBeNull();
  });
});
