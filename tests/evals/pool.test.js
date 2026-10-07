import { test } from "node:test";
import assert from "node:assert/strict";
import { runPool } from "../../evals/pool.js";

/** @param {number} ms */
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test("runPool sends the first item alone, then up to `concurrency` at once", async () => {
  let inFlight = 0;
  /** @type {number[]} how many were in flight as each task started */
  const atStart = [];
  const results = await runPool([0, 1, 2, 3, 4, 5, 6, 7, 8], 4, async (n) => {
    inFlight += 1;
    atStart.push(inFlight);
    // Later items finish first, so the order comes from the index, not the finish.
    await wait(20 - 2 * n);
    inFlight -= 1;
    return n * 10;
  });
  assert.equal(atStart[0], 1, "the first item runs alone");
  assert.equal(Math.max(...atStart), 4);
  assert.deepEqual(results, [0, 10, 20, 30, 40, 50, 60, 70, 80]);
});

test("runPool starts nothing else when the first item fails", async () => {
  /** @type {number[]} */
  const started = [];
  await assert.rejects(
    runPool([0, 1, 2, 3], 4, async (n) => {
      started.push(n);
      if (n === 0) throw new Error("access refused");
      return n;
    }),
    /access refused/,
  );
  assert.deepEqual(started, [0]);
});

test("runPool handles no items, one item, and concurrency 1", async () => {
  assert.deepEqual(await runPool([], 4, async (n) => n), []);
  assert.deepEqual(await runPool([7], 4, async (n) => n), [7]);
  assert.deepEqual(await runPool([1, 2, 3], 1, async (n) => n + 1), [2, 3, 4]);
});
