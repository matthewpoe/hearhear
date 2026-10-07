/**
 * Which homes the ear finder offers: rankKeys' candidates three at a time,
 * best first, each set shuffled by a seed (the song id), so the likeliest
 * home isn't always chord 1 yet stays put across visits to the same tune.
 * The provisional C shows up only when the ranking genuinely puts it there.
 *
 * @import { Key } from "../types.js"
 */

/** Homes per set: "Try three more" moves to the next set. */
export const FINDER_SIZE = 3;

/**
 * One set of candidate homes, shuffled. Sets wrap around after the last
 * ranked key, so "Try three more" never runs out.
 * @param {{ key: Pick<Key, "tonic" | "mode"> }[]} ranked best first, as rankKeys returns them
 * @param {string} seed the song id
 * @param {number} set 0 for the first three, 1 for the next three, ...
 * @returns {Pick<Key, "tonic" | "mode">[]}
 */
export function finderHomes(ranked, seed, set) {
  const sets = Math.ceil(ranked.length / FINDER_SIZE);
  const start = (set % sets) * FINDER_SIZE;
  const homes = ranked
    .slice(start, start + FINDER_SIZE)
    .map(({ key }) => ({ tonic: key.tonic, mode: key.mode }));
  const index = set % sets;
  // The first set is shuffled by the seed itself, later ones by seed and set.
  return shuffled(homes, index === 0 ? seed : `${seed}:${index}`);
}

/**
 * A copy of `items` in an order fixed by `seed`: a Fisher-Yates shuffle
 * driven by a small seeded generator (mulberry32 over an FNV-1a hash).
 * @template T
 * @param {T[]} items
 * @param {string} seed
 * @returns {T[]}
 */
export function shuffled(items, seed) {
  const random = seededRandom(seed);
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * @param {string} seed
 * @returns {() => number} uniform in [0, 1)
 */
function seededRandom(seed) {
  let state = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    state = Math.imul(state ^ seed.charCodeAt(i), 0x01000193);
  }
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
