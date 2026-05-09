import { describe, expect, it } from "vitest";
import { fitRepeatingMapBounds } from "../components/location/WorldMap";

describe("fitRepeatingMapBounds", () => {
  it("fits points across the east/west repeated edge tightly", () => {
    const result = fitRepeatingMapBounds(
      [
        { lat: 0, lng: 179 },
        { lat: 0, lng: -179 },
      ],
      900,
      520,
    );

    expect(Math.abs(Math.abs(result.center[1]) - 180)).toBeLessThan(1);
    expect(result.zoom).toBeGreaterThanOrEqual(7);
  });

  it("fits points across the top/bottom repeated edge tightly", () => {
    const result = fitRepeatingMapBounds(
      [
        { lat: 84, lng: 10 },
        { lat: -84, lng: 10 },
      ],
      900,
      520,
    );

    expect(Math.abs(result.center[0])).toBeGreaterThan(80);
    expect(result.zoom).toBeGreaterThanOrEqual(4);
  });

  it("normalizes a single point to the map coordinate range", () => {
    const result = fitRepeatingMapBounds([{ lat: 91, lng: 181 }], 900, 520);

    expect(result.center[0]).toBeLessThanOrEqual(85.05112878);
    expect(result.center[1]).toBeCloseTo(-179);
    expect(result.zoom).toBe(5);
  });
});
