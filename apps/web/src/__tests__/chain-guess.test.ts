import { describe, it, expect } from "vitest";
import { buildGuessCells, lockToPrefix } from "../components/chain/chain-guess";

describe("lockToPrefix — revealed letters are a locked prefix", () => {
  it("lets the player type only the remaining letters (2 shown of a 5-letter word → 3 more)", () => {
    const word = "TRUCK";
    const prefix = word.slice(0, 2); // "TR" revealed
    // Start at the locked prefix, then type the remaining letters one at a time.
    let guess = prefix;
    guess = lockToPrefix(guess + "u", prefix, word.length); // TRU
    guess = lockToPrefix(guess + "c", prefix, word.length); // TRUC
    guess = lockToPrefix(guess + "k", prefix, word.length); // TRUCK
    expect(guess).toBe("TRUCK");
    // The word is full — no further letters can be added.
    expect(lockToPrefix(guess + "s", prefix, word.length)).toBe("TRUCK");
  });

  it("never lets the locked prefix be erased by backspacing into it", () => {
    const word = "TRUCK";
    const prefix = "TR";
    // Player backspaces past their typed letters and into the prefix.
    expect(lockToPrefix("T", prefix, word.length)).toBe("TR");
    expect(lockToPrefix("", prefix, word.length)).toBe("TR");
    // And select-all + retype can't overwrite the locked region either.
    expect(lockToPrefix("z", prefix, word.length)).toBe("TR");
  });

  it("caps the guess at the word length", () => {
    expect(lockToPrefix("trucks", "", "TRUCK".length)).toBe("TRUCK");
  });

  it("allows free typing when no letters are revealed yet", () => {
    expect(lockToPrefix("tru", "", "TRUCK".length)).toBe("TRU");
  });
});

describe("buildGuessCells — underscores stay visible while typing", () => {
  it("shows locked letters, typed letters, then underscores for the rest", () => {
    // 5-letter word, 2 revealed, player has typed one more letter ("TRU").
    const cells = buildGuessCells("TRUCK", 2, "TRU", true);
    expect(cells.map((c) => c.char)).toEqual(["T", "R", "U", "_", "_"]);
    expect(cells.map((c) => c.kind)).toEqual(["locked", "locked", "filled", "empty", "empty"]);
    // The player can always see two letters are still needed.
    expect(cells.filter((c) => c.kind === "empty")).toHaveLength(2);
  });

  it("marks the next empty cell as the caret when interactive", () => {
    const cells = buildGuessCells("TRUCK", 2, "TRU", true);
    const active = cells.filter((c) => c.active);
    expect(active).toHaveLength(1);
    expect(active[0]!.index).toBe(3);
  });

  it("never marks a caret in read-only (spectating) mode", () => {
    const cells = buildGuessCells("TRUCK", 2, "TRU", false);
    expect(cells.some((c) => c.active)).toBe(false);
  });

  it("mirrors an opponent draft without dropping below the revealed prefix", () => {
    // A mirrored draft that is momentarily shorter than the prefix still shows the
    // revealed letters rather than blanks.
    const cells = buildGuessCells("TRUCK", 2, "T", false);
    expect(cells.map((c) => c.char)).toEqual(["T", "R", "_", "_", "_"]);
    expect(cells.slice(0, 2).every((c) => c.kind === "locked")).toBe(true);
  });

  it("renders an all-underscore word before any letter is revealed or typed", () => {
    const cells = buildGuessCells("TRUCK", 0, "", true);
    expect(cells.map((c) => c.char)).toEqual(["_", "_", "_", "_", "_"]);
    expect(cells[0]!.active).toBe(true);
  });
});
