import { describe, expect, it } from "bun:test";
import { pipsImageRoutes } from "../pips-image";
import { zipImageRoutes } from "../zip-image";

// Ranked Pips and Zip runs are rebuilt from server-issued seeds, so a public
// route that drew a solution would answer a live ranked run. Shikaku's routes
// take ?solution=1; these must ignore it. Domino faces are <circle>s in Pips,
// and Zip's drawn path is a <polyline> of "x,y" points (the page's icons use
// polylines too, but with space-separated points).
const cases = [
  { name: "pips", routes: pipsImageRoutes, query: "seed=12345&board=hard&solution=1", answer: /<circle/ },
  { name: "zip", routes: zipImageRoutes, query: "seed=12345&difficulty=hard&solution=1", answer: /<polyline points="[\d.]+,/ },
];

describe("public puzzle routes", () => {
  for (const { name, routes, query, answer } of cases) {
    it(`${name} never draws the solution`, async () => {
      for (const path of ["/puzzle.svg", "/puzzle.svg/download", "/puzzle"]) {
        const res = await routes.request(`${path}?${query}`, { headers: { host: "localhost" } });
        expect(res.status).toBe(200);
        expect(await res.text()).not.toMatch(answer);
      }
    });
  }
});
