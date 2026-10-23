// Minimal jest-style expect() on top of node:assert, for the node:test runner.
const assert = require("node:assert/strict");

module.exports = function expect(actual) {
  return {
    toBe: (expected) => assert.strictEqual(actual, expected),
    toHaveLength: (n) => assert.strictEqual(actual.length, n),
    toMatchObject: (subset) => {
      for (const [k, v] of Object.entries(subset)) assert.strictEqual(actual[k], v, `property ${k}`);
    },
  };
};
