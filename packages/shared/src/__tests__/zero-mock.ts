/**
 * Mutator tests run the real mutators against MockTx, so Zero itself is
 * stubbed out for every suite: defineMutator hands back the handler (callable
 * directly, and as `.fn` the way dev mutators call into game mutators), and
 * zql builds plain query objects MockTx.run can filter.
 */
import { vi } from "vitest";

vi.mock("@rocicorp/zero", () => {
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

  return {
    defineMutator: (_schema: unknown, handler: any) => Object.assign(handler, { fn: handler }),
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
  };
});
