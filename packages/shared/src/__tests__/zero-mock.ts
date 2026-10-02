/**
 * Preloaded by bunfig.toml. Mutator tests run the real mutators against
 * MockTx, so Zero itself is stubbed out: defineMutator hands back the handler
 * (callable directly, and as `.fn` the way dev mutators call into game
 * mutators, with its zod schema on `.schema` for the tests that check the
 * bounds), and zql builds plain query objects MockTx.run can filter.
 *
 * Bun runs every test file in one process, so a run from the repo root
 * applies this to the app suites too. The real exports stay, so they still
 * get defineQuery and the rest.
 */
import { mock } from "bun:test";
import * as realZero from "@rocicorp/zero";

function mockQueryBuilder(table: string, filters: Array<{ field: string; value: unknown }> = [], single = false) {
  return {
    _table: table,
    _filters: filters,
    _single: single,
    where: (field: string, value: unknown) => mockQueryBuilder(table, [...filters, { field, value }], single),
    one: () => mockQueryBuilder(table, filters, true),
  };
}
const zqlProxy = new Proxy({}, { get: (_t, name: string) => mockQueryBuilder(name) });
const column = () => ({ optional: () => ({}) });

mock.module("@rocicorp/zero", () => ({
  ...realZero,
  defineMutator: (schema: unknown, handler: any) => Object.assign(handler, { fn: handler, schema }),
  defineMutators: (m: unknown) => m,
  createBuilder: () => zqlProxy,
  createSchema: () => ({}),
  relationships: () => ({}),
  table: () => ({ columns: () => ({ primaryKey: () => ({}) }) }),
  string: column,
  number: column,
  boolean: column,
  json: column,
  enumeration: column,
}));
