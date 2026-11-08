/**
 * Letter-name chord symbols as the tutor writes them ("Bb", "F#m7", "B°"),
 * read into the song schema's { root, type }, so a suggestion is checked by
 * which chord it names, not by how it is spelled.
 *
 * @import { ChordSpec } from "../types.js"
 */

import { chromaOf } from "./pitch.js";

/**
 * Each accepted suffix and the song-schema chord type it names. Several
 * spellings of one chord ("dim", "o", "°") name the same type.
 * @type {Record<string, string>}
 */
const SUFFIX_TYPES = {
  "": "M",
  m: "m",
  min: "m",
  7: "7",
  maj7: "maj7",
  M7: "maj7",
  m7: "m7",
  dim: "dim",
  o: "dim",
  "°": "dim",
  dim7: "dim7",
  o7: "dim7",
  "°7": "dim7",
  m7b5: "m7b5",
  ø: "m7b5",
  ø7: "m7b5",
  aug: "aug",
  "+": "aug",
  sus2: "sus2",
  sus4: "sus4",
  6: "6",
  m6: "m6",
};

/**
 * Parse a letter-name chord symbol: a root letter with an optional `#` or
 * `b`, then a quality suffix. The root keeps the spelling it was written in.
 * @param {string} text e.g. "A#", "Bbm7", "F#°7", "Cmaj7", "Gsus4"
 * @returns {ChordSpec | null} null if it does not parse
 */
export function chordFromLetter(text) {
  const m = text.trim().match(/^([A-G][#b]?)(.*)$/);
  if (!m) return null;
  const [, root, suffix] = m;
  const type = Object.hasOwn(SUFFIX_TYPES, suffix) ? SUFFIX_TYPES[suffix] : null;
  return type ? { root, type } : null;
}

/**
 * Whether two chords are the same chord however their roots are spelled:
 * the same root pitch class (A# and Bb) and the same type.
 * @param {ChordSpec} a
 * @param {ChordSpec} b
 * @returns {boolean}
 */
export function sameChord(a, b) {
  return a.type === b.type && chromaOf(a.root) === chromaOf(b.root);
}
