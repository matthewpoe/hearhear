/**
 * The chord dropdown's vocabulary, per key and mode.
 *
 * @import { Key, ChordSpec } from "../types.js"
 */

import { chordFromNumeral } from "./numerals.js";

/** The PRD's likely suspects, most common first. */
const COMMON = {
  major: ["I", "IV", "V", "vi", "ii", "iii"],
  minor: ["i", "iv", "V", "III", "VI"],
};

/**
 * "Something else…": secondary dominants, chords borrowed from the parallel
 * mode, and diminished sevenths that pass a semitone up into a diatonic chord.
 */
const EXTENDED = {
  major: [
    ...["V7/ii", "V7/iii", "V7/IV", "V7/V", "V7/vi"],
    ...["iv", "bIII", "bVI", "bVII"],
    ...["#i°7", "#ii°7", "#iv°7", "#v°7"],
  ],
  minor: [...["V7/III", "V7/iv", "V7/V", "V7/VI"], ...["I", "IV"], ...["#iv°7", "#vii°7"]],
};

/**
 * The likely suspects for the dropdown, in the current key and mode, unordered.
 * @param {Key} key
 * @param {{ extended?: boolean }} [options] extended: secondary dominants, borrowed, passing diminished
 * @returns {ChordSpec[]}
 */
export function candidates(key, { extended = false } = {}) {
  const numerals = [...COMMON[key.mode], ...(extended ? EXTENDED[key.mode] : [])];
  return numerals.map((n) => /** @type {ChordSpec} */ (chordFromNumeral(n, key)));
}
