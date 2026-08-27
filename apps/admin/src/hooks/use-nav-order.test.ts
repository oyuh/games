import { describe, expect, test } from "bun:test";
import { moveItem, nudgeItem, reconcileNav } from "./use-nav-order";

const NAV = ["/", "/clients", "/games", "/bans", "/shikaku", "/pips"];

describe("reconcileNav", () => {
  test("no stored order means the declared order", () => {
    expect(reconcileNav([], NAV)).toEqual(NAV);
  });

  test("keeps a customised order", () => {
    const custom = ["/pips", "/", "/clients", "/games", "/bans", "/shikaku"];
    expect(reconcileNav(custom, NAV)).toEqual(custom);
  });

  test("a newly added page still appears for someone who reordered", () => {
    // The bug this exists to prevent. Without it, adding /reports would be
    // invisible to every admin who had ever dragged an item.
    const custom = ["/pips", "/"];
    expect(reconcileNav(custom, [...NAV, "/reports"])).toEqual([
      "/pips",
      "/",
      "/clients",
      "/games",
      "/bans",
      "/shikaku",
      "/reports",
    ]);
  });

  test("drops a page that no longer exists", () => {
    expect(reconcileNav(["/gone", "/pips", "/"], ["/", "/pips"])).toEqual([
      "/pips",
      "/",
    ]);
  });

  test("a duplicated entry cannot render an item twice", () => {
    expect(reconcileNav(["/pips", "/pips"], ["/", "/pips"])).toEqual([
      "/pips",
      "/",
    ]);
  });
});

describe("moveItem", () => {
  test("moves an item to the target's slot", () => {
    expect(moveItem(["a", "b", "c"], "c", "a")).toEqual(["c", "a", "b"]);
    expect(moveItem(["a", "b", "c"], "a", "c")).toEqual(["b", "c", "a"]);
  });

  test("dropping onto itself or an unknown target changes nothing", () => {
    expect(moveItem(["a", "b"], "a", "a")).toEqual(["a", "b"]);
    expect(moveItem(["a", "b"], "a", "zz")).toEqual(["a", "b"]);
  });
});

describe("nudgeItem", () => {
  test("shifts one slot in either direction", () => {
    expect(nudgeItem(["a", "b", "c"], "b", -1)).toEqual(["b", "a", "c"]);
    expect(nudgeItem(["a", "b", "c"], "b", 1)).toEqual(["a", "c", "b"]);
  });

  test("clamps at both ends rather than wrapping", () => {
    // Wrapping would make a held-down arrow key cycle forever, which reads as
    // a bug even though it is a valid reordering.
    expect(nudgeItem(["a", "b", "c"], "a", -1)).toEqual(["a", "b", "c"]);
    expect(nudgeItem(["a", "b", "c"], "c", 1)).toEqual(["a", "b", "c"]);
  });
});
