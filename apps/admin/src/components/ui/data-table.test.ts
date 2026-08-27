import { describe, expect, test } from "bun:test";
import { compare } from "./data-table";

const sortAsc = <T>(values: T[]) => [...values].sort(compare);

describe("compare", () => {
  test("orders numbers numerically, not as strings", () => {
    // The classic table bug: 9 sorting after 10 because both became strings.
    expect(sortAsc([10, 9, 100, 2])).toEqual([2, 9, 10, 100]);
  });

  test("orders strings naturally, so seed 9 beats seed 10", () => {
    expect(sortAsc(["seed 10", "seed 9", "seed 2"])).toEqual([
      "seed 2",
      "seed 9",
      "seed 10",
    ]);
  });

  test("missing values sort last, never first", () => {
    // A blank cell is missing, not "the smallest". Sorting a score column
    // ascending should surface the fastest real time, not a row with no time.
    // The missing values all compare equal, so only the split is guaranteed,
    // not their order among themselves.
    const sorted = sortAsc([null, 5, undefined, 1, ""]);
    expect(sorted.slice(0, 2)).toEqual([1, 5]);
    expect(sorted.slice(2)).toHaveLength(3);
    expect(sorted.slice(2).every((v) => v === null || v === undefined || v === "")).toBe(
      true,
    );
  });

  test("two missing values compare equal", () => {
    expect(compare(null, undefined)).toBe(0);
    expect(compare("", null)).toBe(0);
  });

  test("zero is a value, not a missing one", () => {
    // 0ms is a real (suspicious) time and has to sort at the top, not the
    // bottom with the blanks.
    expect(sortAsc([5, 0, 3])).toEqual([0, 3, 5]);
  });

  test("is antisymmetric, so asc and desc are true mirrors", () => {
    expect(Math.sign(compare(1, 2))).toBe(-Math.sign(compare(2, 1)));
    expect(Math.sign(compare("a", "b"))).toBe(-Math.sign(compare("b", "a")));
  });
});
