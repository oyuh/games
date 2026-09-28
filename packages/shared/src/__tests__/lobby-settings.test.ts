/**
 * updateSettings, for every game: the host changing the setup from the lobby.
 *
 * The handlers run against MockTx like every other mutator suite. The bounds
 * live in the zod schema, which Zero runs before the handler, so those cases
 * go straight at the schema the mock keeps on `.schema`.
 */
import { describe, it, expect, beforeEach } from "vitest";
import type { ZodType } from "zod";
import {
  MockTx,
  serverCtx,
  makeImposterGame,
  makePasswordGame,
  makeChainReactionGame,
  makeShadeSignalGame,
  makeLocationSignalGame,
  expectThrows,
} from "./test-helpers";
import { imposterMutators } from "../zero/mutators/imposter";
import { passwordMutators } from "../zero/mutators/password";
import { chainReactionMutators } from "../zero/mutators/chain-reaction";
import { shadeSignalMutators } from "../zero/mutators/shade-signal";
import { locationSignalMutators } from "../zero/mutators/location-signal";

type Handler = ((params: { args: any; tx: any; ctx: any }) => Promise<void>) & { schema: ZodType };

const games = [
  {
    name: "Imposter",
    table: "imposter_games",
    make: makeImposterGame,
    update: imposterMutators.updateSettings as unknown as Handler,
    good: { rounds: 7, imposters: 2, roundDurationSec: 120, clueVisibility: 0.25 },
    bad: [{ rounds: 11 }, { imposters: 0 }, { roundDurationSec: 5 }, { rounds: 2.5 }, { category: "nope" }],
  },
  {
    name: "Password",
    table: "password_games",
    make: makePasswordGame,
    update: passwordMutators.updateSettings as unknown as Handler,
    good: { targetScore: 25, roundDurationSec: 90, category: "animals" },
    bad: [{ targetScore: 0 }, { targetScore: 51 }, { roundDurationSec: 10 }, { category: "nope" }],
  },
  {
    name: "Chain Reaction",
    table: "chain_reaction_games",
    make: makeChainReactionGame,
    update: chainReactionMutators.updateSettings as unknown as Handler,
    good: { chainLength: 8, rounds: 4, turnTimeSec: null, chainMode: "custom" },
    bad: [{ chainLength: 4 }, { chainLength: 11 }, { turnTimeSec: 5 }, { chainMode: "both" }, { category: "nope" }],
  },
  {
    name: "Shade Signal",
    table: "shade_signal_games",
    make: makeShadeSignalGame,
    update: shadeSignalMutators.updateSettings as unknown as Handler,
    good: { hardMode: true, leaderPick: true, roundsPerPlayer: 3, clueDurationSec: 90, guessDurationSec: 20 },
    bad: [{ roundsPerPlayer: 4 }, { clueDurationSec: 500 }, { guessDurationSec: 0 }],
  },
  {
    name: "Location Signal",
    table: "location_signal_games",
    make: makeLocationSignalGame,
    update: locationSignalMutators.updateSettings as unknown as Handler,
    good: { cluePairs: 4, roundsPerPlayer: 1, clueDurationSec: 30, guessDurationSec: 60 },
    bad: [{ cluePairs: 0 }, { cluePairs: 5 }, { roundsPerPlayer: 4 }, { guessDurationSec: 1000 }],
  },
] as const;

describe.each(games)("$name: updateSettings", ({ table, make, update, good, bad }) => {
  let tx: MockTx;
  const game = () => tx.getById(table, "game1") as any;
  const run = (settings: object, hostId = "host1") =>
    update({ args: { gameId: "game1", hostId, settings }, tx, ctx: serverCtx(hostId) });

  beforeEach(() => {
    tx = new MockTx("server");
    tx.seed(table, [make({ id: "game1", host_id: "host1" })]);
  });

  it("writes what the host sent", async () => {
    await run(good);
    expect(game().settings).toMatchObject(good);
  });

  it("leaves every setting it was not sent alone", async () => {
    const before = { ...game().settings };
    const [key, value] = Object.entries(good)[0]!;
    await run({ [key]: value });
    expect(game().settings).toEqual({ ...before, [key]: value });
  });

  it("refuses anyone but the host", async () => {
    await expectThrows(() => run(good, "player1"), "Only host");
  });

  it("refuses once the game has started", async () => {
    tx.seed(table, [make({ id: "game1", host_id: "host1", phase: "playing" })]);
    await expectThrows(() => run(good), "only update settings in lobby");
  });

  it("accepts the values the lobby offers", () => {
    expect(update.schema.safeParse({ gameId: "game1", hostId: "host1", settings: good }).success).toBe(true);
  });

  it.each(bad)("rejects %o", (settings) => {
    expect(update.schema.safeParse({ gameId: "game1", hostId: "host1", settings }).success).toBe(false);
  });
});

describe("Imposter: updateSettings and the word bank", () => {
  it("writes the category to its own column, not into settings", async () => {
    const tx = new MockTx("server");
    tx.seed("imposter_games", [makeImposterGame({ id: "game1", host_id: "host1" })]);
    await (imposterMutators.updateSettings as unknown as Handler)({
      args: { gameId: "game1", hostId: "host1", settings: { category: "food" } },
      tx,
      ctx: serverCtx("host1"),
    });
    const game = tx.getById("imposter_games", "game1") as any;
    expect(game.category).toBe("food");
    expect(game.settings.category).toBeUndefined();
  });
});
