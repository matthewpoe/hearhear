/**
 * What a chord is made of, and what a melody note is over it.
 *
 * @import { ChordSpec, NoteRole } from "../types.js"
 */

import { Chord as TChord, Interval } from "tonal";
import { chromaOf, mod } from "./pitch.js";

/**
 * A chord tone's role by its interval number. A sus chord's 2nd or 4th stands
 * in for the third; a sixth chord's 6th is the added tone, like a seventh.
 * @type {Record<number, NoteRole>}
 */
const ROLE_BY_NUMBER = {
  1: "root",
  2: "third",
  3: "third",
  4: "third",
  5: "fifth",
  6: "seventh",
  7: "seventh",
};

/**
 * Pitch classes of a chord, root first, e.g. A7 → ["A", "C#", "E", "G"].
 * @param {ChordSpec} chord
 * @returns {string[]}
 */
export function chordTones(chord) {
  return TChord.getChord(chord.type, chord.root).notes;
}

/**
 * What a melody note is over a chord. This one function drives the dropdown's
 * "why" labels, fit, the clash check, and the evals.
 *
 * A note outside the chord is a **clash** when it sits a semitone above a
 * chord tone (a minor ninth against it: the 4th over a major third, the b9
 * over a root), and a **tension** otherwise (9ths, 6ths, #11, a blue b3 over a
 * major chord). A dominant seventh also takes its altered b9 and b13 as
 * tensions. `interval` is measured from the root: the chord's own interval
 * for a chord tone ("5d" in a diminished chord), otherwise by semitones.
 * @param {number} midi
 * @param {ChordSpec} chord
 * @returns {{ role: NoteRole, interval: string }}
 */
export function analyzeNoteOverChord(midi, chord) {
  const semis = mod(midi - chromaOf(chord.root), 12);
  const { intervals } = TChord.getChord(chord.type);
  const toneSemis = intervals.map((i) => mod(/** @type {number} */ (Interval.semitones(i)), 12));
  const index = toneSemis.indexOf(semis);
  if (index >= 0) {
    const interval = intervals[index];
    return { role: ROLE_BY_NUMBER[/** @type {number} */ (Interval.get(interval).num)], interval };
  }
  const alteredTension = chord.type === "7" && (semis === 1 || semis === 8);
  const clash = !alteredTension && toneSemis.includes(mod(semis - 1, 12));
  return { role: clash ? "clash" : "tension", interval: Interval.fromSemitones(semis) };
}
