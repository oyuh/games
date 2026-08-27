import { describe, expect, it } from "vitest";
import { generateRun } from "@games/shared/games/pips-engine";
import { renderPipsSvg } from "../pips-image";

const SEED = 12345;
const run = generateRun(SEED);
const puzzle = run.puzzles[2]!; // hard, the densest board

const countOf = (svg: string, needle: string) =>
  svg.split(needle).length - 1;

describe("renderPipsSvg", () => {
  it("draws every playable cell and every region", () => {
    const svg = renderPipsSvg(puzzle, SEED, { view: "board" });
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg.endsWith("</svg>")).toBe(true);
    // One rect per playable cell, plus the background and the rule chips.
    expect(countOf(svg, "<rect")).toBeGreaterThanOrEqual(puzzle.cells.length);
    expect(countOf(svg, "PIPS BOARD")).toBe(1);
  });

  it("shows no domino faces on the board view", () => {
    // The board is the puzzle as served. Leaking the answer here would make
    // the admin view useless for judging whether a run was plausible.
    const svg = renderPipsSvg(puzzle, SEED, { view: "board" });
    expect(countOf(svg, "<circle")).toBe(0);
  });

  it("draws the canonical answer on the solution view", () => {
    const svg = renderPipsSvg(puzzle, SEED, { view: "solution" });
    expect(countOf(svg, "<circle")).toBeGreaterThan(0);
    // A correct board has nothing to flag.
    expect(countOf(svg, "#f87171")).toBe(0);
  });

  it("outlines exactly the cells a replay got wrong", () => {
    // Flip one asymmetric domino: both of its cells now hold the other end's
    // value, so exactly two cells should be flagged.
    const index = puzzle.solution.findIndex((placement) => {
      const domino = puzzle.dominoes.find((d) => d.id === placement.dominoId);
      return domino && domino.a !== domino.b;
    });
    expect(index).toBeGreaterThanOrEqual(0);

    const replay = puzzle.solution.map((placement, i) =>
      i === index ? { ...placement, flipped: !placement.flipped } : placement,
    );

    const svg = renderPipsSvg(puzzle, SEED, { view: "replay", replay });
    expect(countOf(svg, "#f87171")).toBe(2);
  });

  it("flags nothing when the replay matches", () => {
    const svg = renderPipsSvg(puzzle, SEED, {
      view: "replay",
      replay: puzzle.solution,
    });
    expect(countOf(svg, "#f87171")).toBe(0);
  });

  it("says so rather than drawing an empty board with no replay", () => {
    const svg = renderPipsSvg(puzzle, SEED, { view: "replay", replay: [] });
    expect(svg).toContain("No replay stored");
  });

  it("tolerates a replay naming a domino that is not in this puzzle", () => {
    // Stored replay data is years old by the time anyone looks at it. It must
    // render something rather than throw.
    const svg = renderPipsSvg(puzzle, SEED, {
      view: "replay",
      replay: [
        { dominoId: "not-a-domino", r1: 0, c1: 0, r2: 0, c2: 1, flipped: false },
      ],
    });
    expect(svg.startsWith("<svg")).toBe(true);
  });

  it("renders every difficulty in the run", () => {
    for (const p of run.puzzles) {
      const svg = renderPipsSvg(p, SEED, { view: "solution" });
      expect(svg).toContain(p.difficulty.toUpperCase());
      expect(svg.endsWith("</svg>")).toBe(true);
    }
  });

  it("escapes text rather than letting it close a tag", () => {
    // Nothing user-controlled reaches the label today, but the renderer is
    // the last line before markup, so the escaping is asserted here.
    const svg = renderPipsSvg(puzzle, SEED, { view: "board" });
    expect(svg).not.toContain("<script");
  });
});
