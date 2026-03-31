/**
 * Tests for client-side rate limiter.
 *
 * The rate-limit module has persistent module-level state (timestamps,
 * warnings, etc.), so we reset modules before each test for isolation.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock the toast module before importing rate-limit
vi.mock("../lib/toast", () => ({
  showToast: vi.fn(),
}));

let checkRateLimit: () => boolean;
let showToastMock: ReturnType<typeof vi.fn>;

beforeEach(async () => {
  vi.useFakeTimers();
  vi.resetModules();
  // Re-mock toast after resetModules
  vi.doMock("../lib/toast", () => ({
    showToast: vi.fn(),
  }));
  // Dynamically import fresh module instances
  const rl = await import("../lib/rate-limit");
  const toast = await import("../lib/toast");
  checkRateLimit = rl.checkRateLimit;
  showToastMock = toast.showToast as unknown as ReturnType<typeof vi.fn>;
});

afterEach(() => {
  vi.useRealTimers();
});

describe("checkRateLimit", () => {
  it("allows the first call", () => {
    expect(checkRateLimit()).toBe(true);
  });

  it("allows up to 30 calls within 10s window", () => {
    for (let i = 0; i < 30; i++) {
      expect(checkRateLimit()).toBe(true);
    }
  });

  it("rejects the 31st call within window", () => {
    for (let i = 0; i < 30; i++) {
      checkRateLimit();
    }
    expect(checkRateLimit()).toBe(false);
  });

  it("shows a toast warning on first rate limit breach", () => {
    for (let i = 0; i < 31; i++) {
      checkRateLimit();
    }
    expect(showToastMock).toHaveBeenCalled();
  });

  it("resets window after 10s", () => {
    for (let i = 0; i < 30; i++) {
      checkRateLimit();
    }
    // Advance past the 10s window
    vi.advanceTimersByTime(11_000);
    expect(checkRateLimit()).toBe(true);
  });

  it("enters full restriction after 5 warnings", () => {
    // Trigger 5 warning cycles
    for (let cycle = 0; cycle < 5; cycle++) {
      // Fill window to trigger a warning
      for (let i = 0; i < 31; i++) {
        checkRateLimit();
      }
      // Advance past window so timestamps clear, but warnings persist (< 120s)
      vi.advanceTimersByTime(11_000);
    }
    // Now should be restricted for 60s
    expect(checkRateLimit()).toBe(false);
  });
});
