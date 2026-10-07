/**
 * What the dropdown offers for one note: the likely suspects for the current
 * key, ordered by fit and never pre-selected, each with a "why" label saying
 * what the melody note is over it. All theory comes from src/theory.
 *
 * @import { Song, Note, ChordSpec, NoteRole } from "../types.js"
 */

import { analyzeNoteOverChord, candidates, fit, numeralOf, parseNumeral } from "../theory/index.js";

/**
 * @typedef {{
 *   key: string,
 *   chord: ChordSpec,
 *   numeral: string,
 *   fit: number,
 *   why: string,
 * }} ChordOption
 */

/** @type {Record<NoteRole, string>} */
const WHY = {
  root: "Melody is the root",
  third: "Melody is the 3rd",
  fifth: "Melody is the 5th",
  seventh: "Melody is the 7th",
  tension: "Melody is a tension over it",
  clash: "Melody rubs against it",
};

/** @param {ChordSpec} chord */
const chordKey = (chord) => `${chord.root}:${chord.type}`;

/**
 * One chord as an option on a note.
 * @param {Song} song
 * @param {Note} note
 * @param {ChordSpec} chord
 * @param {string} [key] stable id for the option; defaults to the chord itself
 * @returns {ChordOption}
 */
export function describeOption(song, note, chord, key = chordKey(chord)) {
  return {
    key,
    chord,
    numeral: numeralOf(chord, song.key),
    fit: fit(song, note.id, chord),
    why: WHY[analyzeNoteOverChord(note.midi, chord).role],
  };
}

/**
 * The likely suspects for a note in the song's key, best fit first. Ties keep
 * the theory core's order. With `extended`, only the extra vocabulary
 * (secondary dominants, borrowed and passing chords) that the likely list
 * doesn't already hold.
 * @param {Song} song
 * @param {Note} note
 * @param {{ extended?: boolean }} [options]
 * @returns {ChordOption[]}
 */
export function chordOptions(song, note, { extended = false } = {}) {
  const likely = candidates(song.key);
  const chords = extended
    ? candidates(song.key, { extended: true }).filter(
        (c) => !likely.some((l) => chordKey(l) === chordKey(c)),
      )
    : likely;
  return chords.map((chord) => describeOption(song, note, chord)).sort((a, b) => b.fit - a.fit);
}

/**
 * The scale degree a number key auditions: a diatonic root's degree, or null
 * for chromatic and applied chords, which no plain number names.
 * @param {ChordOption} option
 * @returns {number | null}
 */
export function degreeOf(option) {
  const parsed = parseNumeral(option.numeral);
  return parsed && parsed.accidental === 0 && !parsed.of ? parsed.degree : null;
}
