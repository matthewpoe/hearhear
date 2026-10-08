/**
 * The note menu's edits beyond the accidentals: any pitch by half steps or
 * octaves, and the length by an eighth. Each answers the new value, or null
 * where the edit would leave the store's limits, so the menu can disable it.
 * Deleting is the store's makeRest: the note and its chord go and its time
 * stays a rest, so later bars never shift (see DECISIONS.md).
 */

import { MAX_MIDI, MAX_NOTE_TICKS, MIN_MIDI } from "../store/songLimits.js";
import { TICKS_PER_QUARTER } from "../theory/index.js";

/** Longer and Shorter step by an eighth: the rhythm grid's shortest value. */
export const LENGTH_STEP = TICKS_PER_QUARTER / 2;

/**
 * A pitch moved by `semitones`, or null off the piano (A0 to C8).
 * @param {number} midi
 * @param {number} semitones e.g. 1, -1, 12, -12
 * @returns {number | null}
 */
export function movePitch(midi, semitones) {
  const next = midi + semitones;
  return next >= MIN_MIDI && next <= MAX_MIDI ? next : null;
}

/**
 * A length one eighth longer (1) or shorter (-1), or null past the limits:
 * never under an eighth, never over the schema's longest note.
 * @param {number} dur ticks
 * @param {1 | -1} direction
 * @returns {number | null}
 */
export function stepLength(dur, direction) {
  const next = dur + direction * LENGTH_STEP;
  return next >= LENGTH_STEP && next <= MAX_NOTE_TICKS ? next : null;
}

/** The note values a length step lands on, by ticks, as the menu says them. */
const LENGTH_NAMES = new Map([
  [3, "a sixteenth note"],
  [6, "an eighth note"],
  [9, "a dotted eighth note"],
  [12, "a quarter note"],
  [18, "a dotted quarter note"],
  [24, "a half note"],
  [36, "a dotted half note"],
  [48, "a whole note"],
  [72, "a dotted whole note"],
]);

/**
 * A length said aloud: its note value, else how many quarter notes it lasts.
 * @param {number} dur ticks
 */
export function spokenLength(dur) {
  const named = LENGTH_NAMES.get(dur);
  if (named) return named;
  const quarters = Math.round((dur / TICKS_PER_QUARTER) * 100) / 100;
  return `${quarters} quarter notes`;
}
