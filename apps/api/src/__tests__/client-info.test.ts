import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  extractClientInfo,
  getClientInfo,
  resetClientInfoCachesForTests,
} from "../client-info";

function makeHeaders(values: Record<string, string | undefined>) {
  const normalized = new Map(
    Object.entries(values).map(([key, value]) => [key.toLowerCase(), value])
  );

  return {
    header(name: string) {
      return normalized.get(name.toLowerCase());
    },
  };
}

describe("client-info", () => {
  beforeEach(() => {
    resetClientInfoCachesForTests();
  });

  afterEach(() => {
    resetClientInfoCachesForTests();
    vi.restoreAllMocks();
  });

  it("extracts the caller IP from forwarded headers", () => {
    const info = extractClientInfo(
      makeHeaders({
        "x-forwarded-for": "8.8.8.8, 1.1.1.1",
        "user-agent": "Test Agent",
      })
    );

    expect(info.ip).toBe("8.8.8.8");
    expect(info.userAgent).toBe("Test Agent");
  });

  it("prefers edge-provided region headers and skips geo lookup", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");

    const info = await getClientInfo(
      makeHeaders({
        "x-forwarded-for": "8.8.8.8",
        "cf-ipcountry": "NZ",
      })
    );

    expect(info.region).toBe("NZ");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("falls back to the geo API when region headers are missing", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, country_code: "US" }),
    } as Response);

    const info = await getClientInfo(
      makeHeaders({
        "x-forwarded-for": "8.8.8.8",
      })
    );

    expect(info.region).toBe("US");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("caches geo lookups by IP so repeated requests do not hit the API again", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, country_code: "US" }),
    } as Response);

    await getClientInfo(makeHeaders({ "x-forwarded-for": "8.8.8.8" }));
    await getClientInfo(makeHeaders({ "x-forwarded-for": "8.8.8.8" }));

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not call the geo API for private network IPs", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");

    const info = await getClientInfo(
      makeHeaders({
        "x-forwarded-for": "10.0.0.5",
      })
    );

    expect(info.region).toBe("unknown");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
