/**
 * Where a note sits, in words a non-musician can read: "bar 2, beat 3",
 * "pickup, beat 4" (bar 0 is the pickup), "bar 3, beat 2½" (the "and" of 2).
 * The one formatter for every place the UI names a position: the chord
 * dropdown's title, the chord chips, and the tutor's ideas.
 *
 * @import { Meter, Note } from "../types.js"
 */

import { positionOf } from "../theory/index.js";

/** Common beat fractions as single characters: halves, thirds (triplets), quarters, sixths. */
const FRACTIONS = [
  [1 / 2, "½"],
  [1 / 3, "⅓"],
  [2 / 3, "⅔"],
  [1 / 4, "¼"],
  [3 / 4, "¾"],
  [1 / 6, "⅙"],
  [5 / 6, "⅚"],
];
const EPSILON = 1e-6;

/**
 * A 1-based, possibly fractional beat: 2 → "2", 2.5 → "2½", 1.25 → "1¼".
 * A fraction with no single character (a sixteenth triplet) rounds to two
 * decimal places.
 * @param {number} beat
 * @returns {string}
 */
export function beatLabel(beat) {
  const whole = Math.floor(beat + EPSILON);
  const part = beat - whole;
  if (part < EPSILON) return String(whole);
  const named = FRACTIONS.find(([value]) => Math.abs(value - part) < EPSILON);
  return named ? `${whole}${named[1]}` : String(Math.round(beat * 100) / 100);
}

/**
 * @param {{ bar: number, beat: number }} position from theory's positionOf
 * @returns {string} e.g. "pickup, beat 4" or "bar 2, beat 2½"
 */
export function positionLabel({ bar, beat }) {
  return `${bar <= 0 ? "pickup" : `bar ${bar}`}, beat ${beatLabel(beat)}`;
}

/**
 * @param {Note} note
 * @param {Meter} meter
 * @returns {string} where the note starts, e.g. "bar 4, beat 1"
 */
export function whereOf(note, meter) {
  return positionLabel(positionOf(note.start, meter));
}
