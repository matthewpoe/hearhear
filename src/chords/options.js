/**
 * What the dropdown offers for one note: the likely suspects for the current
 * key, ordered by fit and never pre-selected, each with a "why" label saying
 * what the melody note is over it. All theory comes from src/theory.
 *
 * @import { Song, Note, ChordSpec, NoteRole } from "../types.js"
 */

import {
  analyzeNoteOverChord,
  candidates,
  chordFromNumeral,
  fit,
  midiToDegree,
  numeralOf,
  parseNumeral,
} from "../theory/index.js";

/**
 * @typedef {{
 *   key: string,
 *   chord: ChordSpec,
 *   numeral: string,
 *   fit: number,
 *   why: string,
 *   applied?: boolean,
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

/**
 * Applied dominants the main list may offer under a chromatic melody note.
 * Sevenths only: numeralOf names a seventh V7/x and colors it dominant, while
 * the triad would read as a plain chromatic numeral (E in G is "VI"). Major
 * tonicizes ii, iii, IV, V and vi; minor only V, whose #4 is the chromatic
 * note a minor tune most often carries. See docs/decisions/applied-dominants.md.
 */
const APPLIED = {
  major: ["V7/ii", "V7/iii", "V7/IV", "V7/V", "V7/vi"],
  minor: ["V7/V"],
};

/** At most this many applied dominants join the main list. */
const MAX_APPLIED = 2;

/**
 * The chord tones that let an applied dominant explain a chromatic note, in
 * tie-break order: a raised note is most often the leading tone (the 3rd) of
 * V/x, a lowered one its 7th (F in G7 = V7/IV in G). The root isn't listed:
 * every V7/x root in the pool is diatonic, so it never explains a chromatic note.
 * @type {NoteRole[]}
 */
const EXPLAINING_ROLES = ["third", "seventh", "fifth"];

/**
 * Whether a melody pitch is outside the key. Minor's raised 6th and 7th
 * (melodic and harmonic minor) belong to the key, so they aren't chromatic.
 * @param {number} midi
 * @param {Song["key"]} key
 */
function isChromatic(midi, key) {
  const { degree, accidental } = midiToDegree(midi, key);
  if (accidental === 0) return false;
  return !(key.mode === "minor" && accidental === 1 && (degree === 6 || degree === 7));
}

/** @param {ChordSpec} chord */
const chordKey = (chord) => `${chord.root}:${chord.type}`;

/** @param {ChordOption} a @param {ChordOption} b */
const byFit = (a, b) => b.fit - a.fit;

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
 * the theory core's order. Under a chromatic melody note, up to two applied
 * dominants that explain it join the likely list (see appliedOptions). With
 * `extended`, only the extra vocabulary (secondary dominants, borrowed and
 * passing chords) that the main list doesn't already hold.
 * @param {Song} song
 * @param {Note} note
 * @param {{ extended?: boolean }} [options]
 * @returns {ChordOption[]}
 */
export function chordOptions(song, note, { extended = false } = {}) {
  const likely = candidates(song.key).map((chord) => describeOption(song, note, chord));
  const main = [...likely, ...appliedOptions(song, note, likely)].sort(byFit);
  if (!extended) return main;
  const shown = new Set(main.map((o) => o.key));
  return candidates(song.key, { extended: true })
    .filter((chord) => !shown.has(chordKey(chord)))
    .map((chord) => describeOption(song, note, chord))
    .sort(byFit);
}

/**
 * The applied dominants that explain a chromatic melody note (it is their
 * 3rd, 5th or 7th), best fit first, then by EXPLAINING_ROLES; at most
 * MAX_APPLIED. None for a note in the key, so a diatonic note's main list is
 * exactly the likely list. The numeral comes from describeOption (numeralOf),
 * which reads each one back as V7/x, so no number key names it (degreeOf).
 * @param {Song} song
 * @param {Note} note
 * @param {ChordOption[]} likely
 * @returns {ChordOption[]}
 */
function appliedOptions(song, note, likely) {
  if (!isChromatic(note.midi, song.key)) return [];
  const taken = new Set(likely.map((o) => o.key));
  /** @type {{ option: ChordOption, rank: number }[]} */
  const found = [];
  for (const numeral of APPLIED[song.key.mode]) {
    const chord = /** @type {ChordSpec} */ (chordFromNumeral(numeral, song.key));
    const key = chordKey(chord);
    const rank = EXPLAINING_ROLES.indexOf(analyzeNoteOverChord(note.midi, chord).role);
    if (taken.has(key) || rank < 0) continue;
    taken.add(key);
    found.push({ option: { ...describeOption(song, note, chord), applied: true }, rank });
  }
  return found
    .sort((a, b) => byFit(a.option, b.option) || a.rank - b.rank)
    .slice(0, MAX_APPLIED)
    .map((f) => f.option);
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
