/**
 * The chord row: with ui.bottomRow set to "chords", the A–J row of the
 * computer keyboard plays the diatonic chord on each scale degree instead of
 * a single low note, so a melody can be harmonized from the keyboard. Every
 * column still means one scale degree: 1 over Q over A, and A is the home
 * chord. Pure: no DOM, audio, or store.
 *
 * @import { ChordSpec, HarmonicFunction, Key, LabelStyle } from "../types.js"
 * @import { BottomRow, KeyLabelMode } from "../store/ui.js"
 */

import {
  chordFromNumeral,
  degreeToMidi,
  functionOf,
  letterOf,
  nashvilleOf,
  numeralOf,
  voice,
} from "../theory/index.js";
import { displayNote } from "../theory/noteDisplay.js";

/** The chord row, by KeyboardEvent.code: degree 1 to 7. */
export const CHORD_CODES = ["KeyA", "KeyS", "KeyD", "KeyF", "KeyG", "KeyH", "KeyJ"];

/**
 * The chord built on each degree. Minor uses the theory core's convention for
 * the dropdown's likely suspects (candidates.js): natural minor, except the
 * major V that a cadence calls for.
 */
const DIATONIC = {
  major: ["I", "ii", "iii", "IV", "V", "vi", "vii°"],
  minor: ["i", "ii°", "III", "iv", "V", "VI", "VII"],
};

/**
 * The numeral a chord-row key plays in a mode, e.g. "KeyG" in major → "V".
 * @param {string} code
 * @param {Key["mode"]} mode
 * @returns {string | null} null for keys outside the chord row
 */
export function chordRowNumeral(code, mode) {
  const index = CHORD_CODES.indexOf(code);
  return index < 0 ? null : DIATONIC[mode][index];
}

/**
 * The chord a chord-row key plays in a key, and its harmonic function.
 * @param {string} code
 * @param {Key} key
 * @returns {{ chord: ChordSpec, fn: HarmonicFunction } | null}
 */
export function chordForCode(code, key) {
  const numeral = chordRowNumeral(code, key.mode);
  if (!numeral) return null;
  const chord = /** @type {ChordSpec} */ (chordFromNumeral(numeral, key));
  return { chord, fn: functionOf(numeral, key.mode) };
}

/**
 * What a chord-row key does right now:
 * - "notes": the row plays single notes, as before (bottomRow "notes").
 * - "assign": a staff note is selected and the key is confirmed, so the chord
 *   is placed on that note and sounds under it.
 * - "play": the chord sounds live and nothing is written. While the key is
 *   only a guess (tentative), a chord has no numeral to stand for yet.
 * - "none": the key is hidden (a demo waiting for its guess), so the song
 *   sits on a placeholder key; its chords would teach the wrong home, and
 *   the row plays nothing. The number row's single notes still play.
 * @param {{ bottomRow: BottomRow, mode: KeyLabelMode, selectedNoteId: string | null }} state
 * @returns {"notes" | "assign" | "play" | "none"}
 */
export function chordRowAction({ bottomRow, mode, selectedNoteId }) {
  if (bottomRow === "notes") return "notes";
  if (mode === "hidden") return "none";
  return mode === "confirmed" && selectedNoteId ? "assign" : "play";
}

/**
 * The dock's one line about the chord row, by key mode. It names computer
 * keys as "the F key", never "F", so no one reads a key as a chord name.
 * @param {KeyLabelMode} mode
 */
export function chordRowHelp(mode) {
  if (mode === "hidden") return "Chords follow the key you choose. Find home first.";
  const where = mode === "tentative" ? " in your guessed key" : "";
  return `Bottom-row keys play chords${where}: the A key is home (1), the F key is 4, and the G key is 5.`;
}

/**
 * Whether Backspace or Delete clears the selected note's chord: the same
 * conditions under which the chord row assigns one.
 * @param {{ mode: KeyLabelMode, selectedNoteId: string | null }} state
 */
export function clearsChord({ mode, selectedNoteId }) {
  return mode === "confirmed" && selectedNoteId !== null;
}

/**
 * Where a live chord sits: under home (degree 1 of the number row in the
 * current octave window), the left hand's register below the melody. Root
 * position, with no look-ahead, so every press of a key sounds the same.
 * @param {ChordSpec} chord
 * @param {Key} key
 * @param {number} windowOctave
 * @returns {number[]} MIDI, ascending, never below C2
 */
export function liveVoicing(chord, key, windowOctave) {
  const home = degreeToMidi({ degree: 1, accidental: 0, octave: 0 }, key, windowOctave);
  return voice(chord, null, { below: home });
}

/**
 * A chord's short label for a piano key, in the user's label style: "V",
 * "5", or "A". Numerals plus letters is too wide for a key, so it shows the
 * numeral. Callers show nothing while key labels are hidden.
 * @param {ChordSpec} chord
 * @param {Key} key
 * @param {LabelStyle} style
 */
export function chordKeyLabel(chord, key, style) {
  if (style === "letters") return displayNote(letterOf(chord));
  if (style === "nashville") return nashvilleOf(chord, key);
  return numeralOf(chord, key);
}
