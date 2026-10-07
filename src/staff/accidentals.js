/**
 * The accidental menu's choices for a staff note: the note's letter as the
 * staff spells it, with each accidental. A choice sets the pitch, not the
 * spelling: the song stores MIDI and the key spells it (see
 * docs/decisions/accidentals.md), so D sharp in a flat key shows as E flat.
 *
 * @import { Key } from "../types.js"
 */

import { spell, spellMelody } from "../theory/index.js";
import { displayNote } from "../theory/noteDisplay.js";
import { parseSpelling } from "./abc.js";
import { MAX_MIDI, MIN_MIDI } from "../store/song.js";

/** Menu order: the common ones first, the doubles last. */
const ACCIDENTALS = [
  { offset: 1, symbol: "♯", name: "sharp" },
  { offset: -1, symbol: "♭", name: "flat" },
  { offset: 0, symbol: "♮", name: "natural" },
  { offset: 2, symbol: "𝄪", name: "double sharp" },
  { offset: -2, symbol: "𝄫", name: "double flat" },
];

/** Semitones above C for each letter. */
const NATURALS = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/**
 * @typedef {{
 *   offset: number,
 *   label: string,
 *   name: string,
 *   midi: number,
 *   current: boolean,
 *   onPiano: boolean,
 *   shownAs: string | null,
 * }} AccidentalChoice
 * - label: the letter and symbol, e.g. "D♯"
 * - name: spoken, e.g. "D sharp"
 * - shownAs: how the staff will spell it, e.g. "E♭", when that differs from
 *   the label's letter and accidental; else null
 */

/**
 * A spelled pitch class or pitch with music symbols: "Eb4" → "E♭4".
 * @param {string} spelled
 */
export const pretty = displayNote;

/**
 * MIDI of a letter with an accidental in a written octave. The octave is the
 * letter's, so C♭5 is B4 (71) and B♯3 is C4 (60).
 * @param {string} letter "C" to "B"
 * @param {number} octave scientific octave (C4 is middle C)
 * @param {number} offset -2 to 2
 */
export function letterToMidi(letter, octave, offset) {
  return 12 * (octave + 1) + NATURALS[/** @type {keyof typeof NATURALS} */ (letter)] + offset;
}

/**
 * The menu for a note: its letter as the staff spells it in `key`, with each
 * accidental. The one it has now is `current`; choices off the piano are
 * marked so the menu can disable them.
 *
 * With the melody (`notes` and the note's `index`), the letter and each
 * choice's "shown as" follow the staff's spelling in context (spellMelody),
 * so a G sharp the staff writes as G sharp offers G choices, not A flat.
 * Without it, the context-free `spell`.
 * @param {number} midi
 * @param {Key} key
 * @param {{ notes: { midi: number }[], index: number }} [melody]
 * @returns {{ letter: string, octave: number, choices: AccidentalChoice[] }}
 */
export function accidentalChoices(midi, key, melody) {
  /** How the staff spells the note at this pitch. @param {number} pitch */
  const staffSpelling = (pitch) =>
    melody
      ? spellMelody(
          melody.notes.map((n, i) => (i === melody.index ? { ...n, midi: pitch } : n)),
          key,
        )[melody.index]
      : spell(pitch, key);
  const { letter, accidental: now, octave } = parseSpelling(staffSpelling(midi));
  const choices = ACCIDENTALS.map(({ offset, symbol, name }) => {
    const target = letterToMidi(letter, octave, offset);
    const onPiano = target >= MIN_MIDI && target <= MAX_MIDI;
    const written = onPiano ? staffSpelling(target) : null;
    const shown = written === null ? null : parseSpelling(written);
    const differs = shown !== null && (shown.letter !== letter || shown.accidental !== offset);
    return {
      offset,
      label: letter + symbol,
      name: `${letter} ${name}`,
      midi: target,
      current: offset === now,
      onPiano,
      shownAs: differs && written ? pretty(written).replace(/-?\d+$/, "") : null,
    };
  });
  return { letter, octave, choices };
}
