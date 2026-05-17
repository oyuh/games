import { describe, expect, it } from "vitest";
import { authorizeZeroQuery, getZeroMutatorAccessPolicy } from "../security-policy";

describe("authorizeZeroQuery", () => {
  const unsignedCaller = {
    proofUserId: null,
    headerUserId: null,
    allowUnsigned: false,
  };

  it("allows public browse queries", async () => {
    await expect(authorizeZeroQuery("imposter.publicGames", {}, unsignedCaller)).resolves.toBeUndefined();
    await expect(authorizeZeroQuery("password.publicGames", {}, unsignedCaller)).resolves.toBeUndefined();
  });

  it("requires proof for self session queries", async () => {
    await expect(
      authorizeZeroQuery("sessions.byId", { id: "user-1" }, unsignedCaller)
    ).rejects.toThrow("Forbidden");

    await expect(
      authorizeZeroQuery(
        "sessions.byId",
        { id: "user-1" },
        { proofUserId: "user-1", headerUserId: "user-1", allowUnsigned: false }
      )
    ).resolves.toBeUndefined();
  });

  it("rejects unknown query names", async () => {
    await expect(
      authorizeZeroQuery("imposter.internalDebug", {}, unsignedCaller)
    ).rejects.toThrow("Forbidden");
  });
});

describe("getZeroMutatorAccessPolicy", () => {
  it("declares host-only timer and reveal mutators explicitly", () => {
    expect(getZeroMutatorAccessPolicy("imposter.advanceTimer")).toBe("host");
    expect(getZeroMutatorAccessPolicy("password.advanceTimer")).toBe("host");
    expect(getZeroMutatorAccessPolicy("shadeSignal.advanceTimer")).toBe("host");
    expect(getZeroMutatorAccessPolicy("shadeSignal.reveal")).toBe("host");
    expect(getZeroMutatorAccessPolicy("locationSignal.advanceTimer")).toBe("host");
    expect(getZeroMutatorAccessPolicy("locationSignal.revealRound")).toBe("host");
  });

  it("declares interactive outsider-sensitive mutators explicitly", () => {
    expect(getZeroMutatorAccessPolicy("chat.send")).toBe("member");
    expect(getZeroMutatorAccessPolicy("chat.clearForGame")).toBe("host");
    expect(getZeroMutatorAccessPolicy("locationSignal.submitGuess")).toBe("member");
    expect(getZeroMutatorAccessPolicy("sessions.setName")).toBe("proof-required");
  });

  it("keeps demo mutators public and unknown mutators denied", () => {
    expect(getZeroMutatorAccessPolicy("demo.seedImposter")).toBe("public");
    expect(getZeroMutatorAccessPolicy("demo.seedLocationSignal")).toBe("public");
    expect(getZeroMutatorAccessPolicy("demo.unknown")).toBeNull();
    expect(getZeroMutatorAccessPolicy("notreal.mutator")).toBeNull();
  });
});
