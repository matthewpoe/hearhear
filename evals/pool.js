/**
 * Run a task for every item with up to `concurrency` in flight, the first one
 * alone: if the server turns the harness away (a wrong access code, say), it
 * learns so from one request, not one per worker. Results keep the items'
 * order however they finish. A task that throws rejects the whole run.
 * @template T, R
 * @param {T[]} items
 * @param {number} concurrency at least 1
 * @param {(item: T) => Promise<R>} task
 * @returns {Promise<R[]>}
 */
export async function runPool(items, concurrency, task) {
  /** @type {R[]} */
  const results = new Array(items.length);
  if (items.length === 0) return results;
  results[0] = await task(items[0]);
  let next = 1;
  async function worker() {
    while (next < items.length) {
      const index = next++;
      results[index] = await task(items[index]);
    }
  }
  const workers = Math.min(concurrency, items.length - 1);
  await Promise.all(Array.from({ length: workers }, worker));
  return results;
}
