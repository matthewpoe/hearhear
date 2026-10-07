/**
 * A minimal store implementing Svelte's store contract (`subscribe` returns an
 * unsubscribe function and calls the subscriber immediately). Plain JS, so the
 * store layer runs in Node tests and the eval harness without a framework.
 *
 * @template T
 * @param {T} initial
 * @returns {{ subscribe: (run: (value: T) => void) => () => void, get: () => T, set: (value: T) => void }}
 */
export function createReadable(initial) {
  let value = initial;
  /** @type {Set<(value: T) => void>} */
  const subscribers = new Set();
  return {
    subscribe(run) {
      subscribers.add(run);
      run(value);
      return () => subscribers.delete(run);
    },
    get: () => value,
    set(next) {
      value = next;
      for (const run of subscribers) run(value);
    },
  };
}
