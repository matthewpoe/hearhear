/**
 * Left-hand voicings for playback and audition.
 *
 * @import { ChordSpec } from "../types.js"
 */

import { chordTones } from "./harmony.js";
import { chromaOf, mod } from "./pitch.js";

/**
 * A close-position voicing of pitch classes, bass first, placed so its top
 * note is the highest it can be while staying under `below`.
 * @param {number[]} chromas
 * @param {number} below
 */
function closeUnder(chromas, below) {
  const stacked = [chromas[0]];
  for (const pc of chromas.slice(1)) {
    const last = /** @type {number} */ (stacked.at(-1));
    stacked.push(last + (mod(pc - last, 12) || 12));
  }
  const top = /** @type {number} */ (stacked.at(-1));
  const octaves = Math.ceil((top - (below - 1)) / 12);
  return stacked.map((m) => m - 12 * octaves);
}

/**
 * Total voice movement between two voicings: each note's distance to the
 * nearest note of the other, both ways, so a triad and a seventh chord compare.
 * @param {number[]} a
 * @param {number[]} b
 */
function movement(a, b) {
  /** @param {number[]} from @param {number[]} to */
  const oneWay = (from, to) =>
    from.reduce((sum, m) => sum + Math.min(...to.map((n) => Math.abs(m - n))), 0);
  return oneWay(a, b) + oneWay(b, a);
}

/**
 * Voice a chord with nearest-inversion voice leading, entirely below the
 * melody. `below` is the lowest melody note in the passage being played, so
 * every chord in that passage, and every alternative auditioned there, sits
 * in the same register: A and B differ only in harmony, and the left hand
 * never collides with a low melody (Q- and A-row notes).
 *
 * Every inversion is placed in close position with its top note in the
 * octave just under `below`; the one that moves least from `previous` wins,
 * and with no previous chord, root position does.
 * @param {ChordSpec} chord
 * @param {number[] | null} previous the previous chord's voicing in the passage, if any
 * @param {{ below: number }} placement MIDI of the passage's lowest melody note
 * @returns {number[]} MIDI, ascending, every note lower than `below`
 */
export function voice(chord, previous, { below }) {
  const chromas = chordTones(chord).map(chromaOf);
  const inversions = chromas.map((_, i) =>
    closeUnder([...chromas.slice(i), ...chromas.slice(0, i)], below),
  );
  if (!previous?.length) return inversions[0];
  return inversions.reduce((best, v) =>
    movement(v, previous) < movement(best, previous) ? v : best,
  );
}
