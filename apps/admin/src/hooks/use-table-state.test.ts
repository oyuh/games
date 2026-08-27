import { describe, expect, test } from "bun:test";
import { reconcileHidden, reconcileOrder } from "./use-table-state";

describe("reconcileOrder", () => {
  test("keeps a stored arrangement", () => {
    expect(reconcileOrder(["c", "a", "b"], ["a", "b", "c"])).toEqual([
      "c",
      "a",
      "b",
    ]);
  });

  test("appends a newly added column instead of hiding it", () => {
    // The bug this exists to prevent: add a column, and everyone who ever
    // dragged a header never sees it because their stored order predates it.
    expect(reconcileOrder(["b", "a"], ["a", "b", "seed"])).toEqual([
      "b",
      "a",
      "seed",
    ]);
  });

  test("drops a column that no longer exists", () => {
    expect(reconcileOrder(["a", "gone", "b"], ["a", "b"])).toEqual(["a", "b"]);
  });

  test("survives an empty or duplicated stored order", () => {
    expect(reconcileOrder([], ["a", "b"])).toEqual(["a", "b"]);
    expect(reconcileOrder(["a", "a"], ["a", "b"])).toEqual(["a", "b"]);
  });
});

describe("reconcileHidden", () => {
  test("keeps hidden ids that still exist and drops the rest", () => {
    expect(reconcileHidden(["a", "gone"], ["a", "b"])).toEqual(["a"]);
  });

  test("a new column is never hidden by a stale record", () => {
    expect(reconcileHidden(["a"], ["a", "b", "seed"])).toEqual(["a"]);
  });
});
