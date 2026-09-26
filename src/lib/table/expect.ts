/* The handful of vitest matchers the ported tableView tests use, on node:assert. */
import assert from 'node:assert/strict';

export function expect(actual: unknown) {
  return {
    toBe: (e: unknown) => assert.strictEqual(actual, e),
    toEqual: (e: unknown) => assert.deepStrictEqual(actual, e),
    toBeNull: () => assert.strictEqual(actual, null),
    toBeUndefined: () => assert.strictEqual(actual, undefined),
    toHaveLength: (n: number) => assert.strictEqual((actual as { length: number }).length, n),
    not: { toContain: (e: unknown) => assert.ok(!(actual as unknown[]).includes(e)) },
  };
}
