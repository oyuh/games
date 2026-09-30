import { afterEach, beforeEach, expect, it, vi } from "vitest";

const pushed: Array<{ sessionId: string; required: boolean }> = [];
vi.mock("../broadcast-server", () => ({
  broadcastToSession: (sessionId: string, msg: { required: boolean }) => pushed.push({ sessionId, required: msg.required }),
}));

const { addBotSignal, botStatus, setBotScore } = await import("../bot-score");

beforeEach(() => {
  vi.useFakeTimers();
  pushed.length = 0;
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

it("enters limbo at the threshold and only leaves once the score decays under the exit line", () => {
  for (let i = 0; i < 4; i++) addBotSignal("spammer", "rejected");
  expect(botStatus("spammer")).toEqual({ score: 60, limbo: true });
  expect(pushed).toEqual([{ sessionId: "spammer", required: true }]);

  // One half-life: 30 is under ENTER but still above EXIT, so it stays put.
  vi.advanceTimersByTime(60_000);
  expect(botStatus("spammer")).toEqual({ score: 30, limbo: true });

  // Two more: 7.5 is under EXIT, and the re-check lets it out and says so.
  vi.advanceTimersByTime(120_000);
  expect(botStatus("spammer").limbo).toBe(false);
  expect(pushed.at(-1)).toEqual({ sessionId: "spammer", required: false });
});

it("clears limbo at once when a challenge passes", () => {
  setBotScore("solver", 100);
  expect(botStatus("solver").limbo).toBe(true);
  expect(setBotScore("solver", 0)).toEqual({ score: 0, limbo: false });
});

it("never puts anyone in limbo in production without a Turnstile secret, since nobody could get out", () => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("TURNSTILE_SECRET_KEY", "");
  expect(setBotScore("prod-user", 100)).toEqual({ score: 100, limbo: false });
  expect(pushed).toEqual([]);
});

it("ignores sessions with no verified identity", () => {
  expect(addBotSignal(null, "rejected")).toEqual({ score: 0, limbo: false });
  expect(setBotScore("anon", 100)).toEqual({ score: 0, limbo: false });
});
