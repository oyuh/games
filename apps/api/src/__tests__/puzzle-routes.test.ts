import { describe, expect, it } from "bun:test";
import { pipsImageRoutes } from "../pips-image";
import { shikakuImageRoutes } from "../shikaku-image";
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

const pages = [
  { name: "shikaku", routes: shikakuImageRoutes, query: "difficulty=easy&seed=12345" },
  { name: "pips", routes: pipsImageRoutes, query: "seed=12345&board=easy" },
  { name: "zip", routes: zipImageRoutes, query: "seed=12345&difficulty=easy" },
];

describe("share previews", () => {
  for (const { name, routes, query } of pages) {
    it(`${name} serves a PNG card`, async () => {
      const res = await routes.request(`/puzzle.png?${query}`, { headers: { host: "localhost" } });
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toBe("image/png");
      // PNG signature.
      expect([...new Uint8Array(await res.arrayBuffer()).slice(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
    });

    it(`${name} links back to the site behind the share proxy`, async () => {
      const res = await routes.request(`/puzzle?${query}`, {
        headers: { host: "api.games.lawsonhart.me", "x-share-origin": "https://games.lawsonhart.me" },
      });
      const html = await res.text();
      expect(html).toContain(`<meta property="og:url" content="https://games.lawsonhart.me/share/${name}?`);
      expect(html).toContain(`<meta property="og:image" content="https://games.lawsonhart.me/share/${name}.png?`);
      expect(html).not.toContain("api.games.lawsonhart.me");
    });

    it(`${name} ignores a share origin it doesn't know`, async () => {
      const res = await routes.request(`/puzzle?${query}`, {
        headers: { host: "api.games.lawsonhart.me", "x-share-origin": "https://evil.example" },
      });
      const html = await res.text();
      expect(html).toContain(`<meta property="og:url" content="https://api.games.lawsonhart.me/api/${name}/puzzle?`);
      expect(html).not.toContain("evil.example");
    });
  }
});
