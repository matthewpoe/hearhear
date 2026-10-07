/**
 * Which homes the ear finder offers: rankKeys' candidates three at a time,
 * best first, each set shuffled by a seed (the song id), so the likeliest
 * home isn't always chord 1 yet stays put across visits to the same tune.
 * The provisional C shows up only when the ranking genuinely puts it there.
 *
 * The first three always include a home on the tune's last note: a tune
 * that wanders far from home (Sweet Georgia Brown sits on E7, A7, D7 for
 * twelve bars) can rank its home low, but where it stops is strong evidence.
 * If none of the top three has the last note as its tonic, the best-ranked
 * key that does replaces the third. This picks candidates, not scores.
 *
 * For a demo, whose home is known, the first three always include it, and a
 * set holding it never leads with its dominant (the chord a fifth above
 * home), which a first-timer easily hears as home.
 *
 * @import { Key } from "../types.js"
 */

import { pitchClass, sameHome } from "./keys.js";

/** @typedef {Pick<Key, "tonic" | "mode">} Home */

/** Homes per set: "Try three more" moves to the next set. */
export const FINDER_SIZE = 3;

/**
 * One set of candidate homes, shuffled. Sets wrap around after the last
 * ranked key, so "Try three more" never runs out.
 * @param {{ key: Home }[]} ranked best first, as rankKeys returns them
 * @param {string} seed the song id
 * @param {number} set 0 for the first three, 1 for the next three, ...
 * @param {Home | null} [known] the demo's home, when the tune has one
 * @param {number | null} [lastMidi] the tune's last note, if it has notes
 * @returns {Home[]}
 */
export function finderHomes(ranked, seed, set, known = null, lastMidi = null) {
  const ordered = withKnownUpFront(
    withLastNoteHome(
      ranked.map(({ key }) => ({ tonic: key.tonic, mode: key.mode })),
      lastMidi,
    ),
    known,
  );
  const sets = Math.ceil(ordered.length / FINDER_SIZE);
  const index = set % sets;
  const start = index * FINDER_SIZE;
  // The first set is shuffled by the seed itself, later ones by seed and set.
  const homes = shuffled(
    ordered.slice(start, start + FINDER_SIZE),
    index === 0 ? seed : `${seed}:${index}`,
  );
  return known ? notLeadingWithDominant(homes, known) : homes;
}

/**
 * The ranking with the best-ranked home whose tonic is the last note moved up
 * to third place, if none of the first three has it; everything else keeps
 * its order. A known home still takes third place after this (it outranks
 * the last-note evidence).
 * @param {Home[]} homes best first
 * @param {number | null} lastMidi
 * @returns {Home[]}
 */
function withLastNoteHome(homes, lastMidi) {
  if (lastMidi === null) return homes;
  /** @param {Home} home */
  const onLast = (home) => pitchClass(home) === ((lastMidi % 12) + 12) % 12;
  if (homes.slice(0, FINDER_SIZE).some(onLast)) return homes;
  const at = homes.findIndex(onLast);
  if (at < 0) return homes;
  const rest = homes.filter((_, i) => i !== at);
  return [...rest.slice(0, FINDER_SIZE - 1), homes[at], ...rest.slice(FINDER_SIZE - 1)];
}

/**
 * The ranking with the known home moved up to third place if it ranked below
 * the first set; everything else keeps its order.
 * @param {Home[]} homes best first
 * @param {Home | null} known
 * @returns {Home[]}
 */
function withKnownUpFront(homes, known) {
  if (!known) return homes;
  const at = homes.findIndex((home) => sameHome(home, known));
  if (at >= 0 && at < FINDER_SIZE) return homes;
  const home = at >= 0 ? homes[at] : { tonic: known.tonic, mode: known.mode };
  const rest = homes.filter((_, i) => i !== at);
  return [...rest.slice(0, FINDER_SIZE - 1), home, ...rest.slice(FINDER_SIZE - 1)];
}

/**
 * If a set holding the known home leads with its dominant, swap the dominant
 * with another chord, one that isn't the known home when there is one, so
 * the swap doesn't simply put home first.
 * @param {Home[]} homes
 * @param {Home} known
 * @returns {Home[]}
 */
function notLeadingWithDominant(homes, known) {
  const dominant = (pitchClass(known) + 7) % 12;
  /** @param {Home} home */
  const isDominant = (home) => pitchClass(home) === dominant;
  /** @param {Home} home */
  const isKnown = (home) => sameHome(home, known);
  if (homes.length === 0 || !isDominant(homes[0]) || !homes.some(isKnown)) return homes;
  let swap = homes.findIndex((home) => !isDominant(home) && !isKnown(home));
  if (swap < 0) swap = homes.findIndex(isKnown);
  const out = [...homes];
  [out[0], out[swap]] = [out[swap], out[0]];
  return out;
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
