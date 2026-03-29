/**
 * Vitest mock setup for @rocicorp/zero.
 *
 * Replaces defineMutator/defineMutators with pass-throughs so we can
 * invoke mutator handlers directly with mock tx/ctx.
 * Replaces schema builders so zql becomes a proxy returning MockQuery objects.
 */
import { vi } from "vitest";
import type { MockQuery } from "./test-helpers";

// ─── Mock query builder (stands in for zql) ──────────────
function createMockQuery(table: string): MockQuery {
  const q: MockQuery = {
    _table: table,
    _filters: [],
    _single: false,
    where(field: string, value: unknown) {
      // clone so multiple where() calls work
      const next = createMockQuery(table);
      next._filters = [...q._filters, { field, value }];
      next._single = q._single;
      return next;
    },
    one() {
      const next = createMockQuery(table);
      next._filters = [...q._filters];
      next._single = true;
      return next;
    },
  };
  return q;
}

const zqlProxy = new Proxy(
  {},
  {
    get: (_target, tableName: string) => createMockQuery(tableName),
  }
);

/**
 * Call this at the TOP of any test file that imports mutators.
 * Must be called before any mutator imports.
 */
export function setupZeroMocks() {
  vi.mock("@rocicorp/zero", () => ({
    defineMutator: (_schema: unknown, handler: unknown) => handler,
    defineMutators: (m: unknown) => m,
    createBuilder: () => zqlProxy,
    createSchema: () => ({}),
    relationships: () => ({}),
    table: (name: string) => ({
      columns: (cols: unknown) => ({
        primaryKey: () => ({ _tableName: name }),
      }),
    }),
    string: () => ({ optional: () => ({}) }),
    number: () => ({ optional: () => ({}) }),
    boolean: () => ({ optional: () => ({}) }),
    json: () => ({ optional: () => ({}) }),
    enumeration: () => ({ optional: () => ({}) }),
  }));
}
